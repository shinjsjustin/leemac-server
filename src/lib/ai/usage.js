// src/lib/ai/usage.js
// Token-usage ledger for Jarvis' Anthropic spend.
//
// Every Anthropic response carries a `usage` object. This module records one row
// per model call (fire-and-forget — recording must NEVER break a model call, same
// philosophy as executor.logTool), rolls the ledger up into a cost dashboard, and
// backs an optional per-day token budget guard.

const db = require('../../db/db');
const { ORCHESTRATOR, HEAVY, FAST } = require('./models');
const { torontoDayBounds } = require('./time');

// ── Pricing ─────────────────────────────────────────────────────────────────
// Estimated US dollars per 1,000,000 tokens (MTok), keyed by the model strings in
// models.js. These are ESTIMATES taken from Anthropic's published pricing at
// implementation time — UPDATE THEM when Anthropic changes prices or when the
// model strings in models.js change. Cache-token pricing is intentionally not
// modelled yet (columns can be added later).
const PRICES_PER_MTOK = {
  [ORCHESTRATOR]: { input: 3, output: 15 },   // Sonnet tier
  [HEAVY]:        { input: 15, output: 75 },  // Opus tier
  [FAST]:         { input: 1, output: 5 },    // Haiku tier
};

// ── Recording ─────────────────────────────────────────────────────────────────

/**
 * Insert one usage row. Best-effort: any failure is logged and swallowed so a
 * usage-tracking problem can never break a model call.
 *
 * @param {object} args
 * @param {string|number|null} [args.sessionId]
 * @param {string} args.model
 * @param {string} args.purpose
 * @param {{ input_tokens?: number, output_tokens?: number }} [args.usage]
 */
async function recordUsage({ sessionId = null, model, purpose, usage } = {}) {
  try {
    if (!model || !purpose || !usage) return;
    const inputTokens = Number(usage.input_tokens) || 0;
    const outputTokens = Number(usage.output_tokens) || 0;
    await db.query(
      `INSERT INTO ai_usage (session_id, model, purpose, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId || null, model, purpose, inputTokens, outputTokens]
    );
  } catch (err) {
    // Recording must never crash the caller.
    console.error('[ai_usage] insert failed:', err.message);
  }
}

// ── Cost estimation ─────────────────────────────────────────────────────────

/**
 * Sum rows into a dollar estimate using PRICES_PER_MTOK. Rows whose model is not
 * in the price map contribute their tokens to the summary but nothing to cost
 * (their price is unknown). Returns a number of US dollars.
 *
 * @param {Array<{ model: string, input_tokens: number, output_tokens: number }>} rows
 * @returns {number}
 */
function estimateCostUsd(rows) {
  let usd = 0;
  for (const row of rows || []) {
    const price = PRICES_PER_MTOK[row.model];
    if (!price) continue; // unknown model → cost unknown, skip (tokens still counted elsewhere)
    const inTok = Number(row.input_tokens) || 0;
    const outTok = Number(row.output_tokens) || 0;
    usd += (inTok / 1_000_000) * price.input + (outTok / 1_000_000) * price.output;
  }
  return Math.round(usd * 10000) / 10000; // round to 4 decimals ($0.0001)
}

// ── Rollup summary ────────────────────────────────────────────────────────────

/**
 * Grouped usage rollup for the last `days` days: per-day and per-purpose totals
 * (tokens + cost estimate) plus a grand total.
 *
 * @param {object} [opts]
 * @param {number} [opts.days]  Lookback window in days (default 7, clamped 1–365).
 */
async function getUsageSummary({ days = 7 } = {}) {
  const windowDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 365);

  const [rows] = await db.query(
    `SELECT DATE(created_at) AS day, purpose, model,
            SUM(input_tokens)  AS input_tokens,
            SUM(output_tokens) AS output_tokens
     FROM ai_usage
     WHERE created_at >= (NOW() - INTERVAL ? DAY)
     GROUP BY day, purpose, model
     ORDER BY day DESC, purpose ASC`,
    [windowDays]
  );

  const byDay = new Map();
  const byPurpose = new Map();
  let grandInput = 0;
  let grandOutput = 0;

  for (const row of rows) {
    const inTok = Number(row.input_tokens) || 0;
    const outTok = Number(row.output_tokens) || 0;
    const cost = estimateCostUsd([row]);
    const dayKey = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day);

    const dayAgg = byDay.get(dayKey) || { day: dayKey, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    dayAgg.inputTokens += inTok;
    dayAgg.outputTokens += outTok;
    dayAgg.costUsd = Math.round((dayAgg.costUsd + cost) * 10000) / 10000;
    byDay.set(dayKey, dayAgg);

    const purposeAgg = byPurpose.get(row.purpose) || {
      purpose: row.purpose,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    purposeAgg.inputTokens += inTok;
    purposeAgg.outputTokens += outTok;
    purposeAgg.costUsd = Math.round((purposeAgg.costUsd + cost) * 10000) / 10000;
    byPurpose.set(row.purpose, purposeAgg);

    grandInput += inTok;
    grandOutput += outTok;
  }

  return {
    days: windowDays,
    perDay: Array.from(byDay.values()),
    perPurpose: Array.from(byPurpose.values()),
    total: {
      inputTokens: grandInput,
      outputTokens: grandOutput,
      totalTokens: grandInput + grandOutput,
      costUsd: estimateCostUsd(rows),
    },
  };
}

// ── Daily budget guard ────────────────────────────────────────────────────────

/**
 * If the env var AI_DAILY_TOKEN_BUDGET (integer total tokens/day) is set, returns
 * today's usage against it for the Toronto calendar day. Returns null when no
 * budget is configured (callers treat null as "no gating").
 *
 * @returns {Promise<{ exceeded: boolean, used: number, budget: number } | null>}
 */
async function checkDailyBudget() {
  const raw = process.env.AI_DAILY_TOKEN_BUDGET;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const budget = parseInt(raw, 10);
  if (Number.isNaN(budget) || budget <= 0) return null;

  try {
    const { start, end } = torontoDayBounds();
    const [[row]] = await db.query(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS used
       FROM ai_usage
       WHERE created_at >= ? AND created_at < ?`,
      [start, end]
    );
    const used = Number(row?.used) || 0;
    return { exceeded: used >= budget, used, budget };
  } catch (err) {
    // A budget-check failure must not block chat; fail open (no gating).
    console.error('[ai_usage] budget check failed:', err.message);
    return null;
  }
}

module.exports = {
  PRICES_PER_MTOK,
  recordUsage,
  estimateCostUsd,
  getUsageSummary,
  checkDailyBudget,
};
