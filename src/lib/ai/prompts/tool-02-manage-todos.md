# [NEW TOOL] `complete_todo` + `update_todo` — close the loop on the to-do list

**Category:** New capability tool
**Files:** `src/lib/ai/tools.js`, `src/lib/ai/executor.js`,
`src/lib/ai/orchestrator.js` (prompt text), `src/lib/ai/ai_dox.md`
**Run after:** Phase 1

## Problem

Jarvis can `add_todo` and `read_todos`, but when Justin says *"I sent the Acme quote,
you can cross that off"*, Jarvis can do nothing — completing or editing a to-do is
only possible by hand in the UI (`PATCH /api/jarvis/todos/:id` exists for the
TodoApp, but there is no AI tool). The morning brief adds tasks daily; nothing lets
the AI retire them, so the list only grows.

## Required changes

### 1. Tool schemas in `src/lib/ai/tools.js`

Two explicit tools (clearer for the model than one overloaded updater):

```
name: 'complete_todo'
description: 'Mark a to-do as done. Use when Justin says a task is finished or no
  longer needed. If you do not know the todo id, call read_todos first and match by
  meaning. If several open todos could match, ask Justin which one instead of guessing.'
input_schema:
  todo_id: integer (required) — id from read_todos
```

```
name: 'update_todo'
description: 'Edit the title and/or description of an existing to-do (e.g. to add
  details, correct it, or fold in new information). Does not change done status.'
input_schema:
  todo_id:     integer (required)
  content:     string (optional) — new title, max 500 chars
  description: string (optional) — new longer detail
  (at least one of content/description required)
```

Register both as `'auto'` in `PERMISSION_TIER` — the to-do list is the AI's own
workspace; it is not gated business data (same reasoning as `add_todo`).

### 2. Executor cases in `src/lib/ai/executor.js`

Follow the `add_todo` pattern (direct `db.query`, no HTTP hop):

- `complete_todo`:
  - `UPDATE ai_todos SET done = 1 WHERE id = ?` — but first `SELECT` the row;
    return a not-found error message (not a throw-crash) if missing, and a
    `{ already_done: true }` note if it was done already.
  - Return the row `{ id, content, done: 1 }` so the model can confirm what it
    closed.
- `update_todo`:
  - Validate at least one field present; truncate `content` to 500 like `add_todo`.
  - Build the UPDATE only over supplied fields; return the updated row.
  - Same not-found handling.

Column names: the table uses `content` (title), `description`, `done` (0/1) — see
`db/migrations/003_todo_title_description.sql` and `routes/jarvis/todos.js` for the
authoritative shapes.

### 3. Prompt text in `src/lib/ai/orchestrator.js`

In the proactivity section add:

- *"When Justin says he finished, sent, handled, or no longer needs something, check
  read_todos for a matching open item and complete_todo it — confirm what you
  closed. If more than one item plausibly matches, ask."*

Also update the **morning brief** instructions in `POST /start-day`
(`src/routes/jarvis/chat.js`, the `morningPrompt` text): after step 3 about adding
new tasks, add a step: *"Also complete any open to-do that yesterday's context or
the emails show is already finished."*

### 4. Documentation

Add both tools to the table in `src/lib/ai/ai_dox.md` (§4).

## Acceptance criteria

- [ ] "I paid the hydro bill, cross it off" with a matching open todo → Jarvis reads
      todos, completes the right one, and names it in the reply; TodoApp shows it done.
- [ ] Ambiguous case (two similar todos) → Jarvis asks rather than guessing.
- [ ] `update_todo` with only a description works; with neither field returns a clear
      error to the model (visible in `ai_tool_log`), not a crash.
- [ ] Nonexistent `todo_id` → graceful error result; loop continues.
- [ ] TodoApp UI (`src/client/src/components/Jarvis/TodoApp.js`) reflects AI-made
      changes after its next refresh with no client changes needed.

## Out of scope

- Deleting todos (UI `POST /todos/clear` stays human-only).
- Reopening completed todos (add later if a real need appears).
- Priority/due-date fields on todos.
