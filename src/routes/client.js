const db = require('../db/db');
const express = require('express');
const router = express.Router();

// Resolve the mailer at send time so tests can stub it.
const send = (message) => require('../lib/mailer').sendMail(message);
const INVALID_LOGIN_RESPONSE = { error: 'Invalid email or password' };
const LOCKED_RESPONSE = { error: 'Account locked. Try again later.' };
const { hashPassword, verifyPassword, authLimiter, credentialLimiter } = require('../lib/auth');
const { issueClientSession, revokeSession, revokeAllSessions } = require('../lib/sessions');
const { signPendingToken } = require('../lib/mfaPending');
const { isLocked, recordFailure, clearFailures } = require('../lib/lockout');
const { requestReset, completeReset } = require('../lib/passwordReset');
const { createAuthToken, findAuthToken, consumeAuthToken } = require('../lib/authTokens');
const { inviteEmail, appLink } = require('../lib/authEmails');
const isAuth = require('../middleware/isAuth');
const { requireAdmin, requireClient } = require('../middleware/requireRole');

router.use('/mfa', require('./clientMfa'));

// GET domain.com/api/client/
// Retrieve all client records. Reads: client table.
router.get('/', isAuth, requireAdmin(3), async (req, res)=>{
    try {
        const [rows] = await db.execute('SELECT * FROM client;');
        if (rows.length > 0) {
            res.status(200).json(rows);
        } else {
            res.status(404).json({ error: 'Clients not found.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while retrieving the client.' });
    }
})

// POST domain.com/api/client/login
// Authenticate a client with a verified email and password. Returns a signed JWT token on success. Reads: clients table.
router.post('/login', authLimiter, async(req,res) =>{
    const {password} = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    try{
        const [rows] = await db.execute('SELECT * FROM clients WHERE email = ? AND email_verified_at IS NOT NULL', [email]);
        if(rows.length == 0){
            return res.status(401).json(INVALID_LOGIN_RESPONSE);
        }
        if (isLocked(rows[0], new Date())) {
            return res.status(423).json(LOCKED_RESPONSE);
        }
        const isValidPassword = await verifyPassword(password, rows[0].password);
        if(!isValidPassword){
            await recordFailure({ db, table: 'clients', row: rows[0], now: new Date(), send });
            return res.status(401).json(INVALID_LOGIN_RESPONSE);
        }
        await clearFailures({ db, table: 'clients', row: rows[0] });
        if (rows[0].totp_enabled_at != null) {
            return res.status(200).json({ message: 'Two-factor required', step: 'enter_code', pendingToken: signPendingToken('client', rows[0].id) });
        }
        const token = await issueClientSession(db, rows[0]);
        res.status(200).json({message: 'Login Success', token})
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'An internal error occured while logging in.'});
    }
});

// POST domain.com/api/client/invite
// Email a single-use signup link to a prospective client contact. Affects: auth_token table.
router.post('/invite', authLimiter, isAuth, requireAdmin(3), async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const companyId = Number(req.body.company_id);
    if (!email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    if (req.body.company_id === undefined || req.body.company_id === null || req.body.company_id === '' || isNaN(companyId)) {
        return res.status(400).json({ error: 'Valid company ID is required' });
    }

    try {
        const [companies] = await db.execute('SELECT id, name FROM company WHERE id = ?', [companyId]);
        if (companies.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        const [existing] = await db.execute('SELECT * FROM clients WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'User with email exists' });
        }
        const raw = await createAuthToken(db, { purpose: 'invite', userType: 'client', email, name, companyId, createdBy: req.user.id });
        const link = appLink(`/accept-invite?token=${raw}`);
        try {
            await send({ to: email, ...inviteEmail({ name, companyName: companies[0].name, link }) });
        } catch (err) {
            console.error(err);
            return res.status(502).json({ error: 'Could not send the invite email' });
        }
        res.status(201).json({ message: 'Invite sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occured when inviting client' });
    }
});

// POST domain.com/api/client/accept-invite
// Create the client from an emailed invite token and a chosen password. Affects: clients, auth_token, auth_session.
router.post('/accept-invite', authLimiter, async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
    }
    try {
        const lookup = { purpose: 'invite', userType: 'client', token };
        const pending = await findAuthToken(db, lookup);
        if (!pending) {
            return res.status(400).json({ error: 'Invalid or expired link' });
        }
        const [existing] = await db.execute('SELECT * FROM clients WHERE email = ?', [pending.email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'User with email exists' });
        }
        // Consuming after the checks keeps a conflicting accept from burning the invite; null here means a race.
        const invite = await consumeAuthToken(db, lookup);
        if (!invite) {
            return res.status(400).json({ error: 'Invalid or expired link' });
        }
        const [result] = await db.execute(
            'INSERT INTO clients (email, name, password, company_id, email_verified_at) VALUES (?, ?, ?, ?, NOW())',
            [invite.email, invite.name, await hashPassword(password), invite.company_id]
        );
        const sessionToken = await issueClientSession(db, { id: result.insertId, name: invite.name, company_id: invite.company_id });
        res.status(201).json({ message: 'Account created', token: sessionToken });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occured while accepting the invite.' });
    }
});

// PUT domain.com/api/client/change-password
// Change the signed-in client's password after verifying the current password. Affects: clients table.
router.put('/change-password', credentialLimiter, isAuth, requireClient, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    try {
        const [rows] = await db.execute('SELECT * FROM clients WHERE id = ?', [req.user.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        if (isLocked(rows[0], new Date())) {
            return res.status(423).json({ error: 'Account locked. Try again later.' });
        }

        const isValidPassword = await verifyPassword(currentPassword, rows[0].password);
        if (!isValidPassword) {
            await recordFailure({ db, table: 'clients', row: rows[0], now: new Date(), send });
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        const hashedNewPassword = await hashPassword(newPassword);
        
        await db.execute('UPDATE clients SET password = ? WHERE id = ?', [hashedNewPassword, req.user.id]);
        await revokeAllSessions(db, 'client', req.user.id, { exceptSid: req.user.sid });
        
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating password' });
    }
});

// POST domain.com/api/client/logout
// Revoke the caller's session. Affects: auth_session table.
router.post('/logout', isAuth, requireClient, async (req, res) => {
    try {
        await revokeSession(db, req.user.sid);
        res.status(200).json({ message: 'Logged out' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while logging out' });
    }
});

// POST domain.com/api/client/forgot-password
// Emails a single-use reset link when the email is known. Always 200 so it can't be used to probe accounts.
router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        await requestReset({ db, userType: 'client', email: req.body.email, send });
    } catch (err) {
        console.error(err);
    }
    res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
});

// POST domain.com/api/client/reset-password
// Sets a new password from an emailed token and signs out every session. Affects: clients, auth_token, auth_session.
router.post('/reset-password', authLimiter, async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }
    try {
        if (!await completeReset({ db, userType: 'client', token, newPassword })) {
            return res.status(400).json({ error: 'Invalid or expired link' });
        }
        res.status(200).json({ message: 'Password reset' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occured while resetting the password.' });
    }
});

module.exports = router;
