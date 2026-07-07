// src/routes/jarvis/google.js
// Jarvis-specific Google OAuth flow that requests gmail.readonly scope.
// The main admin login (oAuth.js) does not include Gmail scope — this adds it.

const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { getRecentEmails } = require('../../lib/google/gmail');
const { createEvent } = require('../../lib/google/calendar');

const router = express.Router();

const JARVIS_GOOGLE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  // gmail.compose is required by gmail.users.drafts.create (creating email drafts).
  // IMPORTANT: Google documents this scope as "Manage drafts and send emails" — it
  // DOES technically permit sending, and there is no narrower scope that allows
  // draft creation without send (drafts.create requires gmail.compose, gmail.modify,
  // or mail.google.com, all of which grant send). Jarvis therefore guarantees it
  // never sends purely in CODE: no send/drafts.send call exists anywhere in the
  // codebase. See src/lib/google/gmail.js createDraft.
  'https://www.googleapis.com/auth/gmail.compose',
  // calendar.events grants read + write on events (needed to create calendar entries).
  'https://www.googleapis.com/auth/calendar.events',
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

// POST /api/jarvis/google/calendar-test
// Temporary helper: creates a 1-hour event starting now on the owner's calendar.
router.post('/calendar-test', requireOwner, async (req, res) => {
  try {
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const event = await createEvent(req.user.id, {
      summary: 'Jarvis Test Event',
      description: 'Temporary 1-hour test event created from the Jarvis test panel.',
      start,
      end,
    });
    res.json({ ok: true, event });
  } catch (err) {
    console.error('Jarvis calendar test failed:', err);
    res.status(500).json({ error: err.message || 'Failed to create calendar event' });
  }
});

// NOTE: The /callback route lives in google-callback.js and is mounted in
// server.js WITHOUT isAuth — Google redirects don't carry an Authorization header.

module.exports = router;
