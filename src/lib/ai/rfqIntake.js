// src/lib/ai/rfqIntake.js
//
// Inbound-RFQ intake workflow. Wires Jarvis to turn a request-for-quote email
// into a quote-job request queued for human approval — end to end.
//
// Pipeline (request flow):
//   triage (Haiku) → deterministic PDF→text conversion → N high-stakes part
//   extraction loops (parallel) → deterministic company resolution → 1 mid-stakes
//   assembly loop → ai_approvals (human gate).
//
// Integrity boundaries this module respects:
//   - NO AI agent ever touches a raw PDF. Each drawing PDF is converted to text
//     by MarkItDown (convertToMarkdown) BEFORE any agent sees it. Bezalel and
//     Moses operate only on that converted text. The residual risk (MarkItDown
//     misreading a drawing) is accepted by design and caught by the $1-price +
//     human-approval gate; verification targets the MarkItDown text, which is the
//     best available source once no agent can read the PDF.
//   - It does not modify the createquotejob endpoint or the parallel runner.
//   - Company resolution is deterministic (exact match), never inferred by an AI.
//   - The assembled request is ROUTED to ai_approvals; it never self-executes.

const db = require('../../db/db');
const { getEmailById, getEmailAttachment } = require('../google/gmail');
const { convertToMarkdown, isMarkitdownAvailable } = require('./markitdown');
const { runRfqTriage } = require('./agents');
const { buildRequestFromTemplate } = require('./requestTemplates');
const { makeTaskEnvelope } = require('./agents/taskEnvelope');
const { runVerifiedProposal } = require('./agents/verifyLoop');
const { runVerifiedProposalsParallel, DEFAULT_CONCURRENCY } = require('./agents/parallelDispatch');
const { logTool } = require('./executor');

// Cap on how much converted text we feed a single extraction duo.
const MAX_EVIDENCE_CHARS = 60000;

const EXTRACT_TEMPLATE = 'extract_quote_part';
const ASSEMBLY_TEMPLATE = 'create_quote_job';

// ── Attachment helpers ──────────────────────────────────────────────────────

// Filename stem (name without its final extension), normalised for grouping.
function stemOf(filename) {
  const base = String(filename || '').trim();
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.toLowerCase();
}

function hasExt(filename, re) {
  return re.test(String(filename || ''));
}

// Classifies a single attachment as 'step', 'pdf' (candidate), or 'other'.
// STEP CAD files (.stp/.step) are never converted/read. PDFs may arrive tagged
// application/octet-stream (e.g. Oracle workflow mailer), so an octet-stream
// attachment that is not a STEP file is treated as a PDF candidate — the %PDF
// magic-byte sniff at conversion time rejects anything that is not really a PDF.
function classifyAttachment(att) {
  if (hasExt(att.filename, /\.(stp|step)$/i)) return 'step';
  if (
    hasExt(att.filename, /\.pdf$/i) ||
    att.mime_type === 'application/pdf' ||
    att.mime_type === 'application/octet-stream'
  ) {
    return 'pdf';
  }
  return 'other';
}

// Groups attachments into (step, pdf) pairs keyed by filename stem. A pair holds
// at most one pdf and one step; extra same-stem files of the same kind are kept
// in `extra` for surfacing. Order of first appearance is preserved.
function pairAttachmentsByStem(attachments = []) {
  const byStem = new Map();
  for (const att of attachments) {
    const kind = classifyAttachment(att);
    if (kind === 'other') continue;
    const stem = stemOf(att.filename);
    if (!byStem.has(stem)) byStem.set(stem, { stem, pdf: null, step: null, extra: [] });
    const pair = byStem.get(stem);
    if (kind === 'pdf' && !pair.pdf) pair.pdf = att;
    else if (kind === 'step' && !pair.step) pair.step = att;
    else pair.extra.push(att);
  }
  return [...byStem.values()];
}

// True if the fetched attachment bytes are really a PDF (declared type, %PDF
// magic bytes, or a .pdf name). Mirrors the octet-stream fix in executor.js.
function looksLikePdf(att) {
  const b = att.buffer;
  const hasMagic =
    Buffer.isBuffer(b) && b.length >= 4 &&
    b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
  return att.mime_type === 'application/pdf' || hasMagic || /\.pdf$/i.test(att.filename || '');
}

