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

async function executeAutoTool(toolName, toolInput, authToken, adminId, sessionId) {
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

    case 'match_job_by_parts':
      return apiFetch(
        '/api/internal/job/matchjobbyparts',
        'POST',
        { lineItems: toolInput.line_items || [] },
        authToken
      );

    case 'update_nfc_status':
      return apiFetch('/api/internal/job/updatestarjobstatus', 'PUT', toolInput, authToken);

    case 'propose_db_change': {
      const templateKey = toolInput.template;
      const rawParams = toolInput.params || {};
      const sourceEvidence = toolInput.sourceEvidence; // may be undefined/null

      // Resolve + validate the orchestrator's proposal exactly as before. This
      // throws a descriptive error (caught by executeTool) if the template key
      // is unknown or params fail validation — so a bad proposal never queues.
      let { endpoint, method, body } = buildRequestFromTemplate(templateKey, rawParams);

      // ── Verification gate: Bezalel/Moses run BEFORE the human approval gate.
      // It informs the owner; it never blocks. Lazy-required to avoid a
      // load-time circular dependency (verifyLoop imports logTool from here).
      const { makeTaskEnvelope } = require('./agents/taskEnvelope');
      const { runVerifiedProposal, REDEEMED } = require('./agents/verifyLoop');
      const { stakesForTemplate } = require('./agents/stakes');

      const stakes = stakesForTemplate(templateKey);
      const hasEvidence =
        (typeof sourceEvidence === 'string' && sourceEvidence.trim().length > 0) ||
        (Array.isArray(sourceEvidence) && sourceEvidence.length > 0) ||
        (sourceEvidence && typeof sourceEvidence === 'object' &&
          !Array.isArray(sourceEvidence) && Object.keys(sourceEvidence).length > 0);

      let verifierStatus; // 'verified' | 'failed' | 'error' | 'warning' | 'skipped'
      let verifierNotes;  // object → stored in the verifier_notes JSON column

      if (hasEvidence) {
        const envelope = makeTaskEnvelope({
          capability: toolInput.title || toolInput.description || `Write via ${templateKey}`,
          templateKey,
          sourceEvidence,
          params: rawParams,
        });

        const verdict = await runVerifiedProposal(envelope, { sessionId });

        if (verdict.status === 'pass') {
          verifierStatus = stakes === 'skip_verify' ? 'skipped' : 'verified';
          verifierNotes = {
            status: verifierStatus,
            notes: verdict.verifierNotes,
            attempts: verdict.attempts,
            evidence: 'present',
          };
          // Prefer the independently-verified params when they still build a
          // valid request; fall back to the orchestrator's on any mismatch.
          if (verifierStatus === 'verified' && verdict.proposal && verdict.proposal.params) {
            try {
              ({ endpoint, method, body } = buildRequestFromTemplate(templateKey, verdict.proposal.params));
            } catch (mismatchErr) {
              verifierNotes.buildFallback =
                `Verified params failed template validation (${mismatchErr.message}); queued the original proposal instead.`;
            }
          }
        } else {
          // The loop only returns a terminal 'error' (never a bare 'fail').
          const redeemed = typeof verdict.verifierNotes === 'string' &&
            verdict.verifierNotes.includes(REDEEMED);
          verifierStatus = redeemed ? 'failed' : 'error';
          verifierNotes = {
            status: verifierStatus,
            notes: verdict.verifierNotes,
            failedSlots: verdict.failedSlots,
            attempts: verdict.attempts,
            evidence: 'present',
          };
          // Keep the orchestrator's params so the row stays approvable.
        }
      } else {
        // No source evidence. Apply a stakes-based policy — never silently skip
        // verification on a high-stakes write.
        if (stakes === 'skip_verify') {
          verifierStatus = 'skipped';
          verifierNotes = {
            status: 'skipped',
            notes: 'Verification skipped by policy (skip_verify).',
            evidence: 'absent',
          };
        } else if (stakes === 'high') {
          verifierStatus = 'failed';
          verifierNotes = {
            status: 'failed',
            label: 'full error',
            notes: 'No source evidence supplied for a high-stakes write; ' +
              'verification cannot pass. Review carefully before approving.',
            evidence: 'absent',
          };
        } else {
          verifierStatus = 'warning';
          verifierNotes = {
            status: 'warning',
            notes: 'No source evidence supplied; this proposal was not verified ' +
              'against any source. Review before approving.',
            evidence: 'absent',
          };
        }
        // Audit the no-evidence verification decision alongside model decisions.
        await logTool(
          sessionId,
          'verify_no_evidence',
          { templateKey, stakes, hasEvidence: false },
          verifierNotes,
          verifierStatus !== 'failed' && verifierStatus !== 'error'
        );
      }

      const [insert] = await db.query(
        `INSERT INTO ai_approvals (title, description, request_payload, verifier_status, verifier_notes)
         VALUES (?, ?, ?, ?, ?)`,
        [
          toolInput.title,
          toolInput.description,
          JSON.stringify({ template: templateKey, endpoint, method, body }),
          verifierStatus,
          JSON.stringify(verifierNotes),
        ]
      );

      return {
        queued:          true,
        approval_id:     insert.insertId,
        template:        templateKey,
        endpoint,
        method,
        verifier_status: verifierStatus,
        message: `Change request queued (ID ${insert.insertId}); verification: ` +
          `${verifierStatus}. A human must approve it in the Requests panel before it executes.`,
      };
    }

    case 'add_todo': {
      const content = String(toolInput.content || '').slice(0, 500);
      const description =
        typeof toolInput.description === 'string' && toolInput.description.trim()
          ? toolInput.description.trim()
          : null;

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
        `INSERT INTO ai_todos (content, description, source) VALUES (?, ?, 'ai')`,
        [content, description]
      );
      return { id: result.insertId, content, description, created: true };
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

      // Detect actual content type independent of the declared MIME type.
      // Many mail systems (e.g. Oracle workflow mailer) tag every attachment as
      // application/octet-stream, so we cannot rely solely on att.mime_type.
      const hasPdfMagic = att.buffer.length >= 4 &&
        att.buffer[0] === 0x25 && att.buffer[1] === 0x50 &&
        att.buffer[2] === 0x44 && att.buffer[3] === 0x46; // %PDF
      const isPdf =
        att.mime_type === 'application/pdf' ||
        hasPdfMagic ||
        /\.pdf$/i.test(att.filename);

      if (isPdf) {
        // Download → stage in ai_uploads → MarkItDown parse → delete staging row.
        const { parsePdfBuffer } = require('./pdfParser');
        const effectiveFilename = /\.pdf$/i.test(att.filename)
          ? att.filename
          : att.filename.replace(/(\.[^.]*)?$/, '.pdf');
        const parsed = await parsePdfBuffer({
          buffer: att.buffer,
          filename: effectiveFilename,
          mimetype: 'application/pdf',
          sessionId,
        });
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

      // For any remaining type (including octet-stream with an unknown extension),
      // attempt MarkItDown conversion — it infers format from content and extension.
      // Only fall back to metadata-only if conversion genuinely throws.
      try {
        const { convertToMarkdown, isMarkitdownAvailable } = require('./markitdown');
        if (await isMarkitdownAvailable()) {
          const markdown = await convertToMarkdown(att.buffer, att.filename);
          if (markdown && markdown.trim()) {
            return { filename: att.filename, mime_type: att.mime_type, kind: 'converted', text: markdown };
          }
        }
      } catch (_) {
        // Conversion failed — fall through to metadata-only response.
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
      output = await executeAutoTool(toolName, toolInput, authToken, adminId, sessionId);
    }
  } catch (err) {
    success = false;
    output = { error: err.message };
  }

  await logTool(sessionId, toolName, toolInput, output, success);
  return output;
}

module.exports = { executeTool, logTool };
