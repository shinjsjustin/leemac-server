const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const router = express.Router();

// Configure Google OAuth strategy
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URL || "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const googleId = profile.id;
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const picture = profile.photos[0].value;

        // Check if user exists with Google ID
        let [rows] = await db.execute('SELECT * FROM admin WHERE google_id = ?', [googleId]);
        
        if (rows.length > 0) {
            // User exists with Google ID, update profile picture and tokens
            await db.execute(
                'UPDATE admin SET profile_picture = ?, google_access_token = ?, google_refresh_token = ? WHERE google_id = ?',
                [picture, accessToken, refreshToken, googleId]
            );
            const [updatedRows] = await db.execute('SELECT * FROM admin WHERE google_id = ?', [googleId]);
            return done(null, updatedRows[0]);
        }

        // Check if user exists with email but no Google ID
        [rows] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
        
        if (rows.length > 0) {
            // Link Google account to existing admin account
            await db.execute(
                'UPDATE admin SET google_id = ?, profile_picture = ?, google_access_token = ?, google_refresh_token = ? WHERE email = ?',
                [googleId, picture, accessToken, refreshToken, email]
            );
            const [updatedRows] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
            return done(null, updatedRows[0]);
        }

        // Create new admin account with Google OAuth
        const [result] = await db.execute(
            `INSERT INTO admin (name, email, google_id, profile_picture, access_level, title, password, google_access_token, google_refresh_token) VALUES (?,?,?,?,?,?,?,?,?)`,
            [name, email, googleId, picture, 1, 'Google User', null, accessToken, refreshToken]
        );

        const [newUser] = await db.execute('SELECT * FROM admin WHERE id = ?', [result.insertId]);
        return done(null, newUser[0]);
        
    } catch (error) {
        console.error('OAuth Error:', error);
        return done(error, null);
    }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
    done(null, user);
});

// Routes
router.get('/google', 
    passport.authenticate('google', { 
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'],
        accessType: 'offline',
        prompt: 'consent'
    })
);

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login-admin' }),
    (req, res) => {
        try {
            // Generate JWT token for the authenticated user
            const token = jwt.sign(
                {
                    email: req.user.email,
                    id: req.user.id,
                    access: req.user.access_level
                },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            );

            // Redirect to client with token as query parameter
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
            res.redirect(`${clientUrl}?token=${token}`);
        } catch (error) {
            console.error('Token generation error:', error);
            res.redirect('/login-admin?error=auth_failed');
        }
    }
);

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.redirect(process.env.CLIENT_URL || 'http://localhost:3000');
    });
});

router.get('/user', (req, res) => {
    if (req.user) {
        res.json(req.user);
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

module.exports = router;
