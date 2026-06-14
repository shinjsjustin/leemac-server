// src/routes/jarvis/google.js
// Jarvis-specific Google OAuth flow that requests gmail.readonly scope.
// The main admin login (oAuth.js) does not include Gmail scope — this adds it.

const express = require('express');
const { google } = require('googleapis');
const db = require('../../db/db');

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

// GET /api/jarvis/google/callback
// Exchanges the auth code for tokens and stores them on the admin row.
// No JWT required here since this is a browser redirect from Google.
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  if (error || !code) {
    console.error('Google OAuth callback error:', error);
    return res.redirect(`${clientUrl}/jarvis?google_error=1`);
  }

  try {
    const client = buildOAuth2Client();
    const { tokens } = await client.getToken(code);

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    const [rows] = await db.execute('SELECT id FROM admin WHERE email = ?', [profile.email]);
    if (!rows.length) {
      return res.redirect(`${clientUrl}/jarvis?google_error=no_admin`);
    }

    await db.execute(
      'UPDATE admin SET google_access_token = ?, google_refresh_token = ? WHERE id = ?',
      [tokens.access_token, tokens.refresh_token || null, rows[0].id]
    );

    res.redirect(`${clientUrl}/jarvis?google_connected=1`);
  } catch (err) {
    console.error('Jarvis Google callback error:', err);
    res.redirect(`${clientUrl}/jarvis?google_error=1`);
  }
});

module.exports = router;
