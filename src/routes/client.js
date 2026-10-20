const db = require('../db/db');
const express = require('express');
const router = express.Router();

// Resolve the mailer at send time so tests can stub it.
const send = (message) => require('../lib/mailer').sendMail(message);
const LOCKED_RESPONSE = { error: 'Account locked. Try again later.' };
const { hashPassword, verifyPassword, authLimiter, credentialLimiter } = require('../lib/auth');
const { issueClientSession, revokeSession, revokeAllSessions } = require('../lib/sessions');
const { isLocked, recordFailure, clearFailures } = require('../lib/lockout');
const isAuth = require('../middleware/isAuth');
const { requireAdmin, requireClient } = require('../middleware/requireRole');

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
// Authenticate a client with username and password. Returns a signed JWT token on success. Reads: clients table.
router.post('/login', authLimiter, async(req,res) =>{
    const {username, password} = req.body;
    try{
        const [rows] = await db.execute('SELECT * FROM clients WHERE username = ?', [username]);
        if(rows.length == 0){
            return res.status(404).json({error: 'No users found with username'});
        }
        if (isLocked(rows[0], new Date())) {
            return res.status(423).json(LOCKED_RESPONSE);
        }
        const isValidPassword = await verifyPassword(password, rows[0].password);
        if(!isValidPassword){
            await recordFailure({ db, table: 'clients', row: rows[0], now: new Date(), send });
            return res.status(400).json({error: 'Invalid Password'})
        }
        await clearFailures({ db, table: 'clients', row: rows[0] });
        const token = await issueClientSession(db, rows[0]);
        res.status(200).json({message: 'Login Success', token})
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'An internal error occured while logging in.'});
    }
});

// POST domain.com/api/client/register
// Register a new client account with username, name, password, and company_id. Affects: clients table.
router.post('/register', authLimiter, isAuth, requireAdmin(3), async(req,res) =>{
    const {username, name, password, company_id} = req.body;
    if(!username){
        return res.status(400).json({error: 'Username is required'});
    }
    
    if(!name){
        return res.status(400).json({error: 'Name is required'});
    }
    
    if(!password){
        return res.status(400).json({error: 'Password is required'});
    }
    
    if(company_id === undefined || company_id === null || isNaN(company_id)){
        return res.status(400).json({error: 'Valid company ID is required'});
    }

    try{
        const [rows] = await db.execute('SELECT * FROM clients WHERE username = ?', [username]);
        if(rows.length == 0){
            const hashedPass = await hashPassword(password);
            try{
                const [result] = await db.execute(
                    `INSERT INTO clients (username, name, password, company_id) VALUES (?, ?, ?, ?)`,
                    [username, name, hashedPass, parseInt(company_id)]
                );
                res.status(201).json({id: result.insertId, username, name, company_id: parseInt(company_id)})
            }catch(e){
                console.error(e);
                res.status(500).json({error: 'An error occured when registering client'})
            }
        }else{
            res.status(409).json({error: 'User with username exists'})
        }
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'An error occured when fetching client username'})
    }
})

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

// PUT domain.com/api/client/change-username
// Change the signed-in client's username after verifying the password. Affects: clients table.
router.put('/change-username', credentialLimiter, isAuth, requireClient, async (req, res) => {
    const { newUsername, password } = req.body;
    
    if (!newUsername || !password) {
        return res.status(400).json({ error: 'New username and password are required' });
    }
    
    try {
        const [rows] = await db.execute('SELECT * FROM clients WHERE id = ?', [req.user.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const isValidPassword = await verifyPassword(password, rows[0].password);
        if (!isValidPassword) {
            await recordFailure({ db, table: 'clients', row: rows[0], now: new Date(), send });
            return res.status(400).json({ error: 'Password is incorrect' });
        }
        
        // Check if new username already exists
        const [existingRows] = await db.execute('SELECT * FROM clients WHERE username = ?', [newUsername]);
        if (existingRows.length > 0) {
            return res.status(409).json({ error: 'Username already exists' });
        }
        
        await db.execute('UPDATE clients SET username = ? WHERE id = ?', [newUsername, req.user.id]);
        
        res.status(200).json({ message: 'Username updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating username' });
    }
});


module.exports = router;
