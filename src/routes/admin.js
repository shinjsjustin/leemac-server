const db = require('../db/db');
const express = require('express');
const router = express.Router();

// Resolve the mailer at send time so tests can stub it.
const send = (message) => require('../lib/mailer').sendMail(message);
const LOCKED_RESPONSE = { error: 'Account locked. Try again later.' };
const { hashPassword, verifyPassword, authLimiter, credentialLimiter } = require('../lib/auth');
const { revokeSession, revokeAllSessions } = require('../lib/sessions');
const { signPendingToken, nextAdminStep } = require('../lib/mfaPending');
const { isLocked, recordFailure, clearFailures } = require('../lib/lockout');
const { requestReset, completeReset } = require('../lib/passwordReset');
const { createAuthToken, findAuthToken, consumeAuthToken } = require('../lib/authTokens');
const { verifyEmail, appLink } = require('../lib/authEmails');
const isAuth = require('../middleware/isAuth');
const { requireAdmin } = require('../middleware/requireRole');

// POST domain.com/api/admin/login
// Authenticate an admin user with email and password. Returns a signed JWT token on success. Reads: admin table.
router.post('/login', authLimiter, async(req,res) =>{
    const {email, password} = req.body;
    try{
        const [rows] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
        if(rows.length == 0){
            return res.status(404).json({error: 'No users found with email'});
        }
        
        if (rows[0].disabled) {
            return res.status(403).json({error: 'Account disabled'});
        }

        if (isLocked(rows[0], new Date())) {
            return res.status(423).json(LOCKED_RESPONSE);
        }

        // Check if user has a password (not OAuth-only account)
        if (!rows[0].password) {
            return res.status(400).json({error: 'This account uses Google login. Please use "Login with Google"'});
        }
        
        const isValidPassword = await verifyPassword(password, rows[0].password);
        if(!isValidPassword){
            await recordFailure({ db, table: 'admin', row: rows[0], now: new Date(), send });
            return res.status(400).json({error: 'Invalid Password'})
        }
        await clearFailures({ db, table: 'admin', row: rows[0] });
        const pendingToken = signPendingToken('admin', rows[0].id);
        res.status(200).json({message: 'Two-factor required', step: nextAdminStep(rows[0]), pendingToken})
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'An internal error occured while logging in.'});
    }
});

// POST domain.com/api/admin/register
// Register a new admin account with name, email, password, and title. Affects: admin table.
router.post('/register', authLimiter, isAuth, requireAdmin(3), async(req,res) =>{
    const {name, email, password, title} = req.body;
    if(!email){
        return res.status(400).json({error: 'Email is required'});
    }

    try{
        const [rows] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
        if(rows.length == 0){
            const hashedPass = await hashPassword(password);
            try{
                const [result] = await db.execute(
                    `INSERT INTO admin (name, title, access_level, email, password) VALUES (?,?,?,?,?)`,
                    [name, title, 0, email, hashedPass]
                );
                res.status(201).json({id: result.insertId, name, email})
            }catch(e){
                console.error(e);
                res.status(500).json({error: 'An error occured when registering admin'})
            }
        }else{
            res.status(409).json({error: 'User with email exists'})
        }
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'An error occured when fetching admin email'})
    }
});

