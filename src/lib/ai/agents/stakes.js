// src/lib/ai/agents/stakes.js
//
// Stakes tiering for the creator/verifier pair.
//
// Maps each real requestTemplates.js key to a stakes level that decides which
// models run and whether verification happens at all:
//
//   'high'        — money / PO / financial truth. Opus creator + Opus verifier.
//   'mid'         — business-data writes (jobs, parts, notes). Sonnet + Sonnet.
//   'skip_verify' — low-stakes, reversible status/close toggles. Creator only.
//
// A load-time guard enforces two invariants:
//   1. STAKES covers EXACTLY the real template catalog (no drift, no orphans).
//   2. For every verified tier, the verifier model is peer-or-stronger than the
//      creator model (Opus >= Sonnet >= Haiku). A future mis-edit throws here.

const { ORCHESTRATOR, HEAVY, FAST } = require('../models');
const { getTemplateKeys } = require('../requestTemplates');

// ── Stakes assignment (initial; will be tuned) ──────────────────────────────
// Keyed by the exact template keys exported from requestTemplates.js.
const STAKES = {
  // ── job.js ──
  create_job:                         'mid',
  update_job_po:                      'high',  // PO truth
  invoice_and_increment_job:          'high',  // invoice / financial
  link_part_to_job:                   'mid',
  update_job_part_link:               'mid',
  remove_part_from_job:               'mid',
  set_current_job_number:             'mid',
  set_job_status_config:              'mid',
  star_job_part:                      'skip_verify',
  unstar_job_part:                    'skip_verify',
  update_star_status_by_job_part:     'skip_verify',
  update_star_status_by_job_number:   'skip_verify',

  // ── part.js ──
  create_part:                        'mid',
  update_part:                        'mid',
  delete_part:                        'mid',
  delete_part_file:                   'mid',

  // ── notes.js ──
  create_note:                        'mid',
  update_note_status:                 'skip_verify',  // status/close-only
  delete_note:                        'skip_verify',  // dedupe/close-only

  // ── expense.js (financial writes) ──
  create_expense:                     'high',
  update_expense:                     'high',
  delete_expense:                     'high',
  link_expense_to_jobs:               'high',
  unlink_expense_from_job:            'high',
  link_expense_to_periods:            'high',
  unlink_expense_from_period:         'high',

  // ── finances.js (financial writes) ──
  create_financial_period:            'high',
  update_financial_period:            'high',
  delete_financial_period:            'high',
  set_current_financial_period:       'high',
  assign_job_to_period:               'high',
  remove_job_from_period:             'high',
  clear_period_jobs:                  'high',
  assign_jobs_to_period_bulk:         'high',
  assign_jobs_to_period_by_range:     'high',
  assign_expense_to_period:           'high',
  remove_expense_from_period:         'high',
  assign_expenses_to_period_bulk:     'high',
};

const VALID_STAKES = ['high', 'mid', 'skip_verify'];

// ── Model-rank ordinal (for the peer-or-stronger guard) ─────────────────────
// Higher number = stronger model.
const MODEL_RANK = {
  [FAST]:         1,  // haiku
  [ORCHESTRATOR]: 2,  // sonnet
  [HEAVY]:        3,  // opus
};

function rankOf(model) {
  const rank = MODEL_RANK[model];
  if (rank === undefined) {
    throw new Error(`Unknown model "${model}" has no rank in MODEL_RANK`);
  }
  return rank;
}

// ── Stakes → model assignment ───────────────────────────────────────────────
// verifierModel === null means "no verification" (skip_verify): creator only.
const STAKES_MODELS = {
  high:        { creatorModel: HEAVY,        verifierModel: HEAVY },
  mid:         { creatorModel: ORCHESTRATOR, verifierModel: ORCHESTRATOR },
  skip_verify: { creatorModel: ORCHESTRATOR, verifierModel: null },
};

/**
 * Resolve the creator/verifier models for a stakes level.
 * @param {'high'|'mid'|'skip_verify'} stakes
 * @returns {{ creatorModel: string, verifierModel: string|null }}
 */
function modelsForStakes(stakes) {
  const config = STAKES_MODELS[stakes];
  if (!config) {
    throw new Error(`Unknown stakes level "${stakes}". Allowed: ${VALID_STAKES.join(', ')}`);
  }
  return { ...config };
}

/**
 * Look up the stakes for a template key. Throws if the key is not tiered, so a
 * new template can never silently bypass the verification policy.
 * @param {string} templateKey
 * @returns {'high'|'mid'|'skip_verify'}
 */
function stakesForTemplate(templateKey) {
  const stakes = STAKES[templateKey];
  if (!stakes) {
    throw new Error(
      `No stakes assigned for template "${templateKey}". ` +
      `Add it to STAKES in agents/stakes.js.`
    );
  }
  return stakes;
}

// ── Load-time invariants ────────────────────────────────────────────────────
(function enforceInvariants() {
  // 1. STAKES must cover exactly the real template catalog.
  const realKeys = new Set(getTemplateKeys());
  const stakedKeys = new Set(Object.keys(STAKES));

  const missing = [...realKeys].filter((k) => !stakedKeys.has(k));
  const orphaned = [...stakedKeys].filter((k) => !realKeys.has(k));
  if (missing.length) {
    throw new Error(`STAKES is missing template keys: ${missing.join(', ')}`);
  }
  if (orphaned.length) {
    throw new Error(`STAKES references unknown template keys: ${orphaned.join(', ')}`);
  }

  // Every stakes value must be valid.
  for (const [key, stakes] of Object.entries(STAKES)) {
    if (!VALID_STAKES.includes(stakes)) {
      throw new Error(`Template "${key}" has invalid stakes "${stakes}". Allowed: ${VALID_STAKES.join(', ')}`);
    }
  }

  // 2. Verifier must be peer-or-stronger than creator for every verified tier.
  for (const [stakes, { creatorModel, verifierModel }] of Object.entries(STAKES_MODELS)) {
    if (verifierModel === null) continue; // skip_verify: no verifier
    if (rankOf(verifierModel) < rankOf(creatorModel)) {
      throw new Error(
        `Model-rank violation for stakes "${stakes}": verifier "${verifierModel}" ` +
        `(rank ${rankOf(verifierModel)}) is weaker than creator "${creatorModel}" ` +
        `(rank ${rankOf(creatorModel)}). Verifier must be peer-or-stronger.`
      );
    }
  }
})();

module.exports = {
  STAKES,
  STAKES_MODELS,
  MODEL_RANK,
  VALID_STAKES,
  modelsForStakes,
  stakesForTemplate,
  rankOf,
};
