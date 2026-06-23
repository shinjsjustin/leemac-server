// src/lib/ai/agents/verifyLoop.js
//
// The verified-proposal loop driver.
//
// Orchestrates the Bezalel (creator) → Moses (verifier) handshake with a single
// retry, and logs every step to ai_tool_log so rejections are queryable later
// (e.g. to spot a template whose slots fail systematically).
//
// Policy:
//   - skip_verify stakes  → Bezalel only; returns 'pass' with a policy note.
//   - high / mid stakes   → Bezalel creates, Moses verifies.
//       * pass on attempt 1            → status 'pass'  (attempts: 1)
//       * fail then pass on retry      → status 'pass'  (attempts: 2)
//       * fail then fail on retry      → status 'error' (attempts: 2)
//           - flagged 'ai error but redeemed' if the retry reduced the number of
//             failed slots, otherwise 'full error'.
//
// This driver does NOT touch ai_approvals. The caller (next prompt) decides what
// to do with a passing proposal. Independence is preserved: Moses never receives
// Bezalel's reasoning/epistemic block — only the filled proposal + source evidence.

const { logTool } = require('../executor');
const { stakesForTemplate, modelsForStakes } = require('./stakes');
const { makeResultEnvelope, validateEnvelopeShape } = require('./taskEnvelope');
const { runBezalel } = require('./bezalel');
const { runMoses } = require('./moses');

const REDEEMED = 'ai error but redeemed';
const FULL_ERROR = 'full error';

/**
 * Log a creator step.
 */
async function logBezalel(sessionId, taskEnvelope, stakes, attempt, model, output, success) {
  await logTool(
    sessionId,
    'bezalel',
    {
      taskId: taskEnvelope.taskId,
      templateKey: taskEnvelope.templateKey,
      stakes,
      attempt,
      model,
      capability: taskEnvelope.capability,
    },
    output,
    success
  );
}

/**
 * Log a verifier decision. Kept under tool_name 'moses' so rejections are
 * filterable in ai_tool_log.
 */
async function logMoses(sessionId, taskEnvelope, stakes, attempt, model, verdict, success) {
  await logTool(
    sessionId,
    'moses',
    {
      taskId: taskEnvelope.taskId,
      templateKey: taskEnvelope.templateKey,
      stakes,
      attempt,
      model,
    },
    verdict,
    success
  );
}

/**
 * Run the creator/verifier loop for a single task.
 *
 * @param {import('./taskEnvelope').TaskEnvelope} taskEnvelope
 * @param {object} [opts]
 * @param {string|number|null} [opts.sessionId]  Optional session id for the audit log.
 * @returns {Promise<import('./taskEnvelope').ResultEnvelope>}
 */
async function runVerifiedProposal(taskEnvelope, { sessionId = null } = {}) {
  const { valid, errors } = validateEnvelopeShape(taskEnvelope);
  if (!valid) {
    throw new Error(`runVerifiedProposal: invalid task envelope: ${errors.join('; ')}`);
  }

  const stakes = stakesForTemplate(taskEnvelope.templateKey);
  const { creatorModel, verifierModel } = modelsForStakes(stakes);

  // ── skip_verify: create only, no Moses ────────────────────────────────────
  if (stakes === 'skip_verify') {
    let created;
    try {
      created = await runBezalel(taskEnvelope, { creatorModel });
    } catch (err) {
      await logBezalel(sessionId, taskEnvelope, stakes, 1, creatorModel, { error: err.message }, false);
      return makeResultEnvelope({
        taskId: taskEnvelope.taskId,
        status: 'error',
        proposal: null,
        verifierNotes: `Creator failed and policy skips verification: ${err.message}`,
        failedSlots: [],
        attempts: 1,
      });
    }
    await logBezalel(sessionId, taskEnvelope, stakes, 1, creatorModel, created, true);
    return makeResultEnvelope({
      taskId: taskEnvelope.taskId,
      status: 'pass',
      proposal: created.proposal,
      verifierNotes: 'Verification skipped by policy (skip_verify).',
      failedSlots: [],
      attempts: 1,
    });
  }

  // ── Verified tiers (high / mid) ───────────────────────────────────────────
  let firstFailedCount = null;
  let lastFailure;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const priorFailure = attempt === 2 ? lastFailure : undefined;

    // 1. Create
    let created;
    try {
      created = await runBezalel(taskEnvelope, { creatorModel, priorFailure });
      await logBezalel(sessionId, taskEnvelope, stakes, attempt, creatorModel, created, true);
    } catch (err) {
      await logBezalel(sessionId, taskEnvelope, stakes, attempt, creatorModel, { error: err.message }, false);
      return makeResultEnvelope({
        taskId: taskEnvelope.taskId,
        status: 'error',
        proposal: null,
        verifierNotes: `Creator error on attempt ${attempt}: ${err.message}`,
        failedSlots: [],
        attempts: attempt,
      });
    }

    // 2. Verify (Moses sees ONLY the proposal + original evidence)
    let verdict;
    try {
      verdict = await runMoses(
        { proposal: created.proposal, sourceEvidence: taskEnvelope.sourceEvidence },
        { verifierModel }
      );
      await logMoses(sessionId, taskEnvelope, stakes, attempt, verifierModel, verdict, true);
    } catch (err) {
      await logMoses(sessionId, taskEnvelope, stakes, attempt, verifierModel, { error: err.message }, false);
      return makeResultEnvelope({
        taskId: taskEnvelope.taskId,
        status: 'error',
        proposal: created.proposal,
        verifierNotes: `Verifier error on attempt ${attempt}: ${err.message}`,
        failedSlots: [],
        attempts: attempt,
      });
    }

    if (verdict.status === 'pass') {
      return makeResultEnvelope({
        taskId: taskEnvelope.taskId,
        status: 'pass',
        proposal: created.proposal,
        verifierNotes: verdict.notes || '',
        failedSlots: [],
        attempts: attempt,
      });
    }

    // Failed — remember for retry / escalation.
    lastFailure = { failedSlots: verdict.failedSlots, notes: verdict.notes };
    if (attempt === 1) {
      firstFailedCount = verdict.failedSlots.length;
    } else {
      // Second and final failure → escalate to error.
      const secondFailedCount = verdict.failedSlots.length;
      const redeemed = firstFailedCount !== null && secondFailedCount < firstFailedCount;
      const flag = redeemed ? REDEEMED : FULL_ERROR;
      return makeResultEnvelope({
        taskId: taskEnvelope.taskId,
        status: 'error',
        proposal: created.proposal,
        verifierNotes: `[${flag}] ${verdict.notes || ''}`.trim(),
        failedSlots: verdict.failedSlots,
        attempts: 2,
      });
    }
  }

  // Unreachable, but keep a definite return for the type contract.
  return makeResultEnvelope({
    taskId: taskEnvelope.taskId,
    status: 'error',
    proposal: null,
    verifierNotes: 'Loop terminated unexpectedly.',
    failedSlots: [],
    attempts: 2,
  });
}

module.exports = { runVerifiedProposal, REDEEMED, FULL_ERROR };
