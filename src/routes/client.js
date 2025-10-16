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
        const [rows] = await db.execute('SELECT * FROM username WHERE username = ?', [username]);
        if(rows.length == 0){
            return res.status(404).json({error: 'No users found with username'});
        }
        const isValidPassword = await bcrypt.compare(password, rows[0].password);
        if(!isValidPassword){
            return res.status(400).json({error: 'Invalid Password'})
        }
        const token = jwt.sign(
            {username: rows[0].username, name: rows[0].name, id: rows[0].id},
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
    const {username, name, password} = req.body;
    if(!username){
        return res.status(400).json({error: 'Username is required'});
    }

    try{
        const [rows] = await db.execute('SELECT * FROM client WHERE username = ?', [username]);
        if(rows.length == 0){
            const hashedPass = await bcrypt.hash(password, 10);
            try{
                const [result] = await db.execute(
                    `INSERT INTO client (username, name, password) VALUES (?, ?, ?)`,
                    [username, name, hashedPass]
                );
                res.status(201).json({id: result.insertId, username, name})
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


module.exports = router;