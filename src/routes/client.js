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
            res.status(404).json({ error: 'Employees not found.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while retrieving the employee.' });
    }
})

router.post('/login', async(req,res) =>{
    const {email, password} = req.body;
    try{
        const [rows] = await db.execute('SELECT * FROM client WHERE email = ?', [email]);
        if(rows.length == 0){
            return res.status(404).json({error: 'No users found with email'});
        }
        const isValidPassword = await bcrypt.compare(password, rows[0].password);
        if(!isValidPassword){
            return res.status(400).json({error: 'Invalid Password'})
        }
        const token = jwt.sign(
            {name: rows[0].name, email: rows[0].email, id: rows[0].id},
            process.env.JWT_SECRET,
            {expiresIn: '1h'}
        );
        res.status(200).json({message: 'Login Success', token})
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'An internal error occured while logging in.'});
    }
});

router.post('/register', async(req,res) =>{
    const {name, email, phone, company, address, payable, password} = req.body;
    if(!email){
        return res.status(400).json({error: 'Email is required'});
    }

    try{
        const [rows] = await db.execute('SELECT * FROM client WHERE email = ?', [email]);
        if(rows.length == 0){
            const hashedPass = await bcrypt.hash(password, 10);
            try{
                const [result] = await db.execute(
                    `INSERT INTO client (name, email, phone, company, address, payable, password) VALUES (?,?,?,?,?,?,?)`,
                    [name, email, phone, company, address, payable, hashedPass]
                );
                res.status(201).json({id: result.insertId, name, email})
            }catch(e){
                console.error(e);
                res.status(500).json({error: 'An error occured when registering client'})
            }
        }else{
            res.status(409).json({error: 'User with email exists'})
        }
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'An error occured when fetching client email'})
    }
})


module.exports = router;