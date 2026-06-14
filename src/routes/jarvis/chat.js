// src/routes/jarvis/chat.js
// All Jarvis chat, session, and lifecycle routes.
// Every route requires owner-level access (req.user.access >= 3).

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const db = require('../../db/db');
const { runOrchestratorStream } = require('../../lib/ai/orchestrator');
const { runConsolidation, runEmailTriage, runPdfParser } = require('../../lib/ai/agents');
const { getRecentEmails } = require('../../lib/google/gmail');
const { getTodaysEvents } = require('../../lib/google/calendar');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Auth guard ────────────────────────────────────────────────────────────────

function requireOwner(req, res, next) {
  if (!req.user || req.user.access < 3) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToday() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function getNowString() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Toronto',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function getOrCreateTodaySession() {
  const today = getToday();
  const [existing] = await db.query(
    `SELECT id, context_summary FROM ai_sessions WHERE session_date = ?`,
    [today]
  );
  if (existing.length) return existing[0];

  const [result] = await db.query(
    `INSERT INTO ai_sessions (session_date, status) VALUES (?, 'open')`,
    [today]
  );
  return { id: result.insertId, context_summary: null };
}

function setStreamHeaders(res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
}

// All routes below this line require owner-level access via the requireOwner guard.
// The /events SSE route above handles its own auth to support query-param tokens.
router.use(requireOwner);

// ── GET /session ──────────────────────────────────────────────────────────────
// Return today's open session (or create one).
// Includes prior closed session's context_summary for morning context.

router.get('/session', async (req, res) => {
  try {
    const today = getToday();
    const [existing] = await db.query(
      `SELECT id, context_summary FROM ai_sessions WHERE session_date = ?`,
      [today]
    );

    if (existing.length) {
      return res.json({
        sessionId: existing[0].id,
        contextSummary: existing[0].context_summary,
        serverTime: new Date().toISOString(),
      });
    }

    // Look up prior closed session context before creating today's session
    const [priorRows] = await db.query(
      `SELECT context_summary FROM ai_sessions
       WHERE status = 'closed'
       ORDER BY session_date DESC
       LIMIT 1`
    );
    const contextSummary = priorRows[0]?.context_summary || null;

    const [result] = await db.query(
      `INSERT INTO ai_sessions (session_date, status) VALUES (?, 'open')`,
      [today]
    );

    return res.json({
      sessionId: result.insertId,
      contextSummary,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /session]', err);
    return res.status(500).json({ error: 'Failed to load or create session' });
  }
});

// ── POST /chat ────────────────────────────────────────────────────────────────
// Stream the orchestrator response for a user message.

router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const authToken = req.headers.authorization?.split(' ')[1];
  const now = getNowString();

  setStreamHeaders(res);

  try {
    const stream = runOrchestratorStream(message.trim(), { authToken, now });
    for await (const delta of stream) {
      if (typeof delta === 'string') {
        res.write(delta);
      } else if (delta && delta.__meta) {
        res.end();
        return;
      }
    }
    res.end();
  } catch (err) {
    console.error('[POST /chat]', err);
    res.write('\n[Error: failed to generate response]');
    res.end();
  }
});

// ── POST /start-day ───────────────────────────────────────────────────────────
// Morning brief: loads memory, todos, emails, and calendar then streams a brief.

