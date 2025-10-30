const db = require('../db/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const express = require('express');
const router = express.Router();

router.get('/', async (req, res)=>{
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

router.post('/login', async(req,res) =>{
    const {username, password} = req.body;
    try{
        const [rows] = await db.execute('SELECT * FROM clients WHERE username = ?', [username]);
        if(rows.length == 0){
            return res.status(404).json({error: 'No users found with username'});
        }
        const isValidPassword = await bcrypt.compare(password, rows[0].password);
        if(!isValidPassword){
            return res.status(400).json({error: 'Invalid Password'})
        }
        const token = jwt.sign(
            {username: rows[0].username, name: rows[0].name, id: rows[0].id, company_id: rows[0].company_id},
            process.env.JWT_SECRET,
            {expiresIn: '8h'}
        );
        res.status(200).json({message: 'Login Success', token})
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'An internal error occured while logging in.'});
    }
});

router.post('/register', async(req,res) =>{
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
            const hashedPass = await bcrypt.hash(password, 10);
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

router.put('/change-password', async (req, res) => {
    const { username, currentPassword, newPassword } = req.body;
    
    if (!username || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Username, current password, and new password are required' });
    }
    
    try {
        const [rows] = await db.execute('SELECT * FROM clients WHERE username = ?', [username]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const isValidPassword = await bcrypt.compare(currentPassword, rows[0].password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        
        await db.execute('UPDATE clients SET password = ? WHERE username = ?', [hashedNewPassword, username]);
        
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating password' });
    }
});

router.put('/change-username', async (req, res) => {
    const { currentUsername, newUsername, password } = req.body;
    
    if (!currentUsername || !newUsername || !password) {
        return res.status(400).json({ error: 'Current username, new username, and password are required' });
    }
    
    try {
        const [rows] = await db.execute('SELECT * FROM clients WHERE username = ?', [currentUsername]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const isValidPassword = await bcrypt.compare(password, rows[0].password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Password is incorrect' });
        }
        
        // Check if new username already exists
        const [existingRows] = await db.execute('SELECT * FROM clients WHERE username = ?', [newUsername]);
        if (existingRows.length > 0) {
            return res.status(409).json({ error: 'Username already exists' });
        }
        
        await db.execute('UPDATE clients SET username = ? WHERE username = ?', [newUsername, currentUsername]);
        
        res.status(200).json({ message: 'Username updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating username' });
    }
});


module.exports = router;