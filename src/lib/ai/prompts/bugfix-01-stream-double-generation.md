# [BUG FIX] Stop generating the final answer twice; stream every turn; parallelize tool calls

**Category:** Bug fix
**Priority:** P0 (every single chat reply costs ~2x what it should)
**Files:** `src/lib/ai/anthropic.js`, `src/lib/ai/orchestrator.js`
**Run before:** bugfix-03, bugfix-08, tool-05 (they build on the reshaped loop)

## Problem

In `src/lib/ai/orchestrator.js`:

1. **The final assistant turn is generated twice.** `runToolLoop` loops with the
   non-streaming `createMessage` until `stop_reason !== 'tool_use'` — at that point it
   has already generated the complete final answer. `runOrchestratorStream` then
   **discards** that response and calls `streamMessage` again with the same history to
   re-generate the final turn for streaming. Consequences:
   - Double token cost and added latency on the last turn of every chat message.
   - The re-generated turn can differ from the one that ended the loop.
   - The re-generated turn may itself decide to call a tool (tools are passed to the
     streaming call) — in that case it streams no text and the tool call is silently
     dropped.

2. **Tool calls execute sequentially.** When one assistant turn contains multiple
   `tool_use` blocks, `runToolLoop` awaits them one at a time in a `for` loop. They are
   independent and should run in parallel.

## Required changes

### 1. Upgrade `streamMessage` in `src/lib/ai/anthropic.js` to a full-message stream

The current `streamMessage` only yields `text_delta` strings and drops everything else.
Replace it (or add a new `streamMessageFull` and migrate callers) with an async
generator that:

- Yields `{ type: 'text', text: string }` for each text delta, as they arrive.
- Internally assembles the **complete message object** from the SSE events:
  - `content_block_start` → open a block (text or `tool_use`).
  - `content_block_delta` → append `text_delta` to text blocks; accumulate
    `input_json_delta.partial_json` for `tool_use` blocks.
  - `content_block_stop` → finalize the block (`JSON.parse` the accumulated partial
    JSON into `input` for tool_use blocks; treat empty accumulation as `{}`).
  - `message_delta` → capture `stop_reason` (and `usage` if present).
  - `message_start` → capture `id`, `model`, initial `usage`.
- After the stream ends, yields one final
  `{ type: 'final', message: { content, stop_reason, usage, ... } }` whose shape matches
  what `createMessage` returns closely enough for the orchestrator to use
  interchangeably (`content` array of blocks, `stop_reason`).

Keep the existing `createMessage` untouched. If you keep a backward-compatible
`streamMessage` for other callers, check for other usages first (currently only the
orchestrator imports it).

### 2. Rewrite the orchestrator streaming path to a single-generation loop

Replace the "resolve loop non-streaming, then re-stream" design in
`runOrchestratorStream` with **one loop that streams every model turn**:

```
loop {
  stream one model call (system, history, TOOLS)
  → forward each text delta to the caller as it arrives
  → collect the final assembled message
  if final message has tool_use blocks:
      execute ALL tool_use blocks in parallel (Promise.all), preserving
      block order in the tool_result array (tool_use_id ↔ result 1:1)
      append assistant turn (full content) + user turn (tool_results) to history
      if any text was already streamed this turn, yield '\n\n' as a separator
      continue
  else:
      break
}
```

Notes:

- This means preamble text the model writes *before* calling tools (e.g. "Let me check
  the job list…") now streams live — that is desired UX, not a regression. The client
  renders the chunked text as one assistant message; separators keep it readable.
- Accumulate **all** streamed text across turns and persist it with the existing
  `persistMessage(sessionId, 'assistant', fullText)` exactly once at the end. The
  persisted text must equal the concatenation of everything yielded to the caller
  (minus the `__meta` sentinel).
- Keep yielding the trailing `{ __meta: { sessionId, done: true } }` sentinel —
  `src/routes/jarvis/chat.js` depends on it.
- Rework `runOrchestrator` (non-streaming entry) to share the same loop implementation
  — e.g. have it drain the generator and concatenate text — so there is exactly one
  loop to maintain and **neither** entry point ever generates a turn twice.
- Parallel tool execution: `executeTool` already never throws (it catches and returns
  `{ error }`), so `Promise.all` is safe. Do not reorder results relative to their
  `tool_use_id`s.

### 3. Keep behavior identical otherwise

- Same system prompt, same history loading, same `persistMessage` calls for the user
  message, same model/`max_tokens`.
- `src/routes/jarvis/chat.js` should not need changes (it already handles string deltas
  + `__meta`). Verify the heartbeat interplay still works: the heartbeat now becomes
  less critical because text can start earlier, but keep it for silent tool phases.

## Acceptance criteria

- [ ] For any chat message, each model turn results in **exactly one** Anthropic API
      call (verify by logging/counting calls in a scratch run — a reply with N tool
      turns = N+1 calls total, not N+2).
- [ ] Text streams live for both preamble text and the final answer.
- [ ] A turn with 2+ tool_use blocks executes them concurrently (verify with timestamped
      logs in two slow tools, or temporary `console.time`).
- [ ] `tool_result` blocks match their `tool_use_id`s 1:1 in order.
- [ ] Persisted assistant message equals the full streamed text.
- [ ] `runOrchestrator` (non-streaming, used by the approvals retry flow in
      `src/routes/jarvis/approvals.js`) still returns `{ sessionId, text, content }`
      with working values.
- [ ] `POST /api/jarvis/chat` and `POST /api/jarvis/start-day` still stream end-to-end.

## Out of scope

- Iteration caps / `max_tokens` handling (bugfix-03).
- Usage capture from `message_start`/`message_delta` events (tool-05) — but structure
  the final assembled message so `usage` is available on it.
