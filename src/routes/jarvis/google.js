// src/routes/jarvis/google.js
// Jarvis-specific Google OAuth flow that requests gmail.readonly scope.
// The main admin login (oAuth.js) does not include Gmail scope — this adds it.

const express = require('express');
const { google } = require('googleapis');
const db = require('../../db/db');
const { getRecentEmails } = require('../../lib/google/gmail');

const router = express.Router();

function requireOwner(req, res, next) {
  if (!req.user || req.user.access < 3) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.JARVIS_GOOGLE_REDIRECT_URL ||
      process.env.REDIRECT_URL ||
      'http://localhost:3001/api/jarvis/google/callback'
  );
}

// GET /api/jarvis/google/auth
// Redirects the owner to Google consent screen with gmail + calendar scopes.
router.get('/auth', requireOwner, (req, res) => {
  const client = buildOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  });
  res.redirect(url);
});

// GET /api/jarvis/google/auth-url
// Returns the consent URL so the client can fetch it with Authorization headers
// and then navigate the browser to Google without exposing the JWT in the URL.
router.get('/auth-url', requireOwner, (req, res) => {
  const client = buildOAuth2Client();
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  });


    // GET /api/jarvis/google/check
    // Quick sanity check for Gmail authorization. Returns recent email data for the owner.
    router.get('/check', requireOwner, async (req, res) => {
      try {
        const emails = await getRecentEmails({ adminId: req.user.id });
        res.json({ count: emails.length, emails });
      } catch (err) {
        console.error('Jarvis Google check failed:', err);
        res.status(500).json({ error: err.message || 'Failed to check Gmail access' });
      }
    });
  res.json({ authUrl });
});

// NOTE: The /callback route lives in google-callback.js and is mounted in
// server.js WITHOUT isAuth — Google redirects don't carry an Authorization header.

module.exports = router;
