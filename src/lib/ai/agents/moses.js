// src/lib/ai/agents/moses.js
//
// Moses — the VERIFIER.
//
// Moses receives ONLY the filled proposal and the ORIGINAL source evidence.
// He is deliberately blind to Bezalel's reasoning and epistemic block: handing
// him the creator's justification would let confident-but-wrong rationales leak
// through. Independence is the whole point.
//
// His framing is adversarial — "break it", not "build it". For every slot value
// in the proposal he asks: does this trace to the source? Any value that is
// hallucinated, inferred, or unsupported is a failure.
//
// Returns { status: 'pass' } or { status: 'fail', failedSlots, notes }.
// Moses makes no model-of-the-day assumptions and touches no DB.

const { createMessage } = require('../anthropic');
const { TEMPLATES } = require('../requestTemplates');
const { extractJson } = require('./bezalel');

const MAX_TOKENS = 1536;

function renderEvidence(evidence) {
  if (typeof evidence === 'string') return evidence;
  try {
    return JSON.stringify(evidence, null, 2);
  } catch {
    return String(evidence);
  }
}

function describeSlots(tpl) {
  return Object.entries(tpl.params)
    .map(([name, spec]) => {
      const flag = spec.required ? 'REQUIRED' : 'optional';
      const enumStr = spec.enum ? ` — allowed: ${spec.enum.join(' | ')}` : '';
      return `  - ${name} (${spec.type}, ${flag})${enumStr}`;
    })
    .join('\n');
}

function buildSystemPrompt() {
  return [
    'You are Moses, an adversarial verifier. Your job is to BREAK proposals, not',
    'to build or improve them. You are deeply skeptical.',
    '',
    'You are given a filled database-write proposal and the ORIGINAL source',
    'evidence it claims to be based on. You do NOT get the author\'s reasoning —',
    'judge ONLY the values against the source.',
    '',
    'For every filled slot, ask: is this exact value DIRECTLY supported by the',
    'source evidence? A slot FAILS if its value is:',
    '- not present in the source,',
    '- inferred, guessed, or assumed from outside the source,',
    '- subtly wrong (transposed digits, wrong date, wrong id, wrong units),',
    '- a placeholder or fabricated to satisfy a required field.',
    'A required slot left null also fails (the source did not support it).',
    '',
    'Be conservative: if you cannot point to where in the source a value comes',
    'from, it FAILS. Do not give the benefit of the doubt.',
    '',
    'Respond with ONE JSON object and nothing else:',
    '{',
    '  "status": "pass" | "fail",',
    '  "failedSlots": [ { "slot": "<name>", "reason": "<why it fails>" } ],',
    '  "notes": "<short overall rationale>"',
    '}',
    'On pass, failedSlots must be an empty array.',
  ].join('\n');
}

function buildUserPrompt(proposal, sourceEvidence, tpl) {
  return [
    `PROPOSAL TEMPLATE: ${proposal.templateKey}`,
    `TEMPLATE PURPOSE: ${tpl.summary}`,
    '',
    'SLOT DEFINITIONS:',
    describeSlots(tpl),
    '',
    'FILLED VALUES TO SCRUTINISE:',
    JSON.stringify(proposal.params, null, 2),
    '',
    'ORIGINAL SOURCE EVIDENCE (the ONLY ground truth):',
    '"""',
    renderEvidence(sourceEvidence),
    '"""',
    '',
    'Now try to break it. Flag every value you cannot trace to the source.',
  ].join('\n');
}

/**
 * @typedef {object} MosesVerdict
 * @property {'pass'|'fail'} status
 * @property {Array<{slot:string,reason:string}>} [failedSlots]
 * @property {string} [notes]
 */

/**
 * Adversarially verify a proposal against its source evidence.
 *
 * @param {object} input
 * @param {{ templateKey: string, params: object }} input.proposal
 * @param {string|object|Array} input.sourceEvidence
 * @param {object} opts
 * @param {string} opts.verifierModel
 * @param {string|number|null} [opts.sessionId]  Optional session id for usage tracking.
 * @returns {Promise<MosesVerdict>}
 */
async function runMoses({ proposal, sourceEvidence }, { verifierModel, sessionId = null } = {}) {
  if (!verifierModel) throw new Error('runMoses requires a verifierModel');
  if (!proposal || !proposal.templateKey) throw new Error('runMoses requires a filled proposal');

  const tpl = TEMPLATES[proposal.templateKey];
  if (!tpl) throw new Error(`Unknown template "${proposal.templateKey}" — cannot verify`);

  const message = await createMessage({
    model: verifierModel,
    system: buildSystemPrompt(),
    max_tokens: MAX_TOKENS,
    meta: { sessionId, purpose: 'moses' },
    messages: [
      { role: 'user', content: buildUserPrompt(proposal, sourceEvidence, tpl) },
    ],
  });

  const raw = (message.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const parsed = extractJson(raw);
  const status = parsed.status === 'pass' ? 'pass' : 'fail';
  const failedSlots = Array.isArray(parsed.failedSlots) ? parsed.failedSlots : [];
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';

  // Defensive: a "pass" with failedSlots is contradictory — treat as fail.
  if (status === 'pass' && failedSlots.length > 0) {
    return { status: 'fail', failedSlots, notes: `${notes} (auto-downgraded: pass with failed slots)`.trim() };
  }

  return status === 'pass'
    ? { status: 'pass', failedSlots: [], notes }
    : { status: 'fail', failedSlots, notes };
}

module.exports = { runMoses };
