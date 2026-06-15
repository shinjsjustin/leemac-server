// src/routes/jarvis/google.js
// Jarvis-specific Google OAuth flow that requests gmail.readonly scope.
// The main admin login (oAuth.js) does not include Gmail scope — this adds it.

const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { getRecentEmails } = require('../../lib/google/gmail');

const router = express.Router();

const JARVIS_GOOGLE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

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

// Signs a short-lived state token so the callback (which carries no Authorization
// header) can reliably identify which admin authorized Google access — instead of
// guessing by matching the Google account email against the admin table.
function buildAuthUrl(adminId) {
  const client = buildOAuth2Client();
  const state = jwt.sign({ adminId }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: JARVIS_GOOGLE_SCOPES,
    state,
  });
}

// GET /api/jarvis/google/auth
// Redirects the owner to Google consent screen with gmail + calendar scopes.
router.get('/auth', requireOwner, (req, res) => {
  res.redirect(buildAuthUrl(req.user.id));
});

// GET /api/jarvis/google/auth-url
// Returns the consent URL so the client can fetch it with Authorization headers
// and then navigate the browser to Google without exposing the JWT in the URL.
router.get('/auth-url', requireOwner, (req, res) => {
  res.json({ authUrl: buildAuthUrl(req.user.id) });
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

// NOTE: The /callback route lives in google-callback.js and is mounted in
// server.js WITHOUT isAuth — Google redirects don't carry an Authorization header.

module.exports = router;
