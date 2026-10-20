const db = require('../db/db');
const express = require('express');
const router = express.Router();

// Resolve the mailer and totp adapter at call time so tests can stub them and the app runs without otpauth/qrcode.
const send = (message) => require('../lib/mailer').sendMail(message);
const totp = () => require('../lib/totp');
const { verifyPendingToken, nextAdminStep } = require('../lib/mfaPending');
const { isLocked, recordFailure, clearFailures } = require('../lib/lockout');
const { createAuthToken } = require('../lib/authTokens');
const { verifyEmail, appLink } = require('../lib/authEmails');
const { encryptSecret, decryptSecret } = require('../lib/mfaSecret');
const { replaceBackupCodes, useBackupCode } = require('../lib/backupCodes');
const { issueAdminSession } = require('../lib/sessions');

// Authenticates the pendingToken, loads the admin and requires the route's step; sets req.admin.
function requireStep(step) {
    return async (req, res, next) => {
        try {
            const pending = verifyPendingToken(req.body.pendingToken);
            if (!pending || pending.userType !== 'admin') {
                return res.status(401).json({ error: 'Invalid or expired token' });
            }
            const [rows] = await db.execute('SELECT * FROM admin WHERE id = ?', [pending.userId]);
            const row = rows[0];
            if (!row) return res.status(401).json({ error: 'Invalid or expired token' });
            if (row.disabled) return res.status(403).json({ error: 'Account disabled' });
            if (isLocked(row, new Date())) return res.status(423).json({ error: 'Account locked. Try again later.' });
            const current = nextAdminStep(row);
            if (step && current !== step) return res.status(409).json({ error: 'Wrong step', step: current });
            req.admin = row;
            next();
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'An internal error occurred.' });
        }
    };
}

// POST domain.com/api/admin/mfa/status
router.post('/status', requireStep(), (req, res) => {
    res.status(200).json({ step: nextAdminStep(req.admin) });
});

// POST domain.com/api/admin/mfa/email
// Email a verify link to the address the admin wants to use; the admin row only changes once it is confirmed.
router.post('/email', requireStep('verify_email'), async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    try {
        const [taken] = await db.execute('SELECT id FROM admin WHERE email = ? AND id <> ?', [email, req.admin.id]);
        if (taken.length > 0) return res.status(409).json({ error: 'Email already exists' });
        try {
            const raw = await createAuthToken(db, { purpose: 'verify_email', userType: 'admin', userId: req.admin.id, email, name: req.admin.name });
            await send({ to: email, ...verifyEmail({ name: req.admin.name, link: appLink(`/verify-email?token=${raw}`) }) });
        } catch (err) {
            console.error('Failed to send verification email', err);
            return res.status(502).json({ error: 'Could not send the verification email' });
        }
        res.status(200).json({ message: 'Verification link sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// POST domain.com/api/admin/mfa/totp/setup
// Generate and store an encrypted TOTP secret; the authenticator app enrolls from the returned uri/qr.
router.post('/totp/setup', requireStep('setup_totp'), async (req, res) => {
    try {
        const { generateSecret, keyUri, qrDataUrl } = totp();
        const secret = generateSecret();
        await db.execute('UPDATE admin SET totp_secret = ? WHERE id = ?', [encryptSecret(secret), req.admin.id]);
        const uri = keyUri(secret, req.admin.email);
        let qr = null;
        try {
            qr = await qrDataUrl(uri);
        } catch (err) {
            console.error('Failed to render TOTP QR code', err);
        }
        res.status(200).json({ secret, uri, qr });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// POST domain.com/api/admin/mfa/totp/enable
// Confirm the first code, activate TOTP, and issue the session with fresh backup codes.
router.post('/totp/enable', requireStep('setup_totp'), async (req, res) => {
    const row = req.admin;
    if (!row.totp_secret) return res.status(409).json({ error: 'Wrong step', step: 'setup_totp' });
    try {
        const step = totp().verifyCode(decryptSecret(row.totp_secret), req.body.code);
        if (step === null) {
            await recordFailure({ db, table: 'admin', row, now: new Date(), send });
            return res.status(400).json({ error: 'Invalid code' });
        }
        const [result] = await db.execute(
            'UPDATE admin SET totp_enabled_at = NOW(), totp_last_step = ? WHERE id = ? AND totp_enabled_at IS NULL',
            [step, row.id]
        );
        if (result.affectedRows !== 1) return res.status(409).json({ error: 'Wrong step', step: 'enter_code' });
        const backupCodes = await replaceBackupCodes(db, 'admin', row.id);
        const token = await issueAdminSession(db, row);
        res.status(200).json({ token, backupCodes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

const TOTP_CODE = /^\d{6}$/;

// Claims the TOTP step only if it is newer than the last used one, so a code can't be replayed.
async function claimTotpStep(row, code) {
    const step = totp().verifyCode(decryptSecret(row.totp_secret), code);
    if (step === null) return false;
    const [result] = await db.execute(
        'UPDATE admin SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
        [step, row.id, step]
    );
    return result.affectedRows === 1;
}

// POST domain.com/api/admin/mfa/verify
// Complete login with a TOTP code or an unused backup code.
router.post('/verify', requireStep('enter_code'), async (req, res) => {
    const row = req.admin;
    const code = String(req.body.code ?? '').trim();
    try {
        const isValid = TOTP_CODE.test(code) ? await claimTotpStep(row, code) : await useBackupCode(db, 'admin', row.id, code);
        if (!isValid) {
            await recordFailure({ db, table: 'admin', row, now: new Date(), send });
            return res.status(400).json({ error: 'Invalid code' });
        }
        await clearFailures({ db, table: 'admin', row });
        const token = await issueAdminSession(db, row);
        res.status(200).json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
