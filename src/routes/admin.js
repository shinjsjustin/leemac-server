const db = require('../db/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const express = require('express');
const router = express.Router();

router.post('/login', async(req,res) =>{
    const {email, password} = req.body;
    try{
        const [rows] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
        if(rows.length == 0){
            return res.status(404).json({error: 'No users found with email'});
        }
        const isValidPassword = await bcrypt.compare(password, rows[0].password);
        if(!isValidPassword){
            return res.status(400).json({error: 'Invalid Password'})
        }
        const token = jwt.sign(
            {email: rows[0].email, id: rows[0].id, access: rows[0].access_level},
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
    const {name, email, password, title} = req.body;
    if(!email){
        return res.status(400).json({error: 'Email is required'});
    }

    try{
        const [rows] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
        if(rows.length == 0){
            const hashedPass = await bcrypt.hash(password, 10);
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
})



module.exports = router;