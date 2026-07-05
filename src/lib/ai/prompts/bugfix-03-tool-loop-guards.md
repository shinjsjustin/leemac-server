# [BUG FIX] Cap the tool loop and handle `max_tokens` truncation

**Category:** Bug fix
**Priority:** P0 (uncapped loop = unbounded API spend; truncation = silent bad output)
**Files:** `src/lib/ai/orchestrator.js`
**Run after:** bugfix-01 (the loop shape changes there; this prompt specifies behavior,
not line edits — apply it to whatever the current loop looks like)

## Problem

The orchestrator's tool-use loop (`src/lib/ai/orchestrator.js`) has two missing guards:

1. **No iteration cap.** The loop runs until the model stops requesting tools. A model
   stuck re-calling the same failing tool (or ping-ponging between two tools) burns
   tokens indefinitely — there is no circuit breaker.

2. **`stop_reason === 'max_tokens'` is treated as a normal final answer.** With
   `max_tokens: 4096`, a long reply (e.g. the morning brief plus to-do updates) can be
   cut off mid-sentence and the truncated text is streamed/persisted as if complete.
   Nobody is told the answer was truncated.

## Required changes

### 1. Iteration cap

- Add a module constant `MAX_TOOL_ITERATIONS = 15` (a *tool-turn* count, i.e. the
  number of assistant turns that contained tool_use blocks).
- When the cap is reached:
  1. Stop executing further tools.
  2. Append a final user turn to the history:
     `[system notice] Tool budget for this message is exhausted. Do not request more tools — reply now with your best answer from the information gathered so far, and say explicitly what you could not finish.`
  3. Make **one** final model call **without** the `tools` parameter so the model
     physically cannot request more tools, and stream/return that as the final turn.
- Log the event via `logTool(sessionId, 'tool_loop_cap', { iterations }, {…}, false)`
  from `src/lib/ai/executor.js` so capped loops are visible in `ai_tool_log`.

### 2. `max_tokens` handling

When an assembled model turn ends with `stop_reason === 'max_tokens'`:

- **Final text turn (no tool_use blocks):** append a visible marker to the streamed
  and persisted text: `\n\n_[Reply truncated — ask me to continue.]_` and
  `console.warn` it. Do not silently accept truncation.
- **Turn containing tool_use blocks:** blocks that the API returned complete are safe
  to execute; the risk is a *dropped/incomplete trailing block*. Execute the complete
  blocks as normal, and additionally append a short note to the tool_result user turn
  (as an extra text block) telling the model:
  `Your previous turn hit the max_tokens limit and may be missing tool calls — re-issue any tool call you did not receive a result for.`
- If the streaming assembly (from bugfix-01) encounters a tool_use block whose
  accumulated JSON does not parse (possible under truncation), drop that block with a
  `console.warn` instead of crashing, and rely on the note above for recovery.

### 3. Bump the ceiling for long briefs (small, optional)

Raise the orchestrator's `max_tokens` from 4096 to 8192 (both entry points — they
share the loop after bugfix-01). The truncation handling above must still exist; this
just makes it rarer. Keep 4096 if you find a documented reason not to raise it.

## Acceptance criteria

- [ ] Scratch test with a mocked model that always requests a tool: the loop stops
      after `MAX_TOOL_ITERATIONS` tool turns, makes exactly one final no-tools call,
      and the reply acknowledges the exhausted budget. `ai_tool_log` has a
      `tool_loop_cap` row.
- [ ] Scratch test with a mocked `stop_reason: 'max_tokens'` text turn: the streamed
      and persisted text ends with the truncation marker.
- [ ] Normal short conversations behave identically to before (no cap, no markers).
- [ ] No path can loop forever: reading the final loop code, every branch either
      decrements remaining budget or terminates.

## Out of scope

- Retry/backoff on API errors (bugfix-04).
- Per-day token budgets (tool-05).
