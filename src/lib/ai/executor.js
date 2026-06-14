// src/lib/ai/executor.js
// Executes tool calls from the orchestrator.
// Auto-tier tools call backend endpoints directly.
// Approval/always_ask-tier tools insert into ai_approvals instead of executing.
// Every call is logged to ai_tool_log.

const db = require('../../db/db');
const { PERMISSION_TIER } = require('./tools');

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

async function executeAutoTool(toolName, toolInput, authToken) {
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
      const [result] = await db.query(
        `INSERT INTO ai_approvals (title, description, request_payload)
         VALUES (?, ?, ?)`,
        [
          toolInput.title,
          toolInput.description,
          JSON.stringify({
            endpoint: toolInput.endpoint,
            method:   toolInput.method,
            body:     toolInput.body || {},
          }),
        ]
      );
      return {
        queued:      true,
        approval_id: result.insertId,
        message:     `Change request queued (ID ${result.insertId}). A human must approve it in the Requests panel before it executes.`,
      };
    }

    case 'add_todo': {
      const content = String(toolInput.content || '').slice(0, 500);
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

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, { sessionId, authToken }) {
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
      output = await executeAutoTool(toolName, toolInput, authToken);
    }
  } catch (err) {
    success = false;
    output = { error: err.message };
  }

  await logTool(sessionId, toolName, toolInput, output, success);
  return output;
}

module.exports = { executeTool };