// Ensures MarkItDown sees a .pdf extension so it selects the PDF converter.
function pdfFilename(filename) {
  return /\.pdf$/i.test(filename || '') ? filename : `${String(filename || 'document').replace(/(\.[^.]*)?$/, '')}.pdf`;
}

// ── Part field normalisation ────────────────────────────────────────────────

function normaliseString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

// Shapes a verified extraction's params into the part object the createquotejob
// endpoint expects. Returns { ok, fields|reason }.
function normalisePartFields(params) {
  const part_number = normaliseString(params.part_number);
  const quantity = Number(params.quantity);
  if (!part_number) return { ok: false, reason: 'missing part_number after extraction' };
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: `invalid quantity (${params.quantity}) after extraction` };
  }
  return {
    ok: true,
    fields: {
      part_number,
      description: normaliseString(params.description),
      material: normaliseString(params.material),
      finish: normaliseString(params.finish),
      quantity,
    },
  };
}

// ── Company resolution (deterministic) ──────────────────────────────────────

// Resolves a company hint to a single company_id by exact (case-insensitive)
// match on code or name. Never guesses. Returns a resolved or flagged result.
async function resolveCompany(hint) {
  const needle = normaliseString(hint);
  if (!needle) {
    return { resolved: false, reason: 'no company hint detected in the email' };
  }

  const [rows] = await db.query(`SELECT id, code, name FROM company`);
  const lower = needle.toLowerCase();
  const matches = rows.filter(
    (c) =>
      (c.code && String(c.code).trim().toLowerCase() === lower) ||
      (c.name && String(c.name).trim().toLowerCase() === lower)
  );

  if (matches.length === 1) {
    const m = matches[0];
    return { resolved: true, company_id: m.id, matched: { id: m.id, code: m.code, name: m.name } };
  }
  if (matches.length === 0) {
    return { resolved: false, reason: `no exact company match for "${needle}"`, hint: needle };
  }
  return {
    resolved: false,
    reason: `ambiguous company hint "${needle}" — ${matches.length} matches`,
    hint: needle,
    candidates: matches.map((c) => ({ id: c.id, code: c.code, name: c.name })),
  };
}

// ── Conversion (deterministic, pre-agent) ───────────────────────────────────

// For every part pair, fetches the PDF, verifies it really is a PDF, and converts
// it to text with MarkItDown. STEP files are never read. Returns { converted,
// unreadable }; an unreadable entry never gets an extraction agent.
async function convertPairs({ adminId, emailId, pairs }) {
  const markitdownReady = await isMarkitdownAvailable();
  const converted = [];
  const unreadable = [];

  for (const pair of pairs) {
    if (!pair.pdf) {
      unreadable.push({ stem: pair.stem, filename: null, reason: 'no drawing PDF in this attachment group' });
      continue;
    }

    const label = pair.pdf.filename;
    try {
      const att = await getEmailAttachment({ adminId, emailId, attachmentId: pair.pdf.attachment_id });
      if (!looksLikePdf(att)) {
        unreadable.push({ stem: pair.stem, filename: label, reason: 'attachment is not a readable PDF' });
        continue;
      }
      if (!markitdownReady) {
        unreadable.push({ stem: pair.stem, filename: label, reason: 'MarkItDown is not available to convert the PDF' });
        continue;
      }
      const text = await convertToMarkdown(att.buffer, pdfFilename(att.filename));
      if (!text || !text.trim()) {
        unreadable.push({ stem: pair.stem, filename: label, reason: 'MarkItDown returned empty text for the PDF' });
        continue;
      }
      converted.push({ stem: pair.stem, filename: label, text: text.slice(0, MAX_EVIDENCE_CHARS) });
    } catch (err) {
      unreadable.push({ stem: pair.stem, filename: label, reason: `PDF conversion failed: ${err.message}` });
    }
  }

  return { converted, unreadable };
}

// ── Extraction (parallel, verified) ─────────────────────────────────────────

