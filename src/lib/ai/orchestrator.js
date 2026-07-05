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
read the owner's Gmail (full bodies and attachments) and create Google Calendar events; parse PDFs
(purchase orders, quotes); and propose database changes for human approval.

Heavy work is handled by specialised subagents, not by you directly. PDFs are converted to clean
Markdown by Microsoft MarkItDown and extracted into structured JSON by a dedicated parser subagent;
email batches are classified by a triage subagent. Lean on these tools to do the heavy lifting and
keep your own reasoning focused on deciding what to do with the results.

## Be proactive with your tools
Default to *doing*, not just describing. On every turn, actively look for a useful tool action and take it:
- Whenever the conversation implies a deadline, meeting, delivery, or follow-up, create a calendar event
  with create_calendar_event (this executes immediately) and confirm what you scheduled.
- Whenever something needs to be remembered or actioned later, add it with add_todo.
- When email is relevant, use read_emails / read_email / read_email_attachment to pull the real content
  rather than guessing.
- Prefer suggesting and using a concrete tool over giving a generic answer. If a calendar event or to-do
  would plausibly help, offer it (or just do it) instead of waiting to be asked.
- Only skip a tool action when none is genuinely relevant; never stay idle out of caution.

## Permission rules
- READ tools and NFC status updates execute immediately — no approval needed.
- Any tool that creates, modifies, or deletes business data must be proposed via propose_db_change.
  The change is queued for human review and will NOT execute until approved.
- propose_db_change uses hard-coded request templates: pick a template key and supply its params.
  Never invent endpoints, HTTP methods, or extra fields — only use params the template defines.
- When in doubt, propose rather than assume.

## Updating a job with a purchase order
When asked to update a job from a PO (you typically have the PO's parsed fields and line items):
1. **Find the job number first.** If the PO references a job number, resolve that job (read_jobs /
   read_job_summary) and propose the PO update against it with the update_job_po template.
2. **No job number? Match by parts.** If there is no job number, call match_job_by_parts with every
   line item (part_number, quantity, price). This requires a complete match — every line item must
   match the same job and that job must contain exactly those parts.
   - If it returns matched:true, use that job for the update.
   - If it returns matched:false, STOP. Do not guess or pick a partial match. Tell the owner the PO
     could not be matched to a job and that the task is incomplete, and show why (the reason returned).
3. **Tax handling.** Always prefer the actual tax amount printed on the PO:
   - If the PO shows a tax dollar amount, set taxCode = 1 and tax = that amount. Do NOT send taxPercent.
   - If the PO says tax applies but gives no amount, set taxCode = 1 and taxPercent = the rate; leave tax unset.
   - If the PO is not taxable, set taxCode = 0 and send neither tax nor taxPercent.

## Creating a quote job with parts
When Justin asks you to make a quote or a job with one or more parts, always use the SINGLE
create_quote_job template via propose_db_change. Do NOT chain create_job + create_part +
link_part_to_job — that one template creates the job, reuses/creates every part, and links them all
in one atomic request (the endpoint hardcodes price to $1 for quotes).
1. **Resolve the company first.** Look the company up (read_jobs / search existing jobs) so you can
   supply a real company_id. Never guess it — if you can't resolve it, ask Justin.
2. **Assemble every part** into the `parts` array: each { part_number, description, material, finish,
   quantity }. part_number and quantity are required per part.
3. **Propose once.** Queue a single create_quote_job request covering all the parts, rather than one
   proposal per part.
The multi-step create_job / create_part / link_part_to_job templates remain available for editing an
existing job, but for creating a new quote job with parts, create_quote_job is always the right call.

## Handling an inbound RFQ (request for quote)
When an email is a request for quote with drawing attachments, do NOT extract parts yourself.
Call process_rfq_email with the Gmail message id. It runs the whole pipeline — triage, PDF→text
conversion (no AI reads the raw PDF), one verified extraction per part in parallel, deterministic
company resolution, and a verified assembly — then queues a createquotejob request in the Requests
panel for approval. Relay its result: report the queued approval (if any), and explicitly surface any
unreadable parts and any company-resolution failure it returns. Never invent a company or a part.

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

async function runToolLoop(sessionId, msgHistory, systemPrompt, authToken, adminId) {
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
      const result = await executeTool(block.name, block.input, { sessionId, authToken, adminId });
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

async function runOrchestrator(userMessage, { authToken, adminId, now } = {}) {
  const session = await getOrCreateSession();
  const sessionId = session.id;

  const [systemPrompt, history] = await Promise.all([
    buildSystemPrompt(sessionId, now),
    loadSessionHistory(sessionId),
  ]);

  await persistMessage(sessionId, 'user', userMessage);

  const msgHistory = [...history, { role: 'user', content: userMessage }];
  const { response } = await runToolLoop(sessionId, msgHistory, systemPrompt, authToken, adminId);

  const finalText = response.content.find((b) => b.type === 'text')?.text || '';
  await persistMessage(sessionId, 'assistant', finalText);

  return { sessionId, text: finalText, content: response.content };
}

// ── Streaming entry point ─────────────────────────────────────────────────────
// Runs the tool-use loop non-streaming, then streams the final response turn.
// Yields string deltas. The last yielded value is a metadata object { __meta }.
// Caller pipes text deltas to the HTTP response (SSE or chunked transfer).

async function* runOrchestratorStream(userMessage, { authToken, adminId, now } = {}) {
  const session = await getOrCreateSession();
  const sessionId = session.id;

  const [systemPrompt, history] = await Promise.all([
    buildSystemPrompt(sessionId, now),
    loadSessionHistory(sessionId),
  ]);

  await persistMessage(sessionId, 'user', userMessage);

  const msgHistory = [...history, { role: 'user', content: userMessage }];

  // Resolve all tool-use turns first (non-streaming)
  const { resolvedHistory } = await runToolLoop(sessionId, msgHistory, systemPrompt, authToken, adminId);

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