// PUT domain.com/api/admin/change-password
// Change an admin's password after verifying the current password. Affects: admin table.
router.put('/change-password', credentialLimiter, isAuth, requireAdmin(0), async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password, and new password are required' });
    }
    
    try {
        const [rows] = await db.execute('SELECT * FROM admin WHERE id = ?', [req.user.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        if (isLocked(rows[0], new Date())) {
            return res.status(423).json({ error: 'Account locked. Try again later.' });
        }

        // Check if user has a password (not OAuth-only account)
        if (!rows[0].password) {
            return res.status(400).json({ error: 'Cannot change password for Google OAuth accounts' });
        }

        const isValidPassword = await verifyPassword(currentPassword, rows[0].password);
        if (!isValidPassword) {
            await recordFailure({ db, table: 'admin', row: rows[0], now: new Date(), send });
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        const hashedNewPassword = await hashPassword(newPassword);
        
        await db.execute('UPDATE admin SET password = ? WHERE id = ?', [hashedNewPassword, req.user.id]);
        await revokeAllSessions(db, 'admin', req.user.id, { exceptSid: req.user.sid });
        
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating password' });
    }
});

// POST domain.com/api/admin/logout
// Revoke the caller's session. Affects: auth_session table.
router.post('/logout', isAuth, requireAdmin(0), async (req, res) => {
    try {
        await revokeSession(db, req.user.sid);
        res.status(200).json({ message: 'Logged out' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while logging out' });
    }
});

// Emails a single-use verify_email link for `email`; the address only changes once the link is confirmed.
async function sendVerifyLink(adminId, name, email) {
    const raw = await createAuthToken(db, { purpose: 'verify_email', userType: 'admin', userId: adminId, email, name });
    await send({ to: email, ...verifyEmail({ name, link: appLink(`/verify-email?token=${raw}`) }) });
}

// PUT domain.com/api/admin/change-email
// Verify the password, then email a link to the new address. Affects: auth_token table.
router.put('/change-email', credentialLimiter, isAuth, requireAdmin(0), async (req, res) => {
    const { newEmail, password } = req.body;
    
    if (!newEmail || !password) {
        return res.status(400).json({ error: 'New email and password are required' });
    }
    
    try {
        const [rows] = await db.execute('SELECT * FROM admin WHERE id = ?', [req.user.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        
        // Check if user has a password (not OAuth-only account)
        if (!rows[0].password) {
            return res.status(400).json({ error: 'Cannot change email for Google OAuth accounts' });
        }
        
        const isValidPassword = await verifyPassword(password, rows[0].password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Password is incorrect' });
        }
        
        // Check if new email already exists
        const email = newEmail.trim().toLowerCase();
        const [existingRows] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
        if (existingRows.length > 0) {
            return res.status(409).json({ error: 'Email already exists' });
        }

        try {
            await sendVerifyLink(req.user.id, rows[0].name, email);
        } catch (err) {
            console.error('Failed to send verification email', err);
            return res.status(502).json({ error: 'Could not send the verification email' });
        }

        res.status(200).json({ message: 'Verification link sent to the new email' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating email' });
    }
});

// POST domain.com/api/admin/verify-email
// Email a verification link to the admin's current address. Affects: auth_token table.
router.post('/verify-email', credentialLimiter, isAuth, requireAdmin(0), async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM admin WHERE id = ?', [req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        try {
            await sendVerifyLink(req.user.id, rows[0].name, rows[0].email);
        } catch (err) {
            console.error('Failed to send verification email', err);
            return res.status(502).json({ error: 'Could not send the verification email' });
        }
        res.status(200).json({ message: 'Verification link sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while sending the verification email' });
    }
});

// POST domain.com/api/admin/verify-email/confirm
// Set the admin's email from an emailed token and mark it verified. Affects: admin, auth_token.
router.post('/verify-email/confirm', authLimiter, async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }
    const invalid = { error: 'Invalid or expired link' };
    try {
        const found = await findAuthToken(db, { purpose: 'verify_email', userType: 'admin', token });
        if (!found) {
            return res.status(400).json(invalid);
        }
        const [[owner]] = await db.execute('SELECT disabled FROM admin WHERE id = ?', [found.user_id]);
        if (!owner || owner.disabled) {
            return res.status(400).json(invalid);
        }
        const [taken] = await db.execute('SELECT id FROM admin WHERE email = ? AND id <> ?', [found.email, found.user_id]);
        if (taken.length > 0) {
            return res.status(409).json({ error: 'Email already exists' });
        }
        if (!await consumeAuthToken(db, { purpose: 'verify_email', userType: 'admin', token })) {
            return res.status(400).json(invalid);
        }
        await db.execute('UPDATE admin SET email = ?, email_verified_at = NOW() WHERE id = ?', [found.email, found.user_id]);
        res.status(200).json({ message: 'Email verified' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while verifying the email' });
    }
});

// POST domain.com/api/admin/forgot-password
// Emails a single-use reset link when the email is known. Always 200 so it can't be used to probe accounts.
router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        await requestReset({ db, userType: 'admin', email: req.body.email, send });
    } catch (err) {
        console.error(err);
    }
    res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
});

// POST domain.com/api/admin/reset-password
// Sets a new password from an emailed token and signs out every session. Affects: admin, auth_token, auth_session.
router.post('/reset-password', authLimiter, async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }
    try {
        if (!await completeReset({ db, userType: 'admin', token, newPassword })) {
            return res.status(400).json({ error: 'Invalid or expired link' });
        }
        res.status(200).json({ message: 'Password reset' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An internal error occured while resetting the password.' });
    }
});

router.use('/mfa', authLimiter, require('./adminMfa'));

module.exports = router;