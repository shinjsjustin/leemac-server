# Jarvis Improvement Prompts

Prompts produced by the 2026-07-05 Jarvis audit. Each file is a self-contained task
for an AI coding agent (or a human). Run them **one at a time**, in order, committing
between runs.

## Run order

### Phase 1 — Bug fixes (run first, in order)

| # | File | Priority | Summary |
|---|------|----------|---------|
| 1 | [bugfix-01-stream-double-generation.md](bugfix-01-stream-double-generation.md) | P0 | Final turn is generated twice; tools run sequentially |
| 2 | [bugfix-02-session-timezone.md](bugfix-02-session-timezone.md) | P0 | Session dates use UTC, not America/Toronto |
| 3 | [bugfix-03-tool-loop-guards.md](bugfix-03-tool-loop-guards.md) | P0 | Unbounded tool loop + unhandled `max_tokens` truncation |
| 4 | [bugfix-04-anthropic-retry-timeout.md](bugfix-04-anthropic-retry-timeout.md) | P0 | No retry/backoff/timeout on Anthropic calls |
| 5 | [bugfix-05-approval-tier-payload.md](bugfix-05-approval-tier-payload.md) | P1 | Approval-tier tool payloads can never execute on submit |
| 6 | [bugfix-06-prompt-injection-hardening.md](bugfix-06-prompt-injection-hardening.md) | P1 | Email/PDF content can steer auto-executing tools |
| 7 | [bugfix-07-sse-auth.md](bugfix-07-sse-auth.md) | P1 | SSE notifications endpoint unreachable + JWT in URL |
| 8 | [bugfix-08-message-persistence.md](bugfix-08-message-persistence.md) | P2 | Two writers race over ai_messages; morning prompt blob persisted |

### Phase 2 — New capability tools (run after Phase 1)

| # | File | Summary |
|---|------|---------|
| 1 | [tool-01-read-calendar.md](tool-01-read-calendar.md) | `read_calendar` — Jarvis can finally *see* the calendar |
| 2 | [tool-02-manage-todos.md](tool-02-manage-todos.md) | `complete_todo` + `update_todo` |
| 3 | [tool-03-memory-tools.md](tool-03-memory-tools.md) | `remember_fact` + `forget_fact` on demand |
| 4 | [tool-04-email-drafts.md](tool-04-email-drafts.md) | `create_email_draft` — Gmail drafts, never sends |
| 5 | [tool-05-usage-tracking.md](tool-05-usage-tracking.md) | Token/cost tracking + optional daily budget |

## Dependency notes

- **bugfix-03** and **bugfix-08** modify the orchestrator loop/stream — run them *after* bugfix-01.
- **tool-01** ideally lands after **bugfix-02** (reuses the Toronto time helper).
- **tool-05** hooks into the streaming path — run after bugfix-01.
- After **tool-04**, the owner must disconnect/reconnect Google (new gmail.compose scope).

## Conventions for the executing agent

- All AI code lives under `src/lib/ai/`, HTTP layer under `src/routes/jarvis/`.
  Read `src/lib/ai/ai_dox.md` first for the architecture overview.
- Behavior specs in these prompts are authoritative; exact line numbers are not —
  earlier prompts may have reshaped the code.
- There is no test framework in this repo. Verify with small scratch scripts
  (see the `__scratch_verifyLoop.js` pattern in `src/lib/ai/agents/`) and the
  manual steps listed in each prompt, then delete scratch files.
- Update `src/lib/ai/ai_dox.md` whenever a prompt says so (tool tables, tiers).
