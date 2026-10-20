const db = require('../db/db');
const express = require('express');
const router = express.Router();

// Resolve the mailer and totp adapter at call time so tests can stub them and the app runs without otpauth/qrcode.
const send = (message) => require('../lib/mailer').sendMail(message);
const totp = () => require('../lib/totp');
const { authLimiter, credentialLimiter, verifyPassword } = require('../lib/auth');
const { verifyPendingToken } = require('../lib/mfaPending');
const { isLocked, recordFailure, clearFailures } = require('../lib/lockout');
const { encryptSecret, decryptSecret } = require('../lib/mfaSecret');
const { replaceBackupCodes, useBackupCode } = require('../lib/backupCodes');
const { issueClientSession } = require('../lib/sessions');
const isAuth = require('../middleware/isAuth');
const { requireClient } = require('../middleware/requireRole');

const INSTALL_ERROR = /npm install/;

const TOTP_CODE = /^\d{6}$/;

// Claims the TOTP step only if it is newer than the last used one, so a code can't be replayed.
async function claimTotpStep(row, code) {
    const step = totp().verifyCode(decryptSecret(row.totp_secret), code);
    if (step === null) return false;
    const [result] = await db.execute(
        'UPDATE clients SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
        [step, row.id, step]
    );
    return result.affectedRows === 1;
}

// POST domain.com/api/client/mfa/verify
// Complete login with a TOTP code or an unused backup code; authenticated by the pendingToken, not a session.
router.post('/verify', authLimiter, async (req, res) => {
    try {
        const pending = verifyPendingToken(req.body.pendingToken);
        if (!pending || pending.userType !== 'client') return res.status(401).json({ error: 'Invalid or expired token' });
        const [rows] = await db.execute('SELECT * FROM clients WHERE id = ?', [pending.userId]);
        const row = rows[0];
        if (!row) return res.status(401).json({ error: 'Invalid or expired token' });
        if (isLocked(row, new Date())) return res.status(423).json({ error: 'Account locked. Try again later.' });
        if (row.totp_enabled_at == null) return res.status(409).json({ error: 'Two-factor is not on' });
        const code = String(req.body.code ?? '').trim();
        const isValid = TOTP_CODE.test(code) ? await claimTotpStep(row, code) : await useBackupCode(db, 'client', row.id, code);
        if (!isValid) {
            await recordFailure({ db, table: 'clients', row, now: new Date(), send });
            return res.status(400).json({ error: 'Invalid code' });
        }
        await clearFailures({ db, table: 'clients', row });
        const token = await issueClientSession(db, row);
        res.status(200).json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

router.use(isAuth, requireClient);

// Loads the signed-in client into req.client.
router.use(async (req, res, next) => {
    try {
        const [rows] = await db.execute('SELECT * FROM clients WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Client not found' });
        req.client = rows[0];
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// GET domain.com/api/client/mfa/status
router.get('/status', (req, res) => {
    res.status(200).json({ enabled: req.client.totp_enabled_at != null });
});

// POST domain.com/api/client/mfa/totp/setup
// Generate and store an encrypted TOTP secret; the authenticator app enrolls from the returned uri/qr.
router.post('/totp/setup', authLimiter, async (req, res) => {
    const row = req.client;
    if (row.totp_enabled_at != null) return res.status(409).json({ error: 'Two-factor is already on' });
    try {
        const { generateSecret, keyUri, qrDataUrl } = totp();
        const secret = generateSecret();
        await db.execute('UPDATE clients SET totp_secret = ? WHERE id = ?', [encryptSecret(secret), row.id]);
        const uri = keyUri(secret, row.email);
        let qr = null;
        try {
            qr = await qrDataUrl(uri);
        } catch (err) {
            console.error('Failed to render TOTP QR code', err);
        }
        res.status(200).json({ secret, uri, qr });
    } catch (err) {
        if (INSTALL_ERROR.test(err.message)) return res.status(503).json({ error: 'Two-factor is not available yet' });
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// POST domain.com/api/client/mfa/totp/enable
// Confirm the first code, activate TOTP and return fresh backup codes.
router.post('/totp/enable', authLimiter, async (req, res) => {
    const row = req.client;
    if (row.totp_enabled_at != null || !row.totp_secret) return res.status(409).json({ error: 'Two-factor setup is not pending' });
    try {
        const step = totp().verifyCode(decryptSecret(row.totp_secret), req.body.code);
        if (step === null) {
            await recordFailure({ db, table: 'clients', row, now: new Date(), send });
            return res.status(400).json({ error: 'Invalid code' });
        }
        const [result] = await db.execute(
            'UPDATE clients SET totp_enabled_at = NOW(), totp_last_step = ? WHERE id = ? AND totp_enabled_at IS NULL',
            [step, row.id]
        );
        if (result.affectedRows !== 1) return res.status(409).json({ error: 'Two-factor is already on' });
        const backupCodes = await replaceBackupCodes(db, 'client', row.id);
        res.status(200).json({ backupCodes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// POST domain.com/api/client/mfa/totp/disable
// Turn two-factor off after re-checking the password.
router.post('/totp/disable', credentialLimiter, async (req, res) => {
    const row = req.client;
    try {
        if (!await verifyPassword(req.body.password, row.password)) {
            await recordFailure({ db, table: 'clients', row, now: new Date(), send });
            return res.status(400).json({ error: 'Password is incorrect' });
        }
        await db.execute('UPDATE clients SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?', [row.id]);
        await db.execute('DELETE FROM auth_backup_code WHERE user_type = ? AND user_id = ?', ['client', row.id]);
        res.status(200).json({ message: 'Two-factor turned off' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
