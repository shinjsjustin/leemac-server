// src/lib/ai/agents/parallelDispatch.js
//
// Bounded-concurrency runner for the Bezalel → Moses verified-proposal loop.
//
// This is INFRASTRUCTURE, not a workflow. It knows nothing about PDFs, parts,
// quoting, or any business intent. It takes a list of opaque TaskEnvelopes and
// runs each one through the EXISTING dispatch function (runVerifiedProposal),
// up to N at a time, and collects every result.
//
// Design contract:
//   - It WRAPS runVerifiedProposal; it never replaces or alters the sequential
//     one-off path. A single-item list behaves identically to a direct dispatch.
//   - It only SCHEDULES. It does not decide which model creates or verifies —
//     that stays entirely inside verifyLoop.js / stakes.js (Bezalel/Moses
//     integrity, verifier peer-or-stronger). This file imports neither model.
//   - It NEVER short-circuits. One subagent erroring (retry cap, thrown
//     exception, bad envelope) does not reject the batch; the others run to
//     completion and every task gets a tagged outcome.
//
// Scoping note: the Bezalel/Moses loop does not write ai_messages, and
// ai_tool_log rows are already keyed per task by `taskId` inside tool_input.
// Since ai_sessions has UNIQUE(session_date) we cannot mint a child session per
// subagent, so per-subagent scope is expressed as: a unique taskId per task +
// a shared parentTaskId batch marker, threaded into the audit log via logTool.
// The shared day session_id is passed straight through, exactly as the
// sequential path does.

const crypto = require('crypto');
const { logTool } = require('../executor');
const { makeTaskEnvelope, validateEnvelopeShape } = require('./taskEnvelope');
const { runVerifiedProposal } = require('./verifyLoop');

const DEFAULT_CONCURRENCY = 4;

/**
 * @typedef {object} SubagentOutcome
 * @property {number} index               Position in the input `tasks` array.
 * @property {string|null} taskId         The subagent's unique task id (its scope).
 * @property {string} parentTaskId        The batch marker tying children together.
 * @property {'success'|'error'} status   success = loop passed; error = anything else.
 * @property {import('./taskEnvelope').ResultEnvelope|null} result
 *           The full ResultEnvelope from the loop (present whenever the loop ran,
 *           including verified-error outcomes — it carries Moses's failedSlots).
 * @property {{ stage: string, message: string, verifierNotes?: string,
 *             failedSlots?: Array, attempts?: number }|null} error
 *           Populated on error: the "full error" payload from Moses, or the
 *           thrown error for a hard failure.
 */

/**
 * @typedef {object} BatchResult
 * @property {string} parentTaskId
 * @property {number} concurrency         Effective worker count used.
 * @property {number} total
 * @property {number} succeeded
 * @property {number} failed
 * @property {SubagentOutcome[]} outcomes In input order, one per task.
 */

/**
 * Is this object already a built TaskEnvelope (vs. raw construction input)?
 * @param {*} task
 * @returns {boolean}
 */
function looksLikeEnvelope(task) {
  return Boolean(
    task &&
    typeof task === 'object' &&
    typeof task.taskId === 'string' &&
    task.taskId.trim() &&
    typeof task.templateKey === 'string'
  );
}

/**
 * Bounded worker pool over `items`. Spawns up to `concurrency` workers that pull
 * the next index off a shared cursor as they free up — so a slow task never
 * blocks the others and the whole list drains in waves of at most N. The cursor
 * read/increment is synchronous (single-threaded event loop), so it is safe.
 * `worker` must never throw — callers wrap their own errors into a result.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const drain = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => drain()));
  return results;
}

/**
 * Record a per-subagent scope row so a batch's children are queryable later and
 * linkable to their parent. Reuses the same logTool the sequential path uses;
 * the Bezalel/Moses rows are still written (unchanged) inside verifyLoop.
 *
 * @param {string|number|null} sessionId
 * @param {string} parentTaskId
 * @param {object} envelope
 * @param {number} index
 * @param {SubagentOutcome} outcome
 */
async function logDispatch(sessionId, parentTaskId, envelope, index, outcome) {
  await logTool(
    sessionId,
    'subagent_dispatch',
    {
      parentTaskId,
      taskId: envelope?.taskId ?? null,
      templateKey: envelope?.templateKey ?? null,
      capability: envelope?.capability ?? null,
      index,
    },
    {
      status: outcome.status,
      resultStatus: outcome.result?.status ?? null,
      attempts: outcome.result?.attempts ?? null,
      failedSlots: outcome.result?.failedSlots ?? outcome.error?.failedSlots ?? null,
    },
    outcome.status === 'success'
  );
}

