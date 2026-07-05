# [BUG FIX] Approval-tier tool queue produces payloads the submit route can never execute

**Category:** Bug fix
**Priority:** P1 (latent — no tool uses these tiers today, but the safety mechanism is broken)
**Files:** `src/lib/ai/executor.js`, `src/routes/jarvis/approvals.js`

## Problem

The permission system defines three tiers (`src/lib/ai/tools.js` → `PERMISSION_TIER`):
`auto`, `approval`, `always_ask`. Today every tool is `auto`, but the non-auto path is
the designed safety valve for future riskier tools — and it is broken end to end:

1. **Queued payload shape mismatch.** In `src/lib/ai/executor.js` → `executeTool`,
   the `approval`/`always_ask` branch inserts into `ai_approvals` with
   `request_payload = { tool, input }`. But the submit route
   (`src/routes/jarvis/approvals.js` → `POST /:id/submit`) only knows how to execute
   `{ endpoint, method, body }` payloads: it destructures those keys, finds
   `endpoint === undefined`, and returns **400 "Endpoint not in allowlist: undefined"**.
   So any tool ever moved to `approval` tier queues rows that can never be approved.

2. **`always_ask` confirmation never triggers.** The submit route checks
   `payload.permissionTier === 'always_ask'` to require `confirm: true`, but the
   executor never writes `permissionTier` into the payload — so the extra-confirmation
   path is dead code.

## Required changes

### 1. Executor: queue a complete, executable payload

In the `approval`/`always_ask` branch of `executeTool`, store:

```js
request_payload = {
  kind: 'tool',                 // discriminator for the submit route
  tool: toolName,
  input: toolInput,
  permissionTier: tier,         // 'approval' | 'always_ask'
}
```

(Existing `propose_db_change` rows keep their `{ template, endpoint, method, body }`
shape — treat those as `kind: 'endpoint'` implicitly when `kind` is absent.)

### 2. Submit route: dispatch on payload kind

In `POST /approvals/:id/submit`:

- **`{ endpoint, ... }` payloads (current shape):** unchanged behavior — allowlist
  check, internal fetch, etc.
- **`{ kind: 'tool', tool, input }` payloads:**
  1. Validate `tool` is a known key of `PERMISSION_TIER` (require it from
     `src/lib/ai/tools.js`); reject unknown tools with 400.
  2. Execute via the executor's auto path with the **approver's** credentials:
     lazy-require `executeAutoTool`-equivalent from `src/lib/ai/executor.js`
     (export it if it isn't already) and call it with the request's bearer token
     (`req.headers.authorization`-derived) and `req.user.id` as `adminId`,
     `sessionId: null`.
  3. On success → mark approved, audit-log (`submit_approval` row, as the endpoint
     path already does), return the tool result.
  4. On failure → return 502 with the error detail; leave the approval `pending`
     (consistent with the endpoint path, which also leaves it pending on backend
     failure).
- **`always_ask`:** the existing `confirm !== true → 400 requiresConfirm` check now
  works because the tier is finally present in the payload. Keep it, and apply it
  before execution for `kind: 'tool'` payloads too.

### 3. Guard against silent drift

At module load in `executor.js`, if any tool in `PERMISSION_TIER` is set to
`approval`/`always_ask`, nothing special is needed anymore (the path now works). But
add a comment on the branch documenting the payload contract, and — mirroring the
load-time invariant style used in `src/lib/ai/agents/stakes.js` — throw at load time
if `PERMISSION_TIER` contains a tier value outside the known set
(`auto|approval|always_ask`), so a typo like `'aproval'` fails fast instead of falling
back to `always_ask` at runtime only.

## Acceptance criteria

- [ ] Scratch test: temporarily set `read_todos: 'approval'` in `PERMISSION_TIER`;
      calling the tool queues a row; `POST /approvals/:id/submit` executes it and
      returns the todos; row flips to `approved`. (Revert the tier after testing.)
- [ ] Same test with `always_ask`: submit without `confirm` returns
      `{ requiresConfirm: true }` + 400; with `confirm: true` it executes.
- [ ] Existing `propose_db_change` approvals still submit exactly as before
      (endpoint allowlist path untouched).
- [ ] Unknown tool name in a tampered payload is rejected with 400 and does not
      execute anything.
- [ ] A typo'd tier value in `PERMISSION_TIER` crashes at server start with a clear
      message.

## Out of scope

- Moving any real tool to a non-auto tier (product decision; the RequestsApp UI
  renders `{ endpoint }` details and may want a nicer rendering for `kind: 'tool'`
  rows later — note it in your summary if you touch the shape it displays).
