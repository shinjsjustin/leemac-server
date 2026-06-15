// src/routes/jarvis/approvals.js
// Jarvis approval queue — list, inspect, submit, and reject proposed DB changes.
// All routes are owner-only (enforced by the parent router via isAuth + access check).

const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { runOrchestrator } = require('../../lib/ai/orchestrator');

// ASSUMPTION: uploaded_files has columns (filename, mimetype, size, content) with
// optional part_id and note_id nullable columns. We insert with part_id=NULL and
// note_id=NULL since the promoted file is AI-staged and not yet linked to a specific
// part or note. Adjust if the promotion flow needs those FK values.

const ALLOWED_ENDPOINTS = [
  '/api/internal/job/',
  '/api/internal/part/',
  '/api/internal/notes/',
  '/api/internal/finances/',
  '/api/internal/expenses',
];

function isEndpointAllowed(endpoint) {
  return ALLOWED_ENDPOINTS.some((prefix) => endpoint.startsWith(prefix));
}

function toApprovalSummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ── GET /approvals ─────────────────────────────────────────────────────────────
// List approvals by status (default: pending). Returns summary rows.

router.get('/', async (req, res) => {
  const status = req.query.status || 'pending';
  const validStatuses = ['pending', 'approved', 'rejected', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, title, description, status, created_at
       FROM ai_approvals
       WHERE status = ?
       ORDER BY created_at DESC`,
      [status]
    );

    return res.json(rows.map(toApprovalSummary));
  } catch (err) {
    console.error('[approvals] GET / error:', err);
    return res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// ── GET /approvals/:id ─────────────────────────────────────────────────────────
// Full detail including parsed request_payload and linked upload metadata.

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(
      `SELECT id, title, description, request_payload, status,
              rejection_reason, linked_upload_id, created_at, resolved_at
       FROM ai_approvals
       WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    const approval = rows[0];

    let requestPayload;
    try {
      requestPayload = typeof approval.request_payload === 'string'
        ? JSON.parse(approval.request_payload)
        : approval.request_payload;
    } catch {
      requestPayload = approval.request_payload;
    }

    let uploadMeta = null;
    if (approval.linked_upload_id) {
      const [uploadRows] = await db.execute(
        `SELECT filename, mimetype, size FROM ai_uploads WHERE id = ?`,
        [approval.linked_upload_id]
      );
      if (uploadRows.length) {
        uploadMeta = {
          filename: uploadRows[0].filename,
          mimetype: uploadRows[0].mimetype,
          size: uploadRows[0].size,
        };
      }
    }

    return res.json({
      id: approval.id,
      title: approval.title,
      description: approval.description,
      requestPayload,
      status: approval.status,
      rejectionReason: approval.rejection_reason,
      linkedUploadId: approval.linked_upload_id,
      uploadMeta,
      createdAt: approval.created_at,
      resolvedAt: approval.resolved_at,
    });
  } catch (err) {
    console.error('[approvals] GET /:id error:', err);
    return res.status(500).json({ error: 'Failed to fetch approval' });
  }
});

// ── POST /approvals/:id/submit ─────────────────────────────────────────────────
// Execute the queued change, promote any linked upload, then mark approved.

