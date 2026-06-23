# Jarvis AI Architecture

Jarvis is the internal AI assistant for Leemac Manufacturing. It helps the owner
(Justin) manage jobs, parts, shop-floor status, finances, email, and calendar
through a chat interface backed by Anthropic's Claude models.

This document summarizes how the AI subsystem is put together. All AI code lives
in `src/lib/ai/`, exposed to the client through `src/routes/jarvis/`, and backed
by the `ai_*` tables defined in `src/db/migrations/001_jarvis_tables.sql`.

---

## 1. High-level shape

```
Client (React)
   │  POST /api/jarvis/chat   (chunked text stream)
   ▼
routes/jarvis/*            ── HTTP layer: auth, SSE/streaming, lifecycle
   │
   ▼
lib/ai/orchestrator.js     ── Sonnet master loop (tool-use cycle)
   │   ├── lib/ai/tools.js        tool schemas + permission tiers
   │   ├── lib/ai/executor.js     runs tools / queues approvals / audit log
   │   └── lib/ai/agents.js       specialised subagents (Opus / Haiku)
   │
   ├── lib/ai/anthropic.js   ── thin Messages API wrapper (create + stream)
   ├── lib/ai/markitdown.js  ── PDF → Markdown (Microsoft MarkItDown CLI)
   ├── lib/ai/pdfParser.js   ── stage→parse→cleanup for fetched PDFs
   ├── lib/ai/requestTemplates.js ── hard-coded write templates (approval safety)
   └── lib/google/*          ── Gmail (read) + Calendar (write) integrations
        │
        ▼
   MySQL  (ai_sessions, ai_messages, ai_memory, ai_uploads,
           ai_approvals, ai_tool_log, ai_notifications, ai_todos)
```

---

## 2. Models (`models.js`)

A single source of truth maps roles to Anthropic model strings:

| Constant       | Model                | Used for                                   |
| -------------- | -------------------- | ------------------------------------------ |
| `ORCHESTRATOR` | `claude-sonnet-4-6`  | Main chat / tool-use loop                  |
| `HEAVY`        | `claude-opus-4-7`    | PDF structured extraction, EOD consolidation |
| `FAST`         | `claude-haiku-4-5`   | Email triage, lightweight classification   |

This tiering keeps the expensive model on reasoning-heavy work and pushes
high-volume or mechanical work to cheaper models.

---

## 3. The orchestrator (`orchestrator.js`)

The orchestrator is the heart of Jarvis: a Sonnet-driven tool-use loop.

### Session model
- One **session per calendar day** (`ai_sessions`, unique on `session_date`).
- `getOrCreateSession()` opens today's session lazily.
- Conversation history (`ai_messages`) is reloaded on each request so the
  conversation survives reloads and server restarts within the day.

### System prompt (`buildSystemPrompt`)
Assembled fresh on every turn from:
- Static persona + capability description + permission rules + style guide.
- Current date/time (America/Toronto).
- **Prior context** — yesterday's closed-session `context_summary` (morning carry-over).
- **Remembered facts** — up to 100 rows from `ai_memory`.

The prompt explicitly pushes the model to be *proactive*: create calendar events,
add to-dos, and read real email rather than guessing.

### Tool-use loop (`runToolLoop`)
A `while(true)` loop that:
1. Calls `createMessage` with the full history + tool schemas.
2. If `stop_reason !== 'tool_use'`, returns the final response.
3. Otherwise appends the assistant's tool-use turn, executes **every** tool block
   via `executeTool`, appends the `tool_result` blocks as a user turn, and repeats.

### Two entry points
- `runOrchestrator()` — non-streaming; returns final text.
- `runOrchestratorStream()` — async generator. It resolves all tool-use turns
  **non-streaming first**, then streams only the final answer turn as text deltas.
  The last yielded value is a `{ __meta }` sentinel the HTTP layer uses to close
  the stream. User and assistant messages are persisted to `ai_messages`.

---

## 4. Tools (`tools.js`)

Tools are Anthropic tool schemas. Each maps to a backend endpoint or direct DB
operation. They are grouped by tier:

