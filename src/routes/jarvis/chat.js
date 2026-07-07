// src/routes/jarvis/chat.js
// All Jarvis chat, session, and lifecycle routes.
// Every route requires owner-level access (req.user.access >= 3).

const express = require('express');
const multer = require('multer');

const db = require('../../db/db');
const { runOrchestratorStream } = require('../../lib/ai/orchestrator');
const { runConsolidation, runEmailTriage, runPdfParser } = require('../../lib/ai/agents');
const { getUsageSummary } = require('../../lib/ai/usage');
const { getRecentEmails } = require('../../lib/google/gmail');
const { getTodaysEvents } = require('../../lib/google/calendar');
const { torontoDateString, torontoNowString } = require('../../lib/ai/time');
const { issueTicket } = require('./eventsTickets');

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
  return torontoDateString();
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function getNowString() {
  return torontoNowString();
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
  // Prevent nginx from buffering the stream, which would cause 504s on slow responses.
  res.setHeader('X-Accel-Buffering', 'no');
}

// Resolves with `fallback` if `promise` doesn't settle within `ms` milliseconds.
// Prevents hanging external calls (Google APIs, AI) from blocking the stream indefinitely.
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Periodically writes a newline to keep the chunked connection alive while the
// orchestrator runs its (silent) tool-use loop. Without this, a long tool phase
// produces no bytes and nginx's proxy_read_timeout fires (ERR_INCOMPLETE_CHUNKED
// _ENCODING / 504). Leading newlines collapse in the client's markdown render.
function startHeartbeat(res, intervalMs = 15000) {
  const timer = setInterval(() => {
    try { res.write('\n'); } catch { /* connection closed — ignore */ }
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}

// All routes below this line require owner-level access via the requireOwner guard.
// The SSE stream itself lives in events.js, mounted at /api/jarvis/events before
// isAuth (EventSource can't send an Authorization header). It authenticates with a
// single-use ticket issued by the header-authenticated GET /events-ticket below.
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

// ── GET /messages ─────────────────────────────────────────────────────────────
// Load today's persisted chat messages so the conversation survives reloads.

router.get('/messages', async (req, res) => {
  try {
    const session = await getOrCreateTodaySession();
    const [rows] = await db.query(
      `SELECT id, role, content, message_type, created_at
       FROM ai_messages
       WHERE session_id = ?
       ORDER BY created_at ASC, id ASC`,
      [session.id]
    );
    return res.json({ sessionId: session.id, messages: rows });
  } catch (err) {
    console.error('[GET /messages]', err);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

// ── POST /messages ────────────────────────────────────────────────────────────
// Persist the full list of chat messages for today's session. The client list
// is the source of truth during the day, so this replaces any previously saved
// messages for the session. They are wiped and consolidated at end-of-day.

router.post('/messages', async (req, res) => {
  const { messages, sessionId } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  const validRoles = new Set(['user', 'assistant', 'system']);
  const validTypes = new Set(['chat', 'proactive', 'morning_brief', 'eod']);

  const clean = messages
    .filter((m) => m && validRoles.has(m.role) && typeof m.content === 'string' && m.content.trim())
    .map((m) => [
      m.role,
      m.content,
      validTypes.has(m.messageType) ? m.messageType : 'chat',
    ]);

  const conn = await db.getConnection();
  try {
    // Only trust a client-supplied sessionId if that row still exists. A stale id
    // (e.g. after a DB reset) would otherwise fail the ai_messages FK constraint.
    let id = null;
    if (sessionId) {
      const [rows] = await conn.query(`SELECT id FROM ai_sessions WHERE id = ?`, [sessionId]);
      if (rows.length) id = rows[0].id;
    }
    if (!id) {
      const session = await getOrCreateTodaySession();
      id = session.id;
    }

    await conn.beginTransaction();
    await conn.query(`DELETE FROM ai_messages WHERE session_id = ?`, [id]);

    if (clean.length) {
      const values = clean.map(([role, content, messageType]) => [id, role, content, messageType]);
      await conn.query(
        `INSERT INTO ai_messages (session_id, role, content, message_type) VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    return res.json({ sessionId: id, saved: clean.length });
  } catch (err) {
    await conn.rollback();
    console.error('[POST /messages]', err);
    return res.status(500).json({ error: 'Failed to save messages' });
  } finally {
    conn.release();
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
  const heartbeat = startHeartbeat(res);

  try {
    const stream = runOrchestratorStream(message.trim(), { authToken, adminId: req.user.id, now });
    for await (const delta of stream) {
      if (typeof delta === 'string') {
        heartbeat.stop();
        res.write(delta);
      } else if (delta && delta.__meta) {
        heartbeat.stop();
        res.end();
        return;
      }
    }
    heartbeat.stop();
    res.end();
  } catch (err) {
    heartbeat.stop();
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
  const heartbeat = startHeartbeat(res);

  try {
    const session = await getOrCreateTodaySession();

    const [memoryRows, todoRows] = await Promise.all([
      db.query(`SELECT category, fact FROM ai_memory ORDER BY updated_at DESC LIMIT 100`).then(([r]) => r),
      db.query(`SELECT content FROM ai_todos WHERE done = 0 ORDER BY created_at DESC`).then(([r]) => r),
    ]);

    // Write an initial byte so nginx resets its proxy_read_timeout before the
    // slow external calls below (Google APIs + AI triage) can exceed it.
    res.write('\n');

    const yesterday = getYesterday();
    const [emails, calendarEvents] = await Promise.all([
      withTimeout(
        getRecentEmails({ adminId: req.user.id, since: yesterday }).catch((err) => {
          console.error('[start-day] getRecentEmails failed:', err);
          return [];
        }),
        20000,
        []
      ),
      withTimeout(
        getTodaysEvents(req.user.id).catch((err) => {
          console.error('[start-day] getTodaysEvents failed:', err);
          return [];
        }),
        20000,
        []
      ),
    ]);

    const triageResults = await withTimeout(
      runEmailTriage(emails, session.id).catch((err) => {
        console.error('[start-day] runEmailTriage failed:', err);
        return [];
      }),
      30000,
      []
    );

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

    const morningPrompt = `Give me my morning brief based on this context:\n\n## Remembered facts\n${memorySummary}\n\n## Open todos\n${todoSummary}\n\n## Email triage (last 24 h)\n${emailSummary}\n\n## Today's calendar\n${calendarSummary}${priorContext}\n\n---\nAfter writing the brief, finish by updating my to-do list:\n1. First call read_todos to see what is already on the list.\n2. Based on the action-required emails, calendar, and yesterday's context, decide what new tasks I should add for today.\n3. Add each genuinely new task with add_todo. Do NOT add an item that already exists or duplicates an open to-do (match on meaning, not just exact wording).\n4. Also complete any open to-do that yesterday's context or the emails show is already finished, using complete_todo.\n5. End your brief with a short "## To-do updates" section listing the items you added or completed (or note that nothing new was needed).`;

    const stream = runOrchestratorStream(morningPrompt, { authToken, adminId: req.user.id, now });
    for await (const delta of stream) {
      if (typeof delta === 'string') {
        heartbeat.stop();
        res.write(delta);
      } else if (delta && delta.__meta) {
        heartbeat.stop();
        res.end();
        return;
      }
    }
    heartbeat.stop();
    res.end();
  } catch (err) {
    heartbeat.stop();
    console.error('[POST /start-day]', err);
    res.write('\n[Error: failed to generate morning brief]');
    res.end();
  }
});

// ── GET /usage ────────────────────────────────────────────────────────────────
// Cost dashboard datasource: per-day / per-purpose token rollups with a dollar
// estimate for the last `days` days (default 7). Owner-gated like every route here.

router.get('/usage', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const summary = await getUsageSummary({ days });
    return res.json(summary);
  } catch (err) {
    console.error('[GET /usage]', err);
    return res.status(500).json({ error: 'Failed to load usage summary' });
  }
});

// ── GET /events-ticket ────────────────────────────────────────────────────────
// Issues a single-use, short-lived ticket for opening the SSE /events stream.
// EventSource can't send an Authorization header, so the client obtains a ticket
// here (header-authenticated) and opens EventSource('/api/jarvis/events?ticket=…').
// This keeps the JWT out of URLs (nginx logs, browser history, proxies).

router.get('/events-ticket', (req, res) => {
  const ticket = issueTicket(req.user.id);
  res.json({ ticket });
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
      parsed = await runPdfParser(buffer, mimetype, originalname, session.id);
    }

    return res.json({ uploadId, parsed });
  } catch (err) {
    console.error('[POST /upload]', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
