// src/lib/google/oauth.js
// Creates an authenticated Google OAuth2 client from a stored admin token with auto-refresh.

const { google } = require('googleapis');
const db = require('../../db/db');

async function getOAuth2Client(adminId) {
  const [rows] = await db.execute(
    'SELECT google_access_token, google_refresh_token FROM admin WHERE id = ?',
    [adminId]
  );

  if (!rows.length || !rows[0].google_refresh_token) {
    throw new Error('Admin has not authorized Google access. Visit /api/jarvis/google/auth to connect.');
  }

  const client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URL || 'http://localhost:3001/auth/google/callback'
  );

  client.setCredentials({
    access_token: rows[0].google_access_token,
    refresh_token: rows[0].google_refresh_token,
  });

  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.execute('UPDATE admin SET google_access_token = ? WHERE id = ?', [
        tokens.access_token,
        adminId,
      ]);
    }
  });

  return client;
}

module.exports = { getOAuth2Client };
