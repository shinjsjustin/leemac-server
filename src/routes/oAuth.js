const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { findGoogleAdmin } = require('../lib/googleAdminLogin');
const { signPendingToken } = require('../lib/mfaPending');
const db = require('../db/db');
const router = express.Router();

// Configure Google OAuth strategy
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URL || "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const admin = await findGoogleAdmin({ db, profile, accessToken, refreshToken });
        return done(null, admin || false);
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
    async (req, res) => {
        try {
            // No session yet: the client finishes the two-factor steps first
            const pending = signPendingToken('admin', req.user.id);
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
            res.redirect(`${clientUrl}/two-factor?pending=${encodeURIComponent(pending)}`);
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
