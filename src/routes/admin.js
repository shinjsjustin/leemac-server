const db = require('../db/db');
const express = require('express');
const router = express.Router();
const { hashPassword, verifyPassword, authLimiter, credentialLimiter } = require('../lib/auth');
const { issueAdminSession, revokeSession, revokeAllSessions } = require('../lib/sessions');
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

        // Check if user has a password (not OAuth-only account)
        if (!rows[0].password) {
            return res.status(400).json({error: 'This account uses Google login. Please use "Login with Google"'});
        }
        
        const isValidPassword = await verifyPassword(password, rows[0].password);
        if(!isValidPassword){
            return res.status(400).json({error: 'Invalid Password'})
        }
        const token = await issueAdminSession(db, rows[0]);
        res.status(200).json({message: 'Login Success', token})
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
        
        // Check if user has a password (not OAuth-only account)
        if (!rows[0].password) {
            return res.status(400).json({ error: 'Cannot change password for Google OAuth accounts' });
        }
        
        const isValidPassword = await verifyPassword(currentPassword, rows[0].password);
        if (!isValidPassword) {
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

// PUT domain.com/api/admin/change-email
// Change an admin's email address after verifying the current password. Affects: admin table.
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
        const [existingRows] = await db.execute('SELECT * FROM admin WHERE email = ?', [newEmail]);
        if (existingRows.length > 0) {
            return res.status(409).json({ error: 'Email already exists' });
        }
        
        await db.execute('UPDATE admin SET email = ? WHERE id = ?', [newEmail, req.user.id]);
        
        res.status(200).json({ message: 'Email updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating email' });
    }
});

module.exports = router;