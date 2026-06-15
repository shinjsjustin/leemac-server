// src/lib/ai/orchestrator.js
// The Sonnet master loop. Handles tool-use cycles, memory injection,
// message persistence, and exposes both streaming and non-streaming entry points.

const db = require('../../db/db');
const { createMessage, streamMessage } = require('./anthropic');
const { ORCHESTRATOR } = require('./models');
const { TOOLS } = require('./tools');
const { executeTool } = require('./executor');

// ── Session helpers ───────────────────────────────────────────────────────────

async function getOrCreateSession() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const [rows] = await db.query(
    `SELECT id, context_summary FROM ai_sessions WHERE session_date = ?`,
    [today]
  );
  if (rows.length) return rows[0];

  const [result] = await db.query(
    `INSERT INTO ai_sessions (session_date, status) VALUES (?, 'open')`,
    [today]
  );
  return { id: result.insertId, context_summary: null };
}

async function loadMemoryFacts() {
  const [rows] = await db.query(
    `SELECT category, fact FROM ai_memory ORDER BY updated_at DESC LIMIT 100`
  );
  if (!rows.length) return '';
  return rows.map((r) => `[${r.category}] ${r.fact}`).join('\n');
}

async function loadPriorContext(currentSessionId) {
  const [rows] = await db.query(
    `SELECT context_summary FROM ai_sessions
     WHERE status = 'closed' AND id != ?
     ORDER BY session_date DESC LIMIT 1`,
    [currentSessionId]
  );
  return rows[0]?.context_summary || null;
}

async function loadSessionHistory(sessionId) {
  const [rows] = await db.query(
    `SELECT role, content FROM ai_messages
     WHERE session_id = ? ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows.map((r) => {
    let content;
    try { content = JSON.parse(r.content); } catch { content = r.content; }
    return { role: r.role, content };
  });
}

async function persistMessage(sessionId, role, content) {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  await db.query(
    `INSERT INTO ai_messages (session_id, role, content, message_type)
     VALUES (?, ?, ?, 'chat')`,
    [sessionId, role, contentStr]
  );
}

// ── System prompt builder ─────────────────────────────────────────────────────

async function buildSystemPrompt(sessionId, now) {
  const [memoryFacts, priorContext] = await Promise.all([
    loadMemoryFacts(),
    loadPriorContext(sessionId),
  ]);

  const dateStr = now || new Date().toLocaleString('en-US', {
    timeZone: 'America/Toronto',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  let prompt = `\
You are Jarvis, the internal AI assistant for Leemac Manufacturing — a precision machining shop.
You help Justin (the owner) manage jobs, parts, shop-floor status, finances, and day-to-day operations.

Current date/time: ${dateStr}

## Your capabilities
You have tools to read jobs, parts, and shop-floor status; update NFC/production statuses; manage to-dos;
parse uploaded PDFs (purchase orders, quotes); and propose database changes for human approval.

## Permission rules
- READ tools and NFC status updates execute immediately — no approval needed.
- Any tool that creates, modifies, or deletes business data must be proposed via propose_db_change.
  The change is queued for human review and will NOT execute until approved.
- propose_db_change uses hard-coded request templates: pick a template key and supply its params.
  Never invent endpoints, HTTP methods, or extra fields — only use params the template defines.
- When in doubt, propose rather than assume.

## Your style
- Be direct and concise. Justin is busy.
- Use markdown formatting for lists and tables when it improves readability.
- If you don't have enough information to answer, say so and ask a specific question.
- When you queue a change for approval, summarise what you queued and why.`;

  if (priorContext) {
    prompt += `\n\n## Yesterday's summary\n${priorContext}`;
  }

  if (memoryFacts) {
    prompt += `\n\n## Remembered facts\n${memoryFacts}`;
  }

  return prompt;
}

// ── Tool-use loop (non-streaming inner loop) ──────────────────────────────────
// Runs until the model produces a turn with no tool_use blocks.
// Returns the final Anthropic response and the resolved message history.

async function runToolLoop(sessionId, msgHistory, systemPrompt, authToken) {
  let history = msgHistory;

  while (true) {
    const response = await createMessage({
      model: ORCHESTRATOR,
      system: systemPrompt,
      messages: history,
      tools: TOOLS,
      max_tokens: 4096,
    });

    if (response.stop_reason !== 'tool_use') {
      return { response, resolvedHistory: history };
    }

    // Append assistant tool-use turn
    history = [...history, { role: 'assistant', content: response.content }];

    // Execute all tool calls and collect results
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeTool(block.name, block.input, { sessionId, authToken });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    history = [...history, { role: 'user', content: toolResults }];
  }
}

// ── Non-streaming entry point ─────────────────────────────────────────────────

async function runOrchestrator(userMessage, { authToken, now } = {}) {
  const session = await getOrCreateSession();
  const sessionId = session.id;

  const [systemPrompt, history] = await Promise.all([
    buildSystemPrompt(sessionId, now),
    loadSessionHistory(sessionId),
  ]);

  await persistMessage(sessionId, 'user', userMessage);

  const msgHistory = [...history, { role: 'user', content: userMessage }];
  const { response } = await runToolLoop(sessionId, msgHistory, systemPrompt, authToken);

  const finalText = response.content.find((b) => b.type === 'text')?.text || '';
  await persistMessage(sessionId, 'assistant', finalText);

  return { sessionId, text: finalText, content: response.content };
}

// ── Streaming entry point ─────────────────────────────────────────────────────
// Runs the tool-use loop non-streaming, then streams the final response turn.
// Yields string deltas. The last yielded value is a metadata object { __meta }.
// Caller pipes text deltas to the HTTP response (SSE or chunked transfer).

async function* runOrchestratorStream(userMessage, { authToken, now } = {}) {
  const session = await getOrCreateSession();
  const sessionId = session.id;

  const [systemPrompt, history] = await Promise.all([
    buildSystemPrompt(sessionId, now),
    loadSessionHistory(sessionId),
  ]);

  await persistMessage(sessionId, 'user', userMessage);

  const msgHistory = [...history, { role: 'user', content: userMessage }];

  // Resolve all tool-use turns first (non-streaming)
  const { resolvedHistory } = await runToolLoop(sessionId, msgHistory, systemPrompt, authToken);

  // Stream the final response turn
  const chunks = [];
  for await (const delta of streamMessage({
    model: ORCHESTRATOR,
    system: systemPrompt,
    messages: resolvedHistory,
    tools: TOOLS,
    max_tokens: 4096,
  })) {
    chunks.push(delta);
    yield delta;
  }

  const finalText = chunks.join('');
  await persistMessage(sessionId, 'assistant', finalText);

  // Terminal sentinel — callers should check for __meta and not render it
  yield { __meta: { sessionId, done: true } };
}

module.exports = { runOrchestrator, runOrchestratorStream };