| Tool                     | Tier   | Purpose                                             |
| ------------------------ | ------ | --------------------------------------------------- |
| `read_jobs`              | auto   | Paginated/sortable job list                         |
| `read_job_summary`       | auto   | Full single-job detail + parts + pricing            |
| `read_parts`             | auto   | Part catalog with filters                           |
| `search_parts`           | auto   | Part search with job pricing history                |
| `read_starred_jobs`      | auto   | Active shop-floor job-parts                          |
| `update_nfc_status`      | auto   | Update production status of a starred job-part       |
| `propose_db_change`      | auto*  | Queue a write for human approval (the approval gate) |
| `add_todo` / `read_todos`| auto   | AI to-do list                                       |
| `read_emails` / `read_email` / `read_email_attachment` | auto | Gmail read (bodies + attachments) |
| `create_calendar_event`  | auto   | Create event on owner's primary calendar (immediate)|
| `parse_pdf`              | auto   | Parse a staged PDF upload into structured JSON       |

### Permission tiers (`PERMISSION_TIER`)
- **`auto`** — runs immediately, no human gate.
- **`approval`** — queued to `ai_approvals`; a human must approve before it runs.
- **`always_ask`** — like approval but treated as urgent; never auto-runs.

> Note: `propose_db_change` is itself `auto`, because the tool *is* the approval
> gate — it only ever writes a pending row into `ai_approvals`. Read tools, NFC
> status updates, to-dos, email reads, and calendar creation are all `auto` by
> design (the owner explicitly opted into immediate calendar writes).

---

## 5. Tool execution (`executor.js`)

`executeTool(name, input, { sessionId, authToken, adminId })`:
1. Looks up the tool's tier.
2. If `approval`/`always_ask`, inserts a pending row into `ai_approvals` and
   returns a "queued" message — the tool never runs directly.
3. If `auto`, dispatches to `executeAutoTool`.
4. **Every** call is written to `ai_tool_log` (input, output, success) as an
   immutable audit trail. Logging failures never crash the caller.

`executeAutoTool` dispatches by name:
- Read/write business data → `apiFetch` calls the **internal API**
  (`/api/internal/...`) with the owner's bearer token, so the AI reuses the exact
  same authenticated endpoints the app uses.
- `propose_db_change` → resolves a request template (see §7) and inserts into
  `ai_approvals`.
- `add_todo` → dedupes against existing open to-dos before inserting.
- Email tools → delegate to `lib/google/gmail.js`.
- `create_calendar_event` → delegates to `lib/google/calendar.js`.
- `parse_pdf` / attachment PDFs → MarkItDown-backed parsing (see §6).

Email attachment handling is content-aware: it sniffs the `%PDF` magic bytes
(not just the declared MIME type, since some mailers tag everything as
`application/octet-stream`), routes PDFs through the parser, returns text for
textual types, and falls back to MarkItDown conversion for anything else.

---

## 6. Subagents & document pipeline (`agents.js`)

Heavy or mechanical work is delegated to dedicated subagents so the orchestrator
stays focused.

### PDF parsing
- `runPdfParser(buffer, mimetype, filename)`:
  1. **MarkItDown** (`markitdown.js`) converts the PDF to clean Markdown via the
     Microsoft MarkItDown CLI (shelled out; configurable binary + timeout).
  2. `runPdfExtractor` (Opus, text-only) extracts structured JSON
     (PO number, dates, vendor, line items, prices) from that Markdown.
  3. Markdown is capped at `MAX_MARKDOWN_CHARS` (60k) to bound token cost.
- **Native fallback** (`runPdfExtractorNative`): if MarkItDown is unavailable or
  fails, Opus reads the raw PDF bytes directly so the system stays functional.
- `pdfParser.js` (`parsePdfBuffer`) handles PDFs Jarvis fetches itself (e.g. email
  attachments): stage into `ai_uploads` → parse → always delete the staging row,
  even on failure.

### Email triage (`runEmailTriage`)
Haiku classifies a batch of emails into `action_required` / `informational` /
`junk`, returning a JSON array. Used by the morning brief.

### End-of-day consolidation (`runConsolidation`)
Opus reviews the entire day (messages, tool logs, approvals, todos) and produces:
- A human-readable **digest** → saved as the session's `context_summary` (becomes
  tomorrow's "yesterday's summary").
- One durable **memory entry** → inserted into `ai_memory`, deduped by a SHA-256
  `fact_hash`.

It then marks the session `closed` and **wipes the day's `ai_messages`** — the
durable signal has been distilled into `ai_memory`, so raw chat is discarded.

---

## 7. Write safety: request templates (`requestTemplates.js`)

