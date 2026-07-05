# [BUG FIX] Single source of truth for chat persistence; stop persisting the morning-brief mega-prompt

**Category:** Bug fix
**Priority:** P2
**Files:** `src/lib/ai/orchestrator.js`, `src/routes/jarvis/chat.js`,
`src/client/src/components/Jarvis/ChatApp.js`
**Run after:** bugfix-01

## Problem

Two writers compete over `ai_messages`:

1. **The orchestrator** persists each user message and final assistant text as turns
   complete (`persistMessage` in `src/lib/ai/orchestrator.js`).
2. **The client** (`ChatApp.js`) POSTs its entire local message list to
   `POST /api/jarvis/messages`, which **deletes all rows for the session and
   re-inserts** the client's copy (`src/routes/jarvis/chat.js`).

Consequences:

- Classic lost-update race: if the client saves while a turn is streaming, the
  orchestrator's insert can interleave with the wipe-and-replace, duplicating or
  dropping turns.
- The two copies drift (the client renders heartbeat newlines trimmed, etc.), and
  which one survives depends on who wrote last.

Related wart: **`POST /start-day` persists the entire context-stuffed morning prompt
as a user chat message.** It builds `morningPrompt` (remembered facts + todos + email
triage + calendar, easily several KB) and passes it to `runOrchestratorStream`, which
`persistMessage`s it as a normal `user` turn. So:

- The giant scaffold blob replays in model history on every subsequent turn all day
  (token waste), and
- After a page reload, `GET /messages` shows it to Justin as if he had typed it.

## Required changes

### 1. Server becomes the single source of truth

- **Keep** orchestrator-side persistence as the only writer of chat turns.
- **Remove** the wipe-and-replace `POST /messages` route in `chat.js`, and remove the
  client's call to it in `ChatApp.js` (it currently saves after each exchange).
  Check `RequestsApp.js` / `TestPanel.js` / `Jarvis.js` for other callers first.
- The client keeps its in-memory list for rendering during the day and hydrates from
  `GET /messages` on mount — that route stays.

### 2. Display-vs-model split for scaffolded prompts

Give `runOrchestratorStream` (and `runOrchestrator`) an options field
`persistedUserText` (default: the raw user message). The model still receives the
full scaffolded prompt in its history for the current run, but what gets
**persisted** — and therefore what re-renders after reload and replays in future
history — is the display text.

In `POST /start-day`, pass something like
`persistedUserText: 'Good morning — give me my brief.'` while sending the full
`morningPrompt` to the model.

Note the tradeoff in a comment: subsequent turns *today* will see the short marker
rather than the full context block in history — that is fine because the brief's
*answer* (which is persisted) carries the digest content forward.

### 3. Message-type fidelity (small)

`persistMessage` hardcodes `message_type = 'chat'`. Accept an optional type and use
`'morning_brief'` for the start-day exchange (schema already allows it — see the
valid-types set previously used by the removed POST route). No client rendering
change required, but it makes the data honest for consolidation.

## Acceptance criteria

- [ ] Send several chat messages, reload the page: `GET /messages` renders the exact
      conversation once — no duplicates, no missing turns.
- [ ] Run start-day, reload: the conversation shows the short marker + the brief,
      not the multi-KB scaffold. The `ai_messages` row for the user turn has
      `message_type = 'morning_brief'`.
- [ ] Chat while a second tab reloads mid-stream: no duplicated or lost turns after
      both settle.
- [ ] Grep confirms no remaining caller of `POST /api/jarvis/messages`; route is gone.
- [ ] End-of-day consolidation (`runConsolidation`) still reads sensible history.

## Out of scope

- Persisting intermediate tool_use/tool_result turns (current design intentionally
  keeps only user/assistant text — leave as is).
- Any UI redesign of ChatApp beyond deleting the save call.
