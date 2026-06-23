// src/lib/ai/agents/__scratch_verifyLoop.js
//
// Manual sanity-check harness for the Bezalel/Moses verified-proposal loop.
// NOT wired into anything. Run it directly to watch the pair work end-to-end
// against the real Anthropic models before any live wiring happens.
//
// Usage (from the repo root):
//   ANTHROPIC_API_KEY=sk-... node src/lib/ai/agents/__scratch_verifyLoop.js
//
// It constructs a fake `update_job_po` task with hand-written PO-PDF evidence,
// runs runVerifiedProposal, and prints the ResultEnvelope.
//
// NOTE: this logs to ai_tool_log via the real logTool (so it needs a DB
// connection). If you only want to exercise the model path without a DB, set
// SKIP_DB_LOG=1 and the logger will simply print errors and continue (logTool
// already swallows insert failures).

const { makeTaskEnvelope } = require('./taskEnvelope');
const { runVerifiedProposal } = require('./verifyLoop');

// Hand-written "PO PDF markdown" evidence. update_job_po expects:
//   jobId (int, required), poNum (string, required), poDate, dueDate,
//   taxCode (int, required), tax, taxPercent.
//
// The evidence below supports jobId, poNum, poDate, dueDate. It deliberately
// does NOT state a tax code/amount, so a faithful Bezalel should either leave
// taxCode unsupported (and Moses should catch a fabricated value) — a good
// signal that the adversarial check is working.
const SOURCE_EVIDENCE = `
# Purchase Order

**Vendor:** LeeMac Machining
**Internal Job Reference:** Job ID 4821

| Field          | Value         |
|----------------|---------------|
| PO Number      | PO-2026-0612  |
| PO Date        | 2026-06-12    |
| Required By    | 2026-07-03    |

Please confirm receipt. Terms: Net 30.
`.trim();

async function main() {
  const task = makeTaskEnvelope({
    capability: 'Record the PO number and dates from this purchase order onto the referenced job.',
    templateKey: 'update_job_po',
    sourceEvidence: SOURCE_EVIDENCE,
    params: {}, // no seed hints
  });

  console.log('── Task envelope ─────────────────────────────');
  console.log(JSON.stringify(task, null, 2));
  console.log('\n── Running verified proposal loop ────────────\n');

  const result = await runVerifiedProposal(task);

  console.log('── ResultEnvelope ────────────────────────────');
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Scratch run failed:', err);
    process.exit(1);
  });
