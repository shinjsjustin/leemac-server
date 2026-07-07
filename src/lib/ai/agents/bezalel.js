// src/lib/ai/agents/bezalel.js
//
// Bezalel — the CREATOR.
//
// Named for the craftsman of Exodus who built exactly to specification.
// Bezalel takes a TaskEnvelope (capability + templateKey + sourceEvidence),
// selects the named requestTemplates.js template, and fills its slots STRICTLY
// from the evidence — never from outside knowledge.
//
// It returns a filled proposal { templateKey, params } PLUS an epistemic block
// mapping each slot to where in the source it was drawn from. Bezalel knows
// NOTHING about the owner's day or business context: evidence in, template out.
//
// Bezalel does NOT validate, queue, or touch the DB. It only produces the
// proposal. Retry-cap enforcement lives in the caller (verifyLoop.js).

const { createMessage } = require('../anthropic');
const { TEMPLATES } = require('../requestTemplates');

const MAX_TOKENS = 2048;

/**
 * @typedef {object} BezalelOutput
 * @property {{ templateKey: string, params: object }} proposal
 * @property {Object<string,string>} epistemic  slot → where in the source it came from
 * @property {string} raw                        raw model text (for logging/debug)
 */

/**
 * Describe a template's slots for the prompt.
 * @param {object} tpl
 * @returns {string}
 */
function describeSlots(tpl) {
  return Object.entries(tpl.params)
    .map(([name, spec]) => {
      const flag = spec.required ? 'REQUIRED' : 'optional';
      const enumStr = spec.enum ? ` — allowed values: ${spec.enum.join(' | ')}` : '';
      return `  - ${name} (${spec.type}, ${flag}): ${spec.description}${enumStr}`;
    })
    .join('\n');
}

/**
 * Render evidence as text for the prompt.
 * @param {string|object|Array} evidence
 * @returns {string}
 */
function renderEvidence(evidence) {
  if (typeof evidence === 'string') return evidence;
  try {
    return JSON.stringify(evidence, null, 2);
  } catch {
    return String(evidence);
  }
}

/**
 * Extract the first JSON object from model text (tolerates ```json fences and
 * surrounding prose).
 * @param {string} text
 * @returns {object}
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Bezalel returned empty output');
  }
  // Prefer a fenced block if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  // Find the first balanced top-level object.
  const start = candidate.indexOf('{');
  if (start === -1) throw new Error('Bezalel output contained no JSON object');
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        return JSON.parse(slice);
      }
    }
  }
  throw new Error('Bezalel output had an unbalanced JSON object');
}

function buildSystemPrompt() {
  return [
    'You are Bezalel, a meticulous craftsman who fills database-write templates',
    'using ONLY the source evidence you are given.',
    '',
    'Absolute rules:',
    '- Every value you place in a slot MUST be supported by the source evidence.',
    '- NEVER invent, guess, infer from outside knowledge, or use placeholder values.',
    '- If a REQUIRED slot is not supported by the evidence, set it to null and say so',
    '  in the epistemic block. Do not fabricate it to satisfy the schema.',
    '- Omit optional slots that the evidence does not support.',
    '- Respect each slot\'s type and any allowed-value (enum) constraint.',
    '',
    'Respond with ONE JSON object and nothing else, in this exact shape:',
    '{',
    '  "params": { <slotName>: <value>, ... },',
    '  "epistemic": { <slotName>: "<quote or precise location in the source>", ... }',
    '}',
    'The epistemic block must have one entry per slot you filled, citing exactly',
    'where in the source that value came from.',
  ].join('\n');
}

function buildUserPrompt(taskEnvelope, tpl, priorFailure) {
  const parts = [
    `CAPABILITY: ${taskEnvelope.capability}`,
    '',
    `TARGET TEMPLATE: ${taskEnvelope.templateKey}`,
    `TEMPLATE PURPOSE: ${tpl.summary}`,
    '',
    'SLOTS TO FILL:',
    describeSlots(tpl),
    '',
    'SOURCE EVIDENCE (the ONLY material you may draw from):',
    '"""',
    renderEvidence(taskEnvelope.sourceEvidence),
    '"""',
  ];

  // Seed hints, if any, are suggestions — still must be supported by evidence.
  if (taskEnvelope.params && Object.keys(taskEnvelope.params).length > 0) {
    parts.push(
      '',
      'SEED HINTS (verify each against the evidence before trusting it):',
      JSON.stringify(taskEnvelope.params, null, 2)
    );
  }

  if (priorFailure) {
    parts.push(
      '',
      'A PRIOR ATTEMPT WAS REJECTED BY THE VERIFIER. Fix exactly these problems,',
      're-grounding each in the source evidence. Do not change slots that were fine.',
      `Verifier notes: ${priorFailure.notes || '(none)'}`,
      'Rejected slots:',
      JSON.stringify(priorFailure.failedSlots || [], null, 2)
    );
  }

  return parts.join('\n');
}

/**
 * Run Bezalel to fill a template from evidence.
 *
 * @param {import('./taskEnvelope').TaskEnvelope} taskEnvelope
 * @param {object} opts
 * @param {string} opts.creatorModel
 * @param {{ failedSlots?: Array, notes?: string }} [opts.priorFailure]
 * @param {string|number|null} [opts.sessionId]  Optional session id for usage tracking.
 * @returns {Promise<BezalelOutput>}
 */
async function runBezalel(taskEnvelope, { creatorModel, priorFailure, sessionId = null } = {}) {
  if (!creatorModel) throw new Error('runBezalel requires a creatorModel');

  const tpl = TEMPLATES[taskEnvelope.templateKey];
  if (!tpl) {
    throw new Error(`Unknown template "${taskEnvelope.templateKey}" — cannot create proposal`);
  }

  const message = await createMessage({
    model: creatorModel,
    system: buildSystemPrompt(),
    max_tokens: MAX_TOKENS,
    meta: { sessionId, purpose: 'bezalel' },
    messages: [
      { role: 'user', content: buildUserPrompt(taskEnvelope, tpl, priorFailure) },
    ],
  });

  const raw = (message.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const parsed = extractJson(raw);
  const params = parsed.params && typeof parsed.params === 'object' ? parsed.params : {};
  const epistemic = parsed.epistemic && typeof parsed.epistemic === 'object' ? parsed.epistemic : {};

  return {
    proposal: { templateKey: taskEnvelope.templateKey, params },
    epistemic,
    raw,
  };
}

module.exports = { runBezalel, extractJson };
