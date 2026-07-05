# [BUG FIX] Session dates use UTC — evening chats land in tomorrow's session

**Category:** Bug fix
**Priority:** P0 (actively corrupts the daily session lifecycle every evening)
**Files:** new `src/lib/ai/time.js`, `src/lib/ai/orchestrator.js`, `src/routes/jarvis/chat.js`

## Problem

The Jarvis session model is "one session per calendar day" in **America/Toronto**
(the shop's timezone — the system prompt and calendar integration already use it).
But every place that computes "today" uses UTC:

- `src/lib/ai/orchestrator.js` → `getOrCreateSession()`:
  `new Date().toISOString().slice(0, 10)`
- `src/routes/jarvis/chat.js` → `getToday()` (used by `GET /session`,
  `getOrCreateTodaySession()` for `GET/POST /messages` and `/upload`, and
  `POST /end-day`): same UTC expression.

Toronto is UTC-4/-5, so **from ~7–8 PM local onward, "today" is already tomorrow**:

- An evening chat creates *tomorrow's* `ai_sessions` row; the conversation forks away
  from the real today-session.
- `POST /end-day` run in the evening looks up the open session for the UTC date and
  can miss or consolidate the wrong day.
- The next morning, `GET /session` finds the session created last evening, with no
  `context_summary` carry-over.

## Required changes

### 1. Create `src/lib/ai/time.js`

A tiny shared module, single source of truth for shop-local time:

```js
const SHOP_TZ = 'America/Toronto';

// 'YYYY-MM-DD' for the shop's local calendar day.
// en-CA locale formats as YYYY-MM-DD natively.
function torontoDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: SHOP_TZ });
}

// Human-readable "now" string for prompts (move the existing builder here).
function torontoNowString(date = new Date()) { /* the toLocaleString('en-US', { timeZone, weekday... }) builder currently in chat.js/orchestrator.js */ }

module.exports = { SHOP_TZ, torontoDateString, torontoNowString };
```

Be careful: `toLocaleDateString('en-CA')` output must be validated once in a scratch
script (Node ICU can vary); if it does not produce `YYYY-MM-DD`, build it from
`Intl.DateTimeFormat(...).formatToParts` instead.

### 2. Replace every UTC "today" in the Jarvis subsystem

- `orchestrator.js` `getOrCreateSession()` → `torontoDateString()`.
- `chat.js` `getToday()` → delegate to `torontoDateString()` (or delete the local
  helper and import directly). This covers `GET /session`,
  `getOrCreateTodaySession()`, and `POST /end-day`.
- `chat.js` `getNowString()` and the equivalent date-string builder inside
  `orchestrator.js buildSystemPrompt()` → use `torontoNowString()` so the format
  lives in one place.
- `getYesterday()` in chat.js returns a `Date` 24h back used only as a Gmail `since`
  filter — that is fine as-is; leave it.

Search for any other `toISOString().slice(0, 10)` under `src/lib/ai/` and
`src/routes/jarvis/` and convert them. (One exists in `src/routes/job.js` — see out
of scope.)

### 3. Timezone note for the consolidation query

`runConsolidation` in `src/lib/ai/agents.js` selects approvals with
`DATE(created_at) = session.session_date` — `created_at` is written by MySQL `NOW()`
in the **DB server's** timezone. Do not refactor this now, but add a short code
comment noting the assumption (DB timezone ≈ shop timezone) so it isn't a silent
trap. If the DB runs UTC, flag it in your completion summary.

## Acceptance criteria

- [ ] Scratch test: with the system clock (or an injected `Date`) at
      `2026-07-05T23:30:00-04:00` Toronto, `torontoDateString()` returns
      `'2026-07-05'` (UTC would say `2026-07-06`).
- [ ] Creating a session at 9 PM Toronto lands on today's `session_date`, and
      `POST /end-day` at 9 PM finds and closes it.
- [ ] All Jarvis session lookups (`GET /session`, `GET/POST /messages`, `/upload`,
      `/end-day`, orchestrator) use the shared helper — grep shows no remaining
      `toISOString().slice(0, 10)` under `src/lib/ai/` or `src/routes/jarvis/`.
- [ ] System-prompt date strings still render correctly (weekday, date, time).

## Out of scope

- `src/routes/job.js` uses the same UTC pattern for invoice dates — same class of
  bug but in business logic, not Jarvis. Mention it in your completion summary as a
  recommended follow-up; do not change it in this task.
- Changing the MySQL connection/server timezone.