router.post('/start-day', async (req, res) => {
  const authToken = req.headers.authorization?.split(' ')[1];
  const now = getNowString();

  setStreamHeaders(res);

  try {
    const session = await getOrCreateTodaySession();

    const [memoryRows, todoRows] = await Promise.all([
      db.query(`SELECT category, fact FROM ai_memory ORDER BY updated_at DESC LIMIT 100`).then(([r]) => r),
      db.query(`SELECT content FROM ai_todos WHERE done = 0 ORDER BY created_at DESC`).then(([r]) => r),
    ]);

    const yesterday = getYesterday();
    const [emails, calendarEvents] = await Promise.all([
      getRecentEmails({ adminId: req.user.id, since: yesterday }).catch((err) => {
        console.error('[start-day] getRecentEmails failed:', err);
        return [];
      }),
      getTodaysEvents(req.user.id).catch((err) => {
        console.error('[start-day] getTodaysEvents failed:', err);
        return [];
      }),
    ]);

    const triageResults = await runEmailTriage(emails).catch((err) => {
      console.error('[start-day] runEmailTriage failed:', err);
      return [];
    });

    const actionEmails = triageResults.filter((e) => e.classification === 'action_required');
    const informationalEmails = triageResults.filter((e) => e.classification === 'informational');

    const memorySummary = memoryRows.length
      ? memoryRows.map((r) => `[${r.category}] ${r.fact}`).join('\n')
      : 'No remembered facts yet.';

    const todoSummary = todoRows.length
      ? todoRows.map((r) => `- ${r.content}`).join('\n')
      : 'No open todos.';

    const emailSummary = emails.length === 0
      ? 'No recent emails.'
      : [
          actionEmails.length
            ? `Action required (${actionEmails.length}):\n${actionEmails.map((e) => `- ${e.id}: ${e.reason}`).join('\n')}`
            : null,
          informationalEmails.length
            ? `Informational (${informationalEmails.length}) — no action needed.`
            : null,
        ]
          .filter(Boolean)
          .join('\n');

    const calendarSummary = calendarEvents.length === 0
      ? 'No events scheduled today.'
      : calendarEvents
          .map((ev) => {
            const location = ev.location ? ` (${ev.location})` : '';
            return `- ${ev.summary || 'Untitled'} @ ${ev.start || 'TBD'}${location}`;
          })
          .join('\n');

    const priorContext = session.context_summary
      ? `\n\n## Yesterday's context\n${session.context_summary}`
      : '';

    const morningPrompt = `Give me my morning brief based on this context:\n\n## Remembered facts\n${memorySummary}\n\n## Open todos\n${todoSummary}\n\n## Email triage (last 24 h)\n${emailSummary}\n\n## Today's calendar\n${calendarSummary}${priorContext}`;

    const stream = runOrchestratorStream(morningPrompt, { authToken, now });
    for await (const delta of stream) {
      if (typeof delta === 'string') {
        res.write(delta);
      } else if (delta && delta.__meta) {
        res.end();
        return;
      }
    }
    res.end();
  } catch (err) {
    console.error('[POST /start-day]', err);
    res.write('\n[Error: failed to generate morning brief]');
    res.end();
  }
});

// ── GET /events (SSE) ─────────────────────────────────────────────────────────
// Server-Sent Events stream for new ai_notifications.

const SSE_POLL_MS = 5000;
const SSE_KEEPALIVE_MS = 30000;

// SSE clients can't send Authorization headers, so also accept ?token= query param.
// requireOwner is bypassed here; we do our own JWT check inline.
router.get('/events', (req, res) => {
  const rawToken = req.query.token || req.headers.authorization?.split(' ')[1];
  try {
    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
    if (!decoded || decoded.access < 3) {
      res.status(403).end();
      return;
    }
  } catch {
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

// ── POST /ingest-email ────────────────────────────────────────────────────────
// Accept an array of email objects, triage them, and notify on action_required.

router.post('/ingest-email', async (req, res) => {
  const { emails } = req.body;
  if (!Array.isArray(emails)) {
    return res.status(400).json({ error: 'emails must be an array' });
  }

  try {
    const triageResults = await runEmailTriage(emails);
    const actionItems = triageResults.filter((e) => e.classification === 'action_required');

    let notificationsInserted = 0;
    for (const item of actionItems) {
      const summary = item.reason || `Action required: ${item.id}`;
      await db.query(
        `INSERT INTO ai_notifications (type, content) VALUES ('email_summary', ?)`,
        [summary]
      );
      notificationsInserted++;
    }

    return res.json({
      processed: emails.length,
      notifications: notificationsInserted,
    });
  } catch (err) {
    console.error('[POST /ingest-email]', err);
    return res.status(500).json({ error: 'Email triage failed' });
  }
});

// ── POST /end-day ─────────────────────────────────────────────────────────────
// Run end-of-day consolidation: summarise, extract memory, close session.

router.post('/end-day', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id FROM ai_sessions WHERE session_date = ? AND status = 'open'`,
      [getToday()]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No open session found for today' });
    }

    const sessionId = rows[0].id;
    const result = await runConsolidation(sessionId);

    return res.json({
      message: 'Day ended',
      sessionId,
      factsWritten: result.facts_written,
    });
  } catch (err) {
    console.error('[POST /end-day]', err);
    return res.status(500).json({ error: 'End-of-day consolidation failed' });
  }
});

// ── POST /upload ──────────────────────────────────────────────────────────────
// Multipart file upload. Stores in ai_uploads. Parses PDFs via runPdfParser.

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded — use field name "file"' });
  }

  const { originalname, mimetype, size, buffer } = req.file;

  try {
    const session = await getOrCreateTodaySession();

    const [result] = await db.query(
      `INSERT INTO ai_uploads (filename, mimetype, size, content, session_id)
       VALUES (?, ?, ?, ?, ?)`,
      [originalname, mimetype, size, buffer, session.id]
    );

    const uploadId = result.insertId;

    let parsed = null;
    if (mimetype.includes('pdf')) {
      parsed = await runPdfParser(buffer, mimetype, originalname);
    }

    return res.json({ uploadId, parsed });
  } catch (err) {
    console.error('[POST /upload]', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
