// src/lib/ai/agents.js
// Subagent functions. Each targets a specific model and task.
// System prompts are kept inline and clearly labeled for tuning.

const crypto = require('crypto');
const { createMessage } = require('./anthropic');
const { HEAVY, FAST } = require('./models');
const db = require('../../db/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeJsonParse(text) {
  // Strip markdown fences if the model wrapped the JSON
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

function hashFact(fact) {
  return crypto.createHash('sha256').update(fact.toLowerCase().trim()).digest('hex');
}

// ── PDF Parser ────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — PDF_PARSER
const PDF_PARSER_SYSTEM = `\
You are a data extraction specialist for Leemac Manufacturing, a precision machining shop.
You receive purchase orders, quotes, and related documents as PDF files.

Your job is to extract structured data and return ONLY a valid JSON object — no prose, no markdown fences.

Return this exact shape (omit keys that are not present in the document):
{
  "po_number": "string or null",
  "po_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "vendor_name": "string or null",
  "attention": "string or null",
  "tax_percent": "number or null",
  "line_items": [
    {
      "part_number": "string",
      "description": "string or null",
      "quantity": "number",
      "unit_price": "number or null",
      "revision": "string or null",
      "details": "string or null"
    }
  ],
  "notes": "any free-text notes or special instructions or null"
}

Rules:
- Dates must be ISO 8601 (YYYY-MM-DD). Return null if unclear or missing.
- Prices are numbers (dollars), not strings. Do not include $ or commas.
- If a field genuinely does not appear in the document, use null — do not guess.
- Return ONLY the JSON object. No explanation, no commentary.`;

async function runPdfParser(fileBuffer, mimetype, filename) {
  // fileBuffer may be a Buffer (from blob column) or a raw binary string
  const base64 = Buffer.isBuffer(fileBuffer)
    ? fileBuffer.toString('base64')
    : Buffer.from(fileBuffer).toString('base64');

  const response = await createMessage({
    model: HEAVY,
    system: PDF_PARSER_SYSTEM,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mimetype || 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Extract all structured data from this document${filename ? ` (${filename})` : ''}. Return only the JSON object.`,
          },
        ],
      },
    ],
  });

  const rawText = response.content.find((b) => b.type === 'text')?.text || '{}';
  return safeJsonParse(rawText);
}

// ── Email Triage ──────────────────────────────────────────────────────────────
// SYSTEM PROMPT — EMAIL_TRIAGE
const EMAIL_TRIAGE_SYSTEM = `\
You are an email triage assistant for Leemac Manufacturing.

Classify each email into exactly one of these categories:
- "action_required"  — needs a reply, a decision, or follow-up work
- "informational"    — useful to read but no response needed (shipping notifications, confirmations, FYIs)
- "junk"             — spam, unsolicited marketing, or irrelevant noise

Return ONLY a valid JSON array matching this shape — no prose, no markdown fences:
[
  {
    "id": "<original email id passed in>",
    "classification": "action_required" | "informational" | "junk",
    "reason": "one sentence explaining the classification",
    "suggested_subject": "optional cleaner subject line or null"
  }
]`;

async function runEmailTriage(emails) {
  if (!emails || !emails.length) return [];

  const response = await createMessage({
    model: FAST,
    system: EMAIL_TRIAGE_SYSTEM,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Triage the following emails:\n\n${JSON.stringify(emails, null, 2)}\n\nReturn only the JSON array.`,
      },
    ],
  });

  const rawText = response.content.find((b) => b.type === 'text')?.text || '[]';
  return safeJsonParse(rawText);
}

// ── Session Consolidation ─────────────────────────────────────────────────────
// SYSTEM PROMPT — CONSOLIDATION
const CONSOLIDATION_SYSTEM = `\
You are the end-of-day memory consolidation agent for Leemac Manufacturing's internal AI system.

You will receive a JSON payload describing everything that happened in today's session:
- chat messages (user and assistant turns)
- tool calls and their results
- approved/rejected AI requests
- current to-do list

Your job is to produce two things and return them as a single JSON object — no prose, no markdown:

{
  "digest": "A concise human-readable summary of the day's AI activity (3–8 bullet points in markdown).",
  "memory_facts": [
    {
      "category": "client_preference" | "job_pattern" | "operational_note" | "business_context",
      "fact": "A single, self-contained factual statement worth remembering long-term."
    }
  ]
}

Rules for memory_facts:
- Only extract facts that would still be useful weeks from now.
- Do NOT include one-off details or things easily looked up in the database.
- Each fact must be self-contained — readable without context.
- Aim for 0–10 facts per session. Zero is fine if nothing notable happened.
- Return ONLY the JSON object. No explanation, no commentary.`;

async function runConsolidation(sessionId) {
  const [[session]] = await db.query('SELECT * FROM ai_sessions WHERE id = ?', [sessionId]);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const [messages] = await db.query(
    `SELECT role, content, message_type, created_at
     FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC`,
    [sessionId]
  );
  const [toolLogs] = await db.query(
    `SELECT tool_name, tool_input, tool_output, success, created_at
     FROM ai_tool_log WHERE session_id = ? ORDER BY created_at ASC`,
    [sessionId]
  );
  const [approvals] = await db.query(
    `SELECT title, description, status, rejection_reason, resolved_at
     FROM ai_approvals
     WHERE DATE(created_at) = ? AND status IN ('approved','rejected')`,
    [session.session_date]
  );
  const [todos] = await db.query(
    `SELECT content, done, source FROM ai_todos ORDER BY created_at DESC LIMIT 50`
  );

  const response = await createMessage({
    model: HEAVY,
    system: CONSOLIDATION_SYSTEM,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Today is ${session.session_date}. Consolidate this session:\n\n${JSON.stringify(
          { messages, toolLogs, approvals, todos },
          null,
          2
        )}\n\nReturn only the JSON object.`,
      },
    ],
  });

  const rawText = response.content.find((b) => b.type === 'text')?.text || '{}';
  const { digest = '', memory_facts = [] } = safeJsonParse(rawText);

  // Write memory facts with dedup via fact_hash (UNIQUE KEY on fact_hash)
  for (const item of memory_facts) {
    const fact = String(item.fact || '').trim();
    if (!fact) continue;
    await db.query(
      `INSERT IGNORE INTO ai_memory (category, fact, fact_hash, source_session_id)
       VALUES (?, ?, ?, ?)`,
      [item.category || 'operational_note', fact, hashFact(fact), sessionId]
    );
  }

  // Mark session closed and save digest as context_summary for tomorrow's morning brief
  await db.query(
    `UPDATE ai_sessions
     SET status = 'closed', context_summary = ?, closed_at = NOW()
     WHERE id = ?`,
    [digest, sessionId]
  );

  return { digest, memory_facts, facts_written: memory_facts.length };
}

module.exports = { runPdfParser, runEmailTriage, runConsolidation };