router.post('/:id/submit', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Load approval — must be pending
    const [rows] = await db.execute(
      `SELECT id, title, description, request_payload, linked_upload_id, status
       FROM ai_approvals WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    const approval = rows[0];

    if (approval.status !== 'pending') {
      return res.status(409).json({ error: `Approval is already ${approval.status}` });
    }

    // 2. Parse request_payload
    let payload;
    try {
      payload = typeof approval.request_payload === 'string'
        ? JSON.parse(approval.request_payload)
        : approval.request_payload;
    } catch {
      return res.status(500).json({ error: 'Invalid request_payload in approval record' });
    }

    const { endpoint, method, body, permissionTier } = payload;

    // 3. Validate endpoint against allowlist
    if (!endpoint || !isEndpointAllowed(endpoint)) {
      return res.status(400).json({ error: `Endpoint not in allowlist: ${endpoint}` });
    }

    // 4. Require explicit confirmation for always_ask tier
    if (permissionTier === 'always_ask') {
      if (!req.body || req.body.confirm !== true) {
        return res.status(400).json({ requiresConfirm: true, error: 'This action requires explicit confirmation' });
      }
    }

    // 5. Execute the backend request
    const baseUrl = process.env.INTERNAL_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    let backendResponse;
    let backendResult;

    try {
      const isBodyMethod = !['GET', 'HEAD'].includes((method || 'POST').toUpperCase());
      backendResponse = await fetch(`${baseUrl}${endpoint}`, {
        method: method || 'POST',
        headers: {
          Authorization: req.headers.authorization,
          'Content-Type': 'application/json',
        },
        ...(isBodyMethod ? { body: JSON.stringify(body) } : {}),
      });

      backendResult = await backendResponse.json().catch(() => null);

      if (!backendResponse.ok) {
        console.error('[approvals] submit: internal endpoint returned error', {
          approvalId: id,
          endpoint,
          method,
          status: backendResponse.status,
          detail: backendResult,
        });
        return res.status(502).json({
          error: 'Backend endpoint returned an error',
          status: backendResponse.status,
          detail: backendResult,
        });
      }
    } catch (fetchErr) {
      console.error('[approvals] submit fetch error:', fetchErr);
      return res.status(502).json({ error: 'Failed to reach backend endpoint', detail: fetchErr.message });
    }

    // 6. Promote linked upload if present
    if (approval.linked_upload_id) {
      const [uploadRows] = await db.execute(
        `SELECT filename, mimetype, size, content FROM ai_uploads WHERE id = ?`,
        [approval.linked_upload_id]
      );

      if (uploadRows.length) {
        const upload = uploadRows[0];

        await db.execute(
          `INSERT INTO uploaded_files (filename, mimetype, size, content)
           VALUES (?, ?, ?, ?)`,
          [upload.filename, upload.mimetype, upload.size, upload.content]
        );

        await db.execute(
          `UPDATE ai_uploads SET status = 'promoted' WHERE id = ?`,
          [approval.linked_upload_id]
        );
      }
    }

    // 7. Mark approval as approved
    await db.execute(
      `UPDATE ai_approvals SET status = 'approved', resolved_at = NOW() WHERE id = ?`,
      [id]
    );

    // 8. Audit log
    await db.execute(
      `INSERT INTO ai_tool_log (tool_name, tool_input, tool_output, success)
       VALUES ('submit_approval', ?, ?, 1)`,
      [
        JSON.stringify({ approvalId: id, endpoint, method }),
        JSON.stringify(backendResult),
      ]
    );

    return res.json({ success: true, result: backendResult });
  } catch (err) {
    console.error('[approvals] POST /:id/submit error:', err);
    return res.status(500).json({ error: 'Failed to submit approval' });
  }
});

// ── POST /approvals/:id/reject ─────────────────────────────────────────────────
// Reject a request. action='finish' deletes it; action='retry' re-runs the
// orchestrator with the supplied reason. A reason is only required for 'retry'.

router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason, action } = req.body || {};

  if (!action || !['retry', 'finish'].includes(action)) {
    return res.status(400).json({ error: 'action must be "retry" or "finish"' });
  }

  // A reason is only meaningful for "try again" — finish just discards the request.
  if (action === 'retry' && (!reason || typeof reason !== 'string' || !reason.trim())) {
    return res.status(400).json({ error: 'reason is required to try again' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, title, description, status FROM ai_approvals WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    const approval = rows[0];

    if (approval.status !== 'pending') {
      return res.status(409).json({ error: `Approval is already ${approval.status}` });
    }

    // "finish" simply deletes the request — no reason recorded.
    if (action === 'finish') {
      await db.execute(`DELETE FROM ai_approvals WHERE id = ?`, [id]);
      return res.json({ done: true });
    }

    // action === 'retry': record the rejection reason, then ask the orchestrator
    // to propose an alternative.
    await db.execute(
      `UPDATE ai_approvals
       SET status = 'rejected', rejection_reason = ?, resolved_at = NOW()
       WHERE id = ?`,
      [reason.trim(), id]
    );

    // action === 'retry': ask the orchestrator to propose an alternative
    const retryMessage =
      `The following proposed action was rejected by the user.\n\n` +
      `Title: ${approval.title}\n` +
      `Description: ${approval.description}\n` +
      `Rejection reason: ${reason.trim()}\n\n` +
      `Please review the rejection reason and propose a revised action via propose_db_change.`;

    const orchestratorResult = await runOrchestrator(retryMessage, {
      authToken: req.headers.authorization,
    });

    return res.json({
      done: false,
      orchestratorText: orchestratorResult.text,
      sessionId: orchestratorResult.sessionId,
    });
  } catch (err) {
    console.error('[approvals] POST /:id/reject error:', err);
    return res.status(500).json({ error: 'Failed to reject approval' });
  }
});

module.exports = router;