The AI never builds URLs or picks HTTP methods for writes. Instead:
- `propose_db_change` accepts a **template key** + **params**.
- `requestTemplates.js` holds hard-coded templates (one per JSON write endpoint in
  `routes/job.js`, `part.js`, `notes.js`, `expense.js`, `finances.js`).
- Each template fixes the endpoint path + method and validates params against a
  spec (type, required, enum allow-lists). Unknown params are rejected; malformed
  proposals never reach the queue.
- Multipart/file-upload endpoints are intentionally excluded (can't be driven from
  a JSON proposal).

This means the worst a misbehaving model can do is propose a *valid-shaped* write
that still requires explicit human approval.

---

## 8. HTTP layer (`routes/jarvis/`)

Mounted at `/api/jarvis`, all routes require **owner access** (`req.user.access >= 3`).

- **`index.js`** — barrel router; applies the access check and mounts sub-routers.
- **`chat.js`** — sessions, messages, streaming chat, lifecycle, SSE, uploads:
  - `GET /session`, `GET/POST /messages` — session + message persistence.
  - `POST /chat` — streams the orchestrator response over a chunked connection.
    A **heartbeat** writes newlines during the silent tool-use phase so nginx's
    `proxy_read_timeout` doesn't fire (avoids 504 / incomplete-chunked errors).
  - `POST /start-day` — morning brief: gathers memory, todos, Gmail (triaged via
    Haiku), and today's calendar, then streams a brief and updates the to-do list.
    External calls are wrapped in `withTimeout` so a slow API can't hang the stream.
  - `GET /events` — Server-Sent Events stream for `ai_notifications`. SSE can't
    send auth headers, so it accepts a `?token=` query param and verifies the JWT
    inline.
- **`approvals.js`** — list/inspect/approve/reject the `ai_approvals` queue. On
  approval, the stored `{ endpoint, method, body }` is executed (endpoints are
  validated against an allow-list of `/api/internal/...` prefixes).
- **`todos.js`** — `ai_todos` CRUD.
- **`google.js`** / **`google-callback.js`** — Google OAuth + integration wiring.

---

## 9. Data model (`migrations/001_jarvis_tables.sql`)

| Table              | Role                                                             |
| ------------------ | --------------------------------------------------------------- |
| `ai_sessions`      | One row per day; `status`, `context_summary` (next-day carry-over) |
| `ai_messages`      | Every chat turn within a session (wiped at EOD consolidation)    |
| `ai_memory`        | Durable distilled facts; `fact_hash` UNIQUE for dedup           |
| `ai_uploads`       | Temp staging for files (`staged`/`promoted`/`discarded`)        |
| `ai_approvals`     | Human-in-the-loop write queue; `request_payload` JSON           |
| `ai_tool_log`      | Immutable audit trail of every tool call                        |
| `ai_notifications` | Proactive items surfaced over SSE                               |
| `ai_todos`         | To-do list (AI- or user-sourced)                                |

---

## 10. Daily lifecycle

```
Morning   POST /start-day
          → load ai_memory + todos + Gmail (Haiku triage) + calendar
          → stream morning brief, add new to-dos

Daytime   POST /chat (repeated)
          → Sonnet tool-use loop; reads/writes via tools
          → auto tools run live; writes queue into ai_approvals
          → owner approves/rejects in the Requests panel
          → every message persisted to ai_messages, every tool to ai_tool_log

End of    runConsolidation(session)
day       → Opus distils the day into a digest + one ai_memory fact
          → session marked 'closed', context_summary saved
          → ai_messages for the day wiped (signal lives on in ai_memory)

Next AM   yesterday's context_summary is injected as "Yesterday's summary"
```

---

## 11. Key design principles

- **Model tiering** — Sonnet reasons, Opus does heavy extraction/consolidation,
  Haiku triages. Cost follows complexity.
- **Human-in-the-loop writes** — business-data mutations are *proposed*, never
  executed directly; templates make proposals impossible to malform.
- **Reuse the real API** — tools call the same authenticated `/api/internal`
  endpoints the app uses, so the AI inherits existing validation and auth.
- **Full auditability** — every tool call is logged; every write is queued and
  reviewable.
- **Memory compression** — raw daily chat is ephemeral; only distilled facts and a
  short narrative survive, keeping context small and durable.
- **Graceful degradation** — MarkItDown falls back to native PDF reading; external
  calls have timeouts; logging failures never crash the request.
- **Streaming resilience** — heartbeats and `X-Accel-Buffering: no` keep long
  tool-phase requests alive behind nginx.