/**
 * Run one task end-to-end. Catches EVERYTHING so a single failure can never
 * reject the batch. Normalises raw input into a TaskEnvelope (validating and
 * minting a unique taskId), runs the existing verified-proposal loop, then maps
 * the ResultEnvelope onto a tagged outcome.
 *
 * @param {*} rawTask
 * @param {number} index
 * @param {string} parentTaskId
 * @param {string|number|null} sessionId
 * @returns {Promise<SubagentOutcome>}
 */
async function runOne(rawTask, index, parentTaskId, sessionId) {
  // 1. Normalise to a valid envelope with a guaranteed-unique taskId.
  let envelope;
  try {
    if (looksLikeEnvelope(rawTask)) {
      const { valid, errors } = validateEnvelopeShape(rawTask);
      if (!valid) throw new Error(`invalid task envelope: ${errors.join('; ')}`);
      envelope = rawTask;
    } else {
      envelope = makeTaskEnvelope(rawTask || {});
    }
  } catch (err) {
    const outcome = {
      index,
      taskId: looksLikeEnvelope(rawTask) ? rawTask.taskId : null,
      parentTaskId,
      status: 'error',
      result: null,
      error: { stage: 'envelope', message: err.message },
    };
    await logDispatch(sessionId, parentTaskId, envelope, index, outcome);
    return outcome;
  }

  // 2. Run the EXISTING dispatch — models/verification policy untouched.
  let outcome;
  try {
    const result = await runVerifiedProposal(envelope, { sessionId });
    if (result.status === 'pass') {
      outcome = {
        index,
        taskId: envelope.taskId,
        parentTaskId,
        status: 'success',
        result,
        error: null,
      };
    } else {
      // 'error' (or a defensive 'fail') — keep the full envelope so the caller
      // has Moses's failedSlots / "full error" notes attached.
      outcome = {
        index,
        taskId: envelope.taskId,
        parentTaskId,
        status: 'error',
        result,
        error: {
          stage: 'verify',
          message: result.verifierNotes || `loop returned status "${result.status}"`,
          verifierNotes: result.verifierNotes,
          failedSlots: result.failedSlots,
          attempts: result.attempts,
        },
      };
    }
  } catch (err) {
    // A hard throw escaping the loop — still just one task's failure.
    outcome = {
      index,
      taskId: envelope.taskId,
      parentTaskId,
      status: 'error',
      result: null,
      error: { stage: 'dispatch', message: err.message },
    };
  }

  await logDispatch(sessionId, parentTaskId, envelope, index, outcome);
  return outcome;
}

/**
 * Run many verified-proposal tasks with bounded concurrency, collecting every
 * result. Never short-circuits.
 *
 * @param {Array<object>} tasks            TaskEnvelopes (or raw makeTaskEnvelope
 *                                         input). Opaque to this runner.
 * @param {object} [opts]
 * @param {string|number|null} [opts.sessionId]    Shared day session for the audit log.
 * @param {number} [opts.concurrency=4]            Max subagents in flight at once.
 * @param {string} [opts.parentTaskId]             Batch marker; generated if omitted.
 * @returns {Promise<BatchResult>}
 */
async function runVerifiedProposalsParallel(tasks, { sessionId = null, concurrency, parentTaskId } = {}) {
  if (!Array.isArray(tasks)) {
    throw new Error('runVerifiedProposalsParallel: tasks must be an array');
  }

  const parent = parentTaskId || crypto.randomUUID();
  const requested = Number(concurrency);
  const effectiveConcurrency = Number.isInteger(requested) && requested >= 1
    ? requested
    : DEFAULT_CONCURRENCY;

  if (tasks.length === 0) {
    return { parentTaskId: parent, concurrency: effectiveConcurrency, total: 0, succeeded: 0, failed: 0, outcomes: [] };
  }

  const outcomes = await runPool(
    tasks,
    effectiveConcurrency,
    (task, index) => runOne(task, index, parent, sessionId)
  );

  const succeeded = outcomes.filter((o) => o.status === 'success').length;

  return {
    parentTaskId: parent,
    concurrency: Math.max(1, Math.min(effectiveConcurrency, tasks.length)),
    total: outcomes.length,
    succeeded,
    failed: outcomes.length - succeeded,
    outcomes,
  };
}

module.exports = { runVerifiedProposalsParallel, DEFAULT_CONCURRENCY };
