// src/lib/ai/executor.js
// Executes tool calls from the orchestrator.
// Auto-tier tools call backend endpoints directly.
// Approval/always_ask-tier tools insert into ai_approvals instead of executing.
// Every call is logged to ai_tool_log.

const db = require('../../db/db');
const { PERMISSION_TIER } = require('./tools');
const { buildRequestFromTemplate } = require('./requestTemplates');
const { getRecentEmails, getEmailById, getEmailAttachment } = require('../google/gmail');
const { createEvent } = require('../google/calendar');

// MIME types we can safely surface as plain text from an attachment buffer.
const TEXTUAL_MIME = /^(text\/|application\/(json|xml|csv))/i;

const BASE_URL = process.env.INTERNAL_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

// ── Internal API helper ───────────────────────────────────────────────────────

async function apiFetch(path, method, params, authToken) {
  let url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
  };

  if (method === 'GET' && params && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  } else if (method !== 'GET' && params && Object.keys(params).length > 0) {
    opts.body = JSON.stringify(params);
  }

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Audit log ─────────────────────────────────────────────────────────────────

async function logTool(sessionId, toolName, toolInput, toolOutput, success) {
  try {
    await db.query(
      `INSERT INTO ai_tool_log (session_id, tool_name, tool_input, tool_output, success)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sessionId || null,
        toolName,
        JSON.stringify(toolInput),
        JSON.stringify(toolOutput),
        success ? 1 : 0,
      ]
    );
  } catch (err) {
    // Log failure must never crash the caller
    console.error('[ai_tool_log] insert failed:', err.message);
  }
}

// ── Auto-tier execution ───────────────────────────────────────────────────────

async function executeAutoTool(toolName, toolInput, authToken, adminId) {
  switch (toolName) {
    case 'read_jobs':
      return apiFetch('/api/internal/job/getjobs', 'GET', toolInput, authToken);

    case 'read_job_summary':
      return apiFetch('/api/internal/job/jobsummary', 'GET', toolInput, authToken);

    case 'read_parts':
      return apiFetch('/api/internal/part/getparts', 'GET', toolInput, authToken);

    case 'search_parts':
      return apiFetch('/api/internal/part/searchparts', 'GET', toolInput, authToken);

    case 'read_starred_jobs':
      return apiFetch('/api/internal/job/getstarredjobsfull', 'GET', {}, authToken);

    case 'update_nfc_status':
      return apiFetch('/api/internal/job/updatestarjobstatus', 'PUT', toolInput, authToken);

    case 'propose_db_change': {
      // Resolve the hard-coded template into a concrete request. This throws a
      // descriptive error (caught by executeTool) if the template key is unknown
      // or the params fail validation — so a bad proposal never reaches the queue.
      const { endpoint, method, body } = buildRequestFromTemplate(
        toolInput.template,
        toolInput.params
      );

      const [result] = await db.query(
        `INSERT INTO ai_approvals (title, description, request_payload)
         VALUES (?, ?, ?)`,
        [
          toolInput.title,
          toolInput.description,
          JSON.stringify({
            template: toolInput.template,
            endpoint,
            method,
            body,
          }),
        ]
      );
      return {
        queued:      true,
        approval_id: result.insertId,
        template:    toolInput.template,
        endpoint,
        method,
        message:     `Change request queued (ID ${result.insertId}). A human must approve it in the Requests panel before it executes.`,
      };
    }

    case 'add_todo': {
      const content = String(toolInput.content || '').slice(0, 500);

      // Guard against duplicates: skip if an open to-do with the same
      // normalised content already exists.
      const [existing] = await db.query(
        `SELECT id, content FROM ai_todos
         WHERE done = 0 AND LOWER(TRIM(content)) = LOWER(TRIM(?))
         LIMIT 1`,
        [content]
      );
      if (existing.length) {
        return {
          id: existing[0].id,
          content: existing[0].content,
          created: false,
          duplicate: true,
          message: 'A matching open to-do already exists; not added again.',
        };
      }

      const [result] = await db.query(
        `INSERT INTO ai_todos (content, source) VALUES (?, 'ai')`,
        [content]
      );
      return { id: result.insertId, content, created: true };
    }

    case 'read_todos': {
      const includeDone = toolInput.include_done === true;
      const sql = includeDone
        ? 'SELECT * FROM ai_todos ORDER BY created_at DESC'
        : 'SELECT * FROM ai_todos WHERE done = 0 ORDER BY created_at DESC';
      const [rows] = await db.query(sql);
      return { todos: rows };
    }

    case 'parse_pdf': {
      const [rows] = await db.query(
        `SELECT id, filename, mimetype, content
         FROM ai_uploads WHERE id = ? AND status = 'staged'`,
        [toolInput.upload_id]
      );
      if (!rows.length) throw new Error(`No staged upload found with id ${toolInput.upload_id}`);

      const upload = rows[0];
      const { runPdfParser } = require('./agents');
      return runPdfParser(upload.content, upload.mimetype, upload.filename);
    }

    case 'read_emails': {
      const emails = await getRecentEmails({
        adminId,
        query: toolInput.query,
        since: toolInput.query
          ? undefined
          : new Date(Date.now() - (toolInput.since_hours || 24) * 60 * 60 * 1000),
        maxResults: toolInput.max_results || 25,
      });
      return { count: emails.length, emails };
    }

    case 'read_email': {
      if (!toolInput.email_id) throw new Error('email_id is required');
      return getEmailById({ adminId, emailId: toolInput.email_id });
    }

    case 'read_email_attachment': {
      if (!toolInput.email_id || !toolInput.attachment_id) {
        throw new Error('email_id and attachment_id are required');
      }
      const att = await getEmailAttachment({
        adminId,
        emailId: toolInput.email_id,
        attachmentId: toolInput.attachment_id,
      });

      const isPdf =
        att.mime_type === 'application/pdf' || /\.pdf$/i.test(att.filename);
      if (isPdf) {
        const { runPdfParser } = require('./agents');
        const parsed = await runPdfParser(att.buffer, 'application/pdf', att.filename);
        return { filename: att.filename, mime_type: att.mime_type, kind: 'pdf', parsed };
      }

      if (TEXTUAL_MIME.test(att.mime_type) || /\.(txt|csv|json|xml|md|log)$/i.test(att.filename)) {
        return {
          filename: att.filename,
          mime_type: att.mime_type,
          kind: 'text',
          text: att.buffer.toString('utf-8').slice(0, 20000),
        };
      }

      return {
        filename: att.filename,
        mime_type: att.mime_type,
        size: att.size,
        kind: 'binary',
        message: 'Binary attachment — contents not readable as text. Metadata only.',
      };
    }

    case 'create_calendar_event': {
      if (!toolInput.summary || !toolInput.start) {
        throw new Error('summary and start are required');
      }
      const start = new Date(toolInput.start);
      if (Number.isNaN(start.getTime())) throw new Error(`Invalid start time: ${toolInput.start}`);
      const end = toolInput.end ? new Date(toolInput.end) : new Date(start.getTime() + 60 * 60 * 1000);
      if (Number.isNaN(end.getTime())) throw new Error(`Invalid end time: ${toolInput.end}`);

      const event = await createEvent(adminId, {
        summary: toolInput.summary,
        description: toolInput.description,
        location: toolInput.location,
        start,
        end,
      });
      return { created: true, event };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, { sessionId, authToken, adminId }) {
  const tier = PERMISSION_TIER[toolName] || 'always_ask';
  let output = null;
  let success = true;

  try {
    if (tier === 'approval' || tier === 'always_ask') {
      const [result] = await db.query(
        `INSERT INTO ai_approvals (title, description, request_payload)
         VALUES (?, ?, ?)`,
        [
          `AI request: ${toolName}`,
          `The AI wants to execute "${toolName}" with inputs: ${JSON.stringify(toolInput)}`,
          JSON.stringify({ tool: toolName, input: toolInput }),
        ]
      );
      output = {
        queued:      true,
        approval_id: result.insertId,
        message:     `"${toolName}" requires human approval (ID ${result.insertId}). It is queued in the Requests panel and will not run until approved.`,
      };
    } else {
      output = await executeAutoTool(toolName, toolInput, authToken, adminId);
    }
  } catch (err) {
    success = false;
    output = { error: err.message };
  }

  await logTool(sessionId, toolName, toolInput, output, success);
  return output;
}

module.exports = { executeTool };