// Runs one high-stakes Bezalel→Moses duo per converted PDF through the bounded
// runner. Maps each outcome back to its source by index. Returns { goodParts,
// failedParts }.
async function extractParts({ converted, sessionId, concurrency }) {
  const tasks = converted.map((c) =>
    makeTaskEnvelope({
      capability: `Extract the quote-part fields from the RFQ drawing "${c.filename}" (already converted to text).`,
      templateKey: EXTRACT_TEMPLATE,
      sourceEvidence: c.text,
      params: {},
    })
  );

  const batch = await runVerifiedProposalsParallel(tasks, { sessionId, concurrency });

  const goodParts = [];
  const failedParts = [];

  batch.outcomes.forEach((outcome, i) => {
    const src = converted[i];
    if (outcome.status === 'success' && outcome.result?.proposal?.params) {
      const shaped = normalisePartFields(outcome.result.proposal.params);
      if (shaped.ok) {
        goodParts.push({ stem: src.stem, filename: src.filename, fields: shaped.fields });
      } else {
        failedParts.push({ stem: src.stem, filename: src.filename, reason: shaped.reason });
      }
    } else {
      failedParts.push({
        stem: src.stem,
        filename: src.filename,
        reason: `extraction did not verify: ${outcome.error?.message || 'unknown error'}`,
        failedSlots: outcome.error?.failedSlots || null,
      });
    }
  });

  return { goodParts, failedParts, parentTaskId: batch.parentTaskId };
}

// ── Assembly + approval ─────────────────────────────────────────────────────

