// src/lib/ai/agents/taskEnvelope.js
//
// Task-envelope contract for the Bezalel (creator) / Moses (verifier) pair.
//
// This file is PURE DATA + GUARDS. It makes no model calls and touches no DB.
// It defines the two shapes that flow through the verification loop and the
// helpers that construct and validate them.
//
//   TaskEnvelope  — what goes IN: a capability, the target template key, the
//                   raw source evidence the proposal must trace back to, and
//                   any seed params.
//   ResultEnvelope — what comes OUT: the verified (or skipped) proposal plus the
//                   verifier's verdict and audit trail.
//
// Nothing here is wired into the live write path.

const crypto = require('crypto');

/**
 * Raw source material a proposal must trace back to. Free-form by design:
 * it may be PO-PDF markdown (string), an array of job / job_part records,
 * or a structured object combining several sources. Bezalel reads it to fill
 * template slots; Moses reads the SAME evidence to check every filled slot.
 *
 * @typedef {string|object|Array<object>} SourceEvidence
 */

/**
 * @typedef {object} TaskEnvelope
 * @property {string} taskId        Unique id for this proposal attempt (traces logs).
 * @property {string} capability    Human-readable description of the intent
 *                                   (e.g. "Record the PO number from this PO PDF").
 * @property {string} templateKey   The requestTemplates.js key to fill
 *                                   (e.g. "update_job_po").
 * @property {SourceEvidence} sourceEvidence  Raw source the proposal must cite.
 * @property {object} params        Seed params / known hints (may be empty).
 */

/**
 * @typedef {object} Proposal
 * @property {string} templateKey
 * @property {object} params
 */

/**
 * @typedef {object} FailedSlot
 * @property {string} slot     The param name Moses rejected.
 * @property {string} reason   Why it failed to trace to the source.
 */

/**
 * @typedef {object} ResultEnvelope
 * @property {string} taskId
 * @property {'pass'|'fail'|'error'} status
 * @property {Proposal|null} proposal     The filled proposal, or null on hard error.
 * @property {string} verifierNotes       Moses's free-text rationale (last decision).
 * @property {FailedSlot[]} failedSlots   Slots Moses could not verify (empty on pass).
 * @property {number} attempts            How many Bezalel attempts were made (1 or 2).
 */

const VALID_RESULT_STATUSES = ['pass', 'fail', 'error'];

/**
 * Construct a validated, frozen TaskEnvelope. Generates a taskId if omitted.
 *
 * @param {object} input
 * @param {string} input.capability
 * @param {string} input.templateKey
 * @param {SourceEvidence} input.sourceEvidence
 * @param {object} [input.params]
 * @param {string} [input.taskId]
 * @returns {TaskEnvelope}
 */
function makeTaskEnvelope({ capability, templateKey, sourceEvidence, params = {}, taskId } = {}) {
  const envelope = {
    taskId: taskId || crypto.randomUUID(),
    capability,
    templateKey,
    sourceEvidence,
    params: params && typeof params === 'object' ? params : {},
  };

  const { valid, errors } = validateEnvelopeShape(envelope);
  if (!valid) {
    throw new Error(`Invalid TaskEnvelope: ${errors.join('; ')}`);
  }

  return Object.freeze(envelope);
}

/**
 * Pure shape guard for a TaskEnvelope. Does NOT validate templateKey against
 * the real template catalog (stakes.js / bezalel.js resolve that) — only that
 * the envelope is structurally sound.
 *
 * @param {*} envelope
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEnvelopeShape(envelope) {
  const errors = [];

  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, errors: ['envelope must be an object'] };
  }

  if (typeof envelope.taskId !== 'string' || !envelope.taskId.trim()) {
    errors.push('taskId must be a non-empty string');
  }
  if (typeof envelope.capability !== 'string' || !envelope.capability.trim()) {
    errors.push('capability must be a non-empty string');
  }
  if (typeof envelope.templateKey !== 'string' || !envelope.templateKey.trim()) {
    errors.push('templateKey must be a non-empty string');
  }

  const ev = envelope.sourceEvidence;
  const hasEvidence =
    (typeof ev === 'string' && ev.trim().length > 0) ||
    (Array.isArray(ev) && ev.length > 0) ||
    (ev && typeof ev === 'object' && !Array.isArray(ev) && Object.keys(ev).length > 0);
  if (!hasEvidence) {
    errors.push('sourceEvidence must be a non-empty string, array, or object');
  }

  if (envelope.params !== undefined && (typeof envelope.params !== 'object' || envelope.params === null)) {
    errors.push('params, if present, must be an object');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Construct a ResultEnvelope with sane defaults. Pure.
 *
 * @param {object} input
 * @param {string} input.taskId
 * @param {'pass'|'fail'|'error'} input.status
 * @param {Proposal|null} [input.proposal]
 * @param {string} [input.verifierNotes]
 * @param {FailedSlot[]} [input.failedSlots]
 * @param {number} [input.attempts]
 * @returns {ResultEnvelope}
 */
function makeResultEnvelope({
  taskId,
  status,
  proposal = null,
  verifierNotes = '',
  failedSlots = [],
  attempts = 0,
} = {}) {
  if (!VALID_RESULT_STATUSES.includes(status)) {
    throw new Error(
      `Invalid ResultEnvelope status "${status}". Allowed: ${VALID_RESULT_STATUSES.join(', ')}`
    );
  }
  return Object.freeze({
    taskId,
    status,
    proposal,
    verifierNotes,
    failedSlots: Array.isArray(failedSlots) ? failedSlots : [],
    attempts,
  });
}

module.exports = {
  makeTaskEnvelope,
  validateEnvelopeShape,
  makeResultEnvelope,
  VALID_RESULT_STATUSES,
};
