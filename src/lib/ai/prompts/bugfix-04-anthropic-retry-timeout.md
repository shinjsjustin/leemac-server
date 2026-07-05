# [BUG FIX] Retry, backoff, and timeouts for Anthropic API calls

**Category:** Bug fix
**Priority:** P0 (one transient 529 currently kills the whole chat turn)
**Files:** `src/lib/ai/anthropic.js`

## Problem

`src/lib/ai/anthropic.js` wraps the Anthropic Messages API with raw `fetch` and:

1. **No retry.** Any 429 (rate limit), 529/`overloaded_error`, or transient 5xx makes
   the whole orchestrator turn fail — the user sees
   `[Error: failed to generate response]` and loses the turn. Anthropic explicitly
   documents these as retryable.
2. **No timeout.** A hung connection stalls forever. Worse, the chat route's
   heartbeat keeps writing newlines, so nginx never times out either — the request
   hangs indefinitely from the user's perspective.

All model calls in the system route through this module (`createMessage` +
`streamMessage`), so fixing it here fixes the orchestrator, all subagents
(`agents.js`), and the Bezalel/Moses loop at once.

## Required changes

### 1. Retry with exponential backoff (non-streaming `createMessage`)

- Retry on: HTTP `429`, `500`, `502`, `503`, `529`, and network-level failures
  (`fetch` rejecting with `TypeError`/`ECONNRESET`-class errors, and aborts caused by
  the timeout below).
- Do **not** retry on `400`, `401`, `403`, `404`, `413` — those are permanent for a
  given request.
- Max 3 attempts total. Backoff: `1s, 2s` between attempts, each with ±20% jitter.
  If the response carries a `retry-after` header, respect it (capped at 30s).
- On final failure, throw an error that includes status + response body (current
  behavior) so callers' logs stay useful.
- Keep this dependency-free (plain `fetch` + `setTimeout` promise). The
  `@anthropic-ai/sdk` package is in package.json but this module deliberately does
  not use it — do not migrate to the SDK in this task.

### 2. Timeouts

- `createMessage`: abort the request after `ANTHROPIC_TIMEOUT_MS`
  (env-configurable, default `120000`) using `AbortSignal.timeout()` or an
  `AbortController`. A timeout counts as a retryable failure.
- `streamMessage` (or its bugfix-01 successor): apply the same timeout to the
  **initial response** (time to headers). Once streaming has begun, add an
  **inactivity timeout** — if no SSE bytes arrive for 60s, abort with a descriptive
  error. Long healthy streams that keep producing deltas must never be killed by a
  total-duration cap.

### 3. Streaming retry semantics

- If a streaming call fails **before any text delta has been yielded to the caller**
  (connection error, retryable status, initial-response timeout), retry it under the
  same policy as `createMessage` — the caller can't tell the difference.
- If it fails **after** deltas have been yielded, do NOT retry (the caller has
  already forwarded partial text to the browser); throw so the route's existing
  error handling appends its error marker.

### 4. Logging

`console.warn` each retry with attempt number, status/cause, and wait time — these
should be visible in server logs when the API has a bad day.

## Acceptance criteria

- [ ] Scratch test with a stubbed `fetch` returning `529, 529, 200`:
      `createMessage` succeeds after ~3s total, two warn lines logged.
- [ ] Stubbed `fetch` returning `400`: fails immediately, no retries.
- [ ] Stubbed `fetch` that never resolves: `createMessage` rejects after the timeout
      (test with a short `ANTHROPIC_TIMEOUT_MS`), having attempted 3 times.
- [ ] Streaming: failure before first delta retries; failure after first delta
      propagates without retry.
- [ ] No behavior change on the happy path (same return/yield shapes).

## Out of scope

- Circuit breaking / global rate limiting across concurrent requests.
- Retrying Google API calls (Gmail/Calendar) — separate subsystem.
- Usage capture (tool-05).
