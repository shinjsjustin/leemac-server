// src/routes/jarvis/google-callback.js
// Public callback route — no JWT required because this is a browser redirect from Google.
// Mounted in server.js BEFORE isAuth so the Authorization header check is bypassed.

const express = require('express');
const { google } = require('googleapis');
const db = require('../../db/db');

const router = express.Router();

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.JARVIS_GOOGLE_REDIRECT_URL ||
      'http://localhost:3001/api/jarvis/google/callback'
  );
}

// GET /api/jarvis/google/callback
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

    // Only overwrite google_refresh_token when Google returns a new one.
    // Google omits it on repeat authorizations; COALESCE preserves the stored value.
    await db.execute(
      `UPDATE admin
          SET google_access_token  = ?,
              google_refresh_token = COALESCE(?, google_refresh_token)
        WHERE id = ?`,
      [tokens.access_token, tokens.refresh_token ?? null, rows[0].id]
    );

    res.redirect(`${clientUrl}/jarvis?google_connected=1`);
  } catch (err) {
    console.error('Jarvis Google callback error:', err);
    res.redirect(`${clientUrl}/jarvis?google_error=1`);
  }
});

module.exports = router;
