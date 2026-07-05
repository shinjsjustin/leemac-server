# [NEW TOOL] Token usage tracking, cost visibility, and an optional daily budget

**Category:** New capability tool (observability)
**Files:** new `src/db/migrations/004_ai_usage.sql`, new `src/lib/ai/usage.js`,
`src/lib/ai/anthropic.js`, `src/lib/ai/orchestrator.js`, `src/lib/ai/agents.js`,
`src/lib/ai/agents/bezalel.js` + `moses.js` (call-site metadata only),
`src/routes/jarvis/chat.js` (new route), `src/lib/ai/ai_dox.md`
**Run after:** bugfix-01 (streaming path must already assemble `usage` on the final message)

## Problem

Every Anthropic response includes a `usage` object (`input_tokens`,
`output_tokens`, cache fields) and the system throws it away. There is zero
visibility into what Jarvis costs — per day, per model, or per feature (chat vs PDF
extraction vs Bezalel/Moses verification vs consolidation) — and no guard rail if a
bug or runaway loop burns tokens.

## Required changes

### 1. Migration `src/db/migrations/004_ai_usage.sql`

Follow the conventions of the existing migrations (001–003):

```sql
CREATE TABLE IF NOT EXISTS ai_usage (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  session_id    INT NULL,
  model         VARCHAR(64)  NOT NULL,
  purpose       VARCHAR(64)  NOT NULL,   -- 'orchestrator','pdf_extract','email_triage','rfq_triage','consolidation','bezalel','moses',...
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_usage_created (created_at),
  KEY idx_ai_usage_purpose (purpose)
);
```

(If migrations in this repo are applied manually, say so in the completion summary
and include the command.)

### 2. `src/lib/ai/usage.js`

- `recordUsage({ sessionId, model, purpose, usage })` — inserts a row; wraps
  everything in try/catch with a `console.error` — usage tracking must **never**
  break a model call (same philosophy as `logTool`).
- `PRICES_PER_MTOK` — a constants map `{ [modelString]: { input, output } }` for the
  three models in `src/lib/ai/models.js`, values taken from current Anthropic
  pricing at implementation time, clearly commented as estimates to update.
- `estimateCostUsd(rows)` — sums rows into dollars using the map (unknown model →
  cost null, still counted in tokens).
- `getUsageSummary({ days })` — grouped rollup: per-day and per-purpose totals +
  cost estimate + grand total.
- Optional budget: `checkDailyBudget()` — if env `AI_DAILY_TOKEN_BUDGET` (integer,
  total tokens/day) is set, returns `{ exceeded, used, budget }` for today
  (Toronto day — reuse `time.js` from bugfix-02).

### 3. Wire capture into `src/lib/ai/anthropic.js`

Add an optional `meta = { sessionId, purpose }` field to the opts of `createMessage`
and the streaming function:

- `createMessage`: after a successful response, fire-and-forget
  `recordUsage({ ...meta, model: opts.model, usage: response.usage })` (do not
  `await` in the hot path; `.catch(() => {})`).
- Streaming: `usage` arrives via `message_start` (input) and the final
  `message_delta` (output) — the bugfix-01 assembly already collects these onto the
  final message; record once when the stream completes.
- No `meta` → skip recording silently (keeps the module usable standalone).

### 4. Pass `meta` at the call sites

- `orchestrator.js` → `{ sessionId, purpose: 'orchestrator' }` on every loop call.
- `agents.js` → `pdf_extract` (both MarkItDown and native paths), `email_triage`,
  `rfq_triage`, `consolidation` (sessionId where available).
- `agents/bezalel.js` / `agents/moses.js` → `bezalel` / `moses` (these call
  `createMessage` directly; thread `sessionId` through if cheaply available,
  else null).

### 5. Report endpoint + budget guard

- `GET /api/jarvis/usage?days=7` in `src/routes/jarvis/chat.js` (owner-gated like
  everything else): returns `getUsageSummary`. This gives the UI/curl a cost
  dashboard datasource — no client UI in this task.
- **Budget guard (only when `AI_DAILY_TOKEN_BUDGET` is set):** at the top of the
  orchestrator entry points, call `checkDailyBudget()`; if exceeded, do not call the
  model — stream/return a fixed message:
  `Daily AI budget reached (X of Y tokens). Raise AI_DAILY_TOKEN_BUDGET or wait until tomorrow.`
  Subagents and approval submits are NOT gated (finish what the owner approves);
  only new orchestrator turns are.

### 6. Documentation

`src/lib/ai/ai_dox.md`: add `ai_usage` to the data-model table (§9) and a short
"Cost visibility" bullet in §11.

## Acceptance criteria

- [ ] After a few chat messages, `SELECT purpose, SUM(input_tokens), SUM(output_tokens)
      FROM ai_usage GROUP BY purpose` shows sane numbers for `orchestrator` (and
      `bezalel`/`moses` after a propose_db_change with evidence).
- [ ] `GET /api/jarvis/usage?days=7` returns per-day/per-purpose rollups with a
      dollar estimate.
- [ ] Streaming turns record exactly one row per model call (not per delta).
- [ ] With `AI_DAILY_TOKEN_BUDGET=1000` and usage above it, chat returns the budget
      message without an API call; unset budget → no gating.
- [ ] Killing the DB insert (e.g. temporarily bad table name in a scratch run) does
      not break chat — errors logged only.

## Out of scope

- Client-side usage dashboard UI (endpoint only).
- Cache-token pricing detail beyond input/output (columns can be added later).
- Budget enforcement on subagents/approvals (deliberate, documented above).