// Runs the single mid-stakes assembly duo, then (on pass) routes the built
// createquotejob request to ai_approvals. Returns the assembly verdict and the
// approval insert result (or null if it did not pass).
async function assembleAndQueue({ companyId, attention, goodParts, email, matched, sessionId }) {
  const parts = goodParts.map((p) => p.fields);

  // Source evidence for the assembly verifier: the resolved company id plus the
  // already-verified part extractions. Moses checks the proposal against THIS —
  // every part carried through, quantities unchanged, company_id from resolution.
  const sourceEvidence = {
    resolved_company_id: companyId,
    resolved_company: matched,
    attention: attention ?? null,
    verified_parts: parts,
    price_policy: 'The createquotejob endpoint hardcodes price to $1. No agent sets price.',
  };

  const envelope = makeTaskEnvelope({
    capability: 'Assemble the createquotejob request from the verified part extractions and the resolved company.',
    templateKey: ASSEMBLY_TEMPLATE,
    sourceEvidence,
    params: { company_id: companyId, attention: attention ?? null, parts },
  });

  const verdict = await runVerifiedProposal(envelope, { sessionId });
  if (verdict.status !== 'pass' || !verdict.proposal?.params) {
    return { verdict, approval: null };
  }

  // Build the concrete request from the verified params and queue it.
  const { endpoint, method, body } = buildRequestFromTemplate(ASSEMBLY_TEMPLATE, verdict.proposal.params);
  const partCount = Array.isArray(body.parts) ? body.parts.length : 0;
  const title = `Quote job for ${matched.name || matched.code || `company #${companyId}`} (${partCount} part${partCount === 1 ? '' : 's'})`;
  const description =
    `Auto-assembled from RFQ email "${email.subject || '(no subject)'}". ` +
    `Creates a quote job for ${matched.name || matched.code || `company #${companyId}`}` +
    `${attention ? ` (attention: ${attention})` : ''} with ${partCount} extracted part${partCount === 1 ? '' : 's'}. ` +
    `Price is set to $1 per part by the endpoint; review before approving.`;

  const verifierNotes = {
    status: 'verified',
    notes: verdict.verifierNotes,
    attempts: verdict.attempts,
    evidence: 'present',
    source: 'rfq_intake',
  };

  const [insert] = await db.query(
    `INSERT INTO ai_approvals (title, description, request_payload, verifier_status, verifier_notes)
     VALUES (?, ?, ?, ?, ?)`,
    [
      title,
      description,
      JSON.stringify({ template: ASSEMBLY_TEMPLATE, endpoint, method, body }),
      'verified',
      JSON.stringify(verifierNotes),
    ]
  );

  return {
    verdict,
    approval: { queued: true, approval_id: insert.insertId, verifier_status: 'verified', endpoint, method },
  };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Process one inbound RFQ email end-to-end.
 *
 * @param {object} args
 * @param {string} args.emailId               Gmail message id of the RFQ.
 * @param {string|number} args.adminId        Owner admin id (for Gmail auth).
 * @param {string|number|null} [args.sessionId]  Day session id for the audit log.
 * @param {number} [args.concurrency]         Max extraction duos in flight.
 * @returns {Promise<object>}  Structured summary for the orchestrator to surface.
 */
async function processRfqEmail({ emailId, adminId, sessionId = null, concurrency = DEFAULT_CONCURRENCY } = {}) {
  if (!emailId) throw new Error('processRfqEmail requires an emailId');
  if (adminId == null) throw new Error('processRfqEmail requires an adminId');

  // 1. Fetch the email (full body + attachment metadata).
  const email = await getEmailById({ adminId, emailId });

  // 2. Triage (Haiku) for the semantic fields + deterministic attachment pairing.
  const triage = await runRfqTriage({ subject: email.subject, body: email.body_text });
  const pairs = pairAttachmentsByStem(email.attachments || []);

  // 3. Deterministic PDF → text conversion (no agent reads the PDF).
  const { converted, unreadable: unreadableFromConvert } = await convertPairs({ adminId, emailId, pairs });

  // 4. Extraction — one verified duo per converted PDF, bounded parallel.
  const { goodParts, failedParts, parentTaskId } =
    converted.length > 0
      ? await extractParts({ converted, sessionId, concurrency })
      : { goodParts: [], failedParts: [], parentTaskId: null };

  const unreadable = [...unreadableFromConvert, ...failedParts];

  // 5. Company resolution (deterministic, never AI).
  const company = await resolveCompany(triage.company_hint);

  // 6. Assembly + write — only when the company resolved AND we have good parts.
  let assemblyStatus;
  let approval = null;
  let assemblyVerdict = null;

  if (!company.resolved) {
    assemblyStatus = 'company_unresolved';
  } else if (goodParts.length === 0) {
    assemblyStatus = 'no_readable_parts';
  } else {
    const result = await assembleAndQueue({
      companyId: company.company_id,
      attention: triage.attention,
      goodParts,
      email,
      matched: company.matched,
      sessionId,
    });
    assemblyVerdict = result.verdict;
    if (result.approval) {
      approval = result.approval;
      assemblyStatus = 'queued';
    } else {
      assemblyStatus = 'assembly_failed';
    }
  }

  // 7. RFQ-level audit row (Moses rejections are already logged inside the loop).
  const summary = {
    email: { id: email.id, subject: email.subject || null },
    triage: { company_hint: triage.company_hint, attention: triage.attention },
    company: company.resolved
      ? { resolved: true, company_id: company.company_id, matched: company.matched }
      : { resolved: false, reason: company.reason, candidates: company.candidates || null },
    parts: {
      extracted: goodParts.length,
      unreadable: unreadable.length,
      unreadable_detail: unreadable,
    },
    assembly_status: assemblyStatus,
    approval,
    parent_task_id: parentTaskId,
    assembly_notes:
      assemblyVerdict && assemblyVerdict.status !== 'pass'
        ? assemblyVerdict.verifierNotes || 'assembly verification did not pass'
        : null,
    message: buildMessage({ assemblyStatus, approval, company, goodParts, unreadable }),
  };

  await logTool(
    sessionId,
    'process_rfq_email',
    { emailId, company_hint: triage.company_hint, attention: triage.attention },
    {
      assembly_status: assemblyStatus,
      approval_id: approval?.approval_id ?? null,
      parts_extracted: goodParts.length,
      parts_unreadable: unreadable.length,
    },
    assemblyStatus === 'queued'
  );

  return summary;
}

// Builds a concise human-facing message describing the outcome.
function buildMessage({ assemblyStatus, approval, company, goodParts, unreadable }) {
  const tail = unreadable.length
    ? ` ${unreadable.length} part(s) could not be read and were surfaced, not dropped.`
    : '';
  switch (assemblyStatus) {
    case 'queued':
      return `Quote job queued for approval (ID ${approval.approval_id}) with ${goodParts.length} part(s).${tail}`;
    case 'company_unresolved':
      return `Could not resolve the company (${company.reason}). Nothing was queued — resolve the company first.${tail}`;
    case 'no_readable_parts':
      return `No parts could be read from the RFQ, so nothing was queued.${tail}`;
    case 'assembly_failed':
      return `The parts and company resolved, but the assembly verification failed, so nothing was queued.${tail}`;
    default:
      return `RFQ processed.${tail}`;
  }
}

module.exports = {
  processRfqEmail,
  // Exported for unit testing of the deterministic helpers.
  pairAttachmentsByStem,
  classifyAttachment,
  looksLikePdf,
  normalisePartFields,
  resolveCompany,
};
