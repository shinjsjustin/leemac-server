// src/routes/jarvis/events.js
// Server-Sent Events stream for new ai_notifications.
//
// Mounted at /api/jarvis/events in server.js BEFORE the isAuth middleware,
// because the browser's EventSource cannot send an Authorization header (mirrors
// the jarvisGoogleCallbackRoutes precedent at /api/jarvis/google). Authentication
// is instead done with a single-use, short-lived ticket obtained from the
// header-authenticated GET /api/jarvis/events-ticket (see eventsTickets.js).

const express = require('express');
const db = require('../../db/db');
const { consumeTicket } = require('./eventsTickets');

const router = express.Router();

const SSE_POLL_MS = 5000;
const SSE_KEEPALIVE_MS = 30000;

// GET /api/jarvis/events?ticket=…
router.get('/', (req, res) => {
  // Single-use ticket: consumeTicket deletes it and rejects expired/unknown ones.
  const entry = consumeTicket(req.query.ticket);
  if (!entry) {
    res.status(401).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Initial keepalive to confirm stream is open
  res.write(':\n\n');

  const pollInterval = setInterval(async () => {
    try {
      const [rows] = await db.query(
        `SELECT id, type, content, created_at
         FROM ai_notifications
         WHERE read_status = 0
         ORDER BY created_at ASC`
      );

      if (!rows.length) return;

      for (const row of rows) {
        const payload = JSON.stringify({
          id: row.id,
          type: row.type,
          content: row.content,
          createdAt: row.created_at,
        });
        res.write(`data: ${payload}\n\n`);
      }

      const ids = rows.map((r) => r.id);
      await db.query(
        `UPDATE ai_notifications SET read_status = 1 WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    } catch (err) {
      console.error('[GET /events] poll error:', err);
    }
  }, SSE_POLL_MS);

  const keepaliveInterval = setInterval(() => {
    res.write(':\n\n');
  }, SSE_KEEPALIVE_MS);

  req.on('close', () => {
    clearInterval(pollInterval);
    clearInterval(keepaliveInterval);
  });
});

module.exports = router;
