# [NEW TOOL] `remember_fact` + `forget_fact` — on-demand durable memory

**Category:** New capability tool
**Files:** `src/lib/ai/tools.js`, `src/lib/ai/executor.js`, `src/lib/ai/agents.js`
(export a helper), `src/lib/ai/orchestrator.js` (prompt text), `src/lib/ai/ai_dox.md`
**Run after:** Phase 1

## Problem

`ai_memory` is only ever written by end-of-day consolidation, which distills the whole
day into **one** entry. When Justin says *"remember that Maple Precision always wants
material certs with every shipment"*, Jarvis has no way to store it — the fact only
survives if the EOD Opus pass happens to include it, hours later, mixed into a
day-summary paragraph. Explicit "remember this" requests deserve an immediate,
verbatim write. There is also no way to remove a wrong or outdated memory besides
manual SQL.

## Required changes

### 1. Share the fact hash helper

`hashFact` (SHA-256 of lowercased/trimmed fact) lives privately in
`src/lib/ai/agents.js`. Export it (keep the consolidation usage) so the executor uses
the identical normalization — the `fact_hash` UNIQUE key is the dedup mechanism.

### 2. Tool schemas in `src/lib/ai/tools.js`

```
name: 'remember_fact'
description: 'Store a durable fact in long-term memory immediately. Use when Justin
  explicitly asks you to remember something, or when you learn a stable preference,
  pattern, or business fact that will matter for weeks+ (not one-off details that can
  be looked up in the database). The fact must be a single self-contained sentence or
  short paragraph, readable without any conversation context.'
input_schema:
  category: string enum ['client_preference','job_pattern','operational_note','business_context'] (required)
  fact:     string (required) — the self-contained fact to remember
```

```
name: 'forget_fact'
description: 'Remove a remembered fact that is wrong or outdated. Give a distinctive
  phrase from the fact as it appears in your "Remembered facts" list; if exactly one
  memory matches it is deleted, otherwise the matches are returned so you can retry
  with a more specific phrase. Confirm with Justin before forgetting unless he
  explicitly asked.'
input_schema:
  fact_query: string (required) — distinctive phrase from the fact to remove
```

Register both `'auto'` in `PERMISSION_TIER`. Memory is AI-workspace data (like
todos), not approval-gated business data — and every call is still audited in
`ai_tool_log`.

### 3. Executor cases in `src/lib/ai/executor.js`

- `remember_fact`:
  - Validate category against the enum; trim the fact; reject empty; cap length
    (~2000 chars) with a clear error result.
  - `INSERT IGNORE INTO ai_memory (category, fact, fact_hash, source_session_id)
    VALUES (?, ?, ?, ?)` with `hashFact(fact)` and the current `sessionId`.
  - Return `{ remembered: true }` or `{ duplicate: true, message: … }` when the hash
    already exists (check `affectedRows`).
- `forget_fact`:
  - `SELECT id, category, fact FROM ai_memory WHERE fact LIKE ?` with
    `%query%` (escape `%`/`_` in the user-supplied query).
  - 0 matches → `{ deleted: false, matches: [] , message: 'no match' }`.
  - Exactly 1 → `DELETE`, return `{ deleted: true, fact }`.
  - 2+ → do NOT delete; return the matches (id + fact snippets) so the model can
    narrow down. (Deleting by returned id: allow an optional `memory_id` integer
    input that takes precedence over `fact_query` for this second round.)

### 4. Prompt text in `src/lib/ai/orchestrator.js`

Add to the proactivity section:

- *"When Justin says 'remember…', or you learn a durable preference/pattern, store
  it with remember_fact right away — don't wait for end-of-day. Keep facts
  self-contained. Use forget_fact (after confirming) when a remembered fact is wrong
  or obsolete."*

The stored facts already flow into every system prompt via the existing
"Remembered facts" section — no injection changes needed.

### 5. Documentation

Add both tools to `src/lib/ai/ai_dox.md` (§4), and note in §6 that consolidation is
no longer the only memory writer.

## Acceptance criteria

- [ ] "Remember that Acme wants 2011 anodize on all their aluminum parts" → row in
      `ai_memory` (category `client_preference`), and the fact appears in the next
      turn's system prompt (visible via a follow-up "what do you remember about
      Acme?" answered without tools).
- [ ] Saying the same thing twice → second call returns `duplicate: true`, no new row.
- [ ] "Forget the thing about Acme anodize" → Jarvis confirms, then the row is gone.
- [ ] Ambiguous forget query with 2+ matches deletes nothing and lists candidates.
- [ ] EOD consolidation still works (its `hashFact` import path updated if moved).

## Out of scope

- Memory aging/pruning/relevance ranking (the `LIMIT 100` recency window stays).
  If `ai_memory` growth becomes a problem, that is a separate design task — mention
  it in your completion summary.
- Editing facts in place (forget + remember covers it).
- A memory-management UI panel.
