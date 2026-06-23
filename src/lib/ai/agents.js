// src/lib/ai/agents.js
// Subagent functions. Each targets a specific model and task.
// System prompts are kept inline and clearly labeled for tuning.

const crypto = require('crypto');
const { createMessage } = require('./anthropic');
const { HEAVY, FAST } = require('./models');
const { isMarkitdownAvailable, convertToMarkdown } = require('./markitdown');
const db = require('../../db/db');

// Cap on how much Markdown we feed the extractor / return to the orchestrator,
// to keep token usage and context size sane on very large documents.
const MAX_MARKDOWN_CHARS = 60000;

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
  "job_number": "string or null",
  "taxable": "true | false | null",
  "tax_amount": "number or null",
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
- job_number: the customer/internal job number if the document references one, else null.
- taxable: true if the document indicates tax applies, false if it explicitly says no tax, else null.
- tax_amount: the actual tax dollar figure printed on the document (a number), or null if none is shown.
- tax_percent: the tax rate as a percentage number (e.g. 13 for 13%), or null if not stated.
- Prefer reporting the literal tax_amount when the document shows one; only rely on tax_percent
  when the document says tax applies but gives no dollar amount.
- If a field genuinely does not appear in the document, use null — do not guess.
- Return ONLY the JSON object. No explanation, no commentary.`;

// Extraction subagent — operates on the Markdown that MarkItDown produced from the
// PDF. Because the document is already plain text, this is a cheap text-only call.
async function runPdfExtractor(markdown, filename) {
  const response = await createMessage({
    model: HEAVY,
    system: PDF_PARSER_SYSTEM,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content:
          `The following document${filename ? ` (${filename})` : ''} was converted to Markdown ` +
          `by MarkItDown. Extract all structured data and return only the JSON object.\n\n` +
          `--- BEGIN DOCUMENT ---\n${markdown}\n--- END DOCUMENT ---`,
      },
    ],
  });

  const rawText = response.content.find((b) => b.type === 'text')?.text || '{}';
  return safeJsonParse(rawText);
}

// Native fallback — Claude reads the raw PDF directly. Used only when MarkItDown
// is not installed or fails, so the system stays functional either way.
async function runPdfExtractorNative(fileBuffer, mimetype, filename) {
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

// Parses a PDF for the orchestrator. Every PDF goes through MarkItDown first so
// Jarvis works from clean Markdown; the structured-extraction subagent then turns
// that Markdown into JSON. Returns the parsed fields plus the (capped) Markdown so
// the orchestrator can also read the document's full text.
async function runPdfParser(fileBuffer, mimetype, filename) {
  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);

  try {
    if (await isMarkitdownAvailable()) {
      const fullMarkdown = await convertToMarkdown(buffer, filename || 'document.pdf');
      if (fullMarkdown && fullMarkdown.trim()) {
        const markdown = fullMarkdown.slice(0, MAX_MARKDOWN_CHARS);
        const parsed = await runPdfExtractor(markdown, filename);
        return { ...parsed, markdown, parser: 'markitdown' };
      }
    }
  } catch (err) {
    console.error('[runPdfParser] MarkItDown path failed, falling back to native:', err.message);
  }

  // Fallback: let Claude read the PDF bytes directly.
  const parsed = await runPdfExtractorNative(buffer, mimetype, filename);
  return { ...parsed, parser: 'native' };
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

Go through ALL of the day's messages and consolidate them into ONE durable memory
entry that captures what is worth remembering long-term. Return a single JSON
object — no prose, no markdown:

{
  "digest": "A concise human-readable summary of the day's AI activity (3–8 bullet points in markdown).",
  "memory_entry": {
    "category": "client_preference" | "job_pattern" | "operational_note" | "business_context",
    "fact": "A single, self-contained paragraph consolidating everything worth remembering from today's conversation."
  }
}

Rules for memory_entry:
- Produce exactly one entry that summarises the notable, long-lived takeaways from the whole day.
- Only include information that would still be useful weeks from now.
- Do NOT include one-off details or things easily looked up in the database.
- The fact must be self-contained — readable without any other context.
- If genuinely nothing notable happened, set memory_entry to null.
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
  const { digest = '', memory_entry = null } = safeJsonParse(rawText);

  // Write the single consolidated memory entry (dedup via fact_hash UNIQUE KEY)
  let factsWritten = 0;
  const fact = String(memory_entry?.fact || '').trim();
  if (fact) {
    await db.query(
      `INSERT IGNORE INTO ai_memory (category, fact, fact_hash, source_session_id)
       VALUES (?, ?, ?, ?)`,
      [memory_entry.category || 'operational_note', fact, hashFact(fact), sessionId]
    );
    factsWritten = 1;
  }

  // Mark session closed and save digest as context_summary for tomorrow's morning brief
  await db.query(
    `UPDATE ai_sessions
     SET status = 'closed', context_summary = ?, closed_at = NOW()
     WHERE id = ?`,
    [digest, sessionId]
  );

  // Wipe the day's messages now that they're consolidated into ai_memory.
  await db.query(`DELETE FROM ai_messages WHERE session_id = ?`, [sessionId]);

  return { digest, memory_entry, facts_written: factsWritten };
}

module.exports = { runPdfParser, runEmailTriage, runConsolidation };
