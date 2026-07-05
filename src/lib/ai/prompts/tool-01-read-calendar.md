# [NEW TOOL] `read_calendar` — let Jarvis see the calendar, not just write to it

**Category:** New capability tool
**Files:** `src/lib/google/calendar.js`, `src/lib/ai/tools.js`, `src/lib/ai/executor.js`,
`src/lib/ai/orchestrator.js` (prompt text), `src/lib/ai/ai_dox.md`
**Run after:** Phase 1 (ideally bugfix-02, to reuse the Toronto time helper)

## Problem

Jarvis can **create** calendar events (`create_calendar_event`, auto tier) but cannot
**read** the calendar in chat. `getTodaysEvents` exists in
`src/lib/google/calendar.js` but is only wired into the `POST /start-day` morning
brief. So Jarvis:

- can't answer "what's on my calendar this week?",
- can't check for conflicts before creating an event (it schedules blind),
- can't cross-reference due dates against existing commitments.

## Required changes

### 1. Generalize the calendar read in `src/lib/google/calendar.js`

Add `getEvents(adminId, { timeMin, timeMax, maxResults = 50 })`:

- Same `calendar.events.list` call and result mapping as `getTodaysEvents`
  (`singleEvents: true`, `orderBy: 'startTime'`, primary calendar), parameterized on
  the time window.
- Refactor `getTodaysEvents` to delegate to it (today's Toronto-day bounds) so there
  is one implementation. Keep its export — `chat.js` start-day uses it.
- The existing today-bounds computation uses server-local midnight
  (`new Date(y, m, d)`); when computing day bounds here, use America/Toronto
  midnights via the `src/lib/ai/time.js` helper from bugfix-02 (add a
  `torontoDayBounds(dateString)` helper there if useful). If bugfix-02 hasn't
  landed, compute Toronto bounds locally with `Intl` — do not use server-local
  midnight.

### 2. Tool schema in `src/lib/ai/tools.js`

```
name: 'read_calendar'
description: 'List events on the owner's Google Calendar for a date range.
  Use this to answer schedule questions, find free time, and ALWAYS to check for
  conflicts before creating a calendar event. Dates are interpreted in the
  shop's timezone (America/Toronto).'
input_schema:
  start_date: string (YYYY-MM-DD) — first day, inclusive. Default: today.
  end_date:   string (YYYY-MM-DD) — last day, inclusive. Default: start_date + 6 days.
  max_results: integer (1–100, default 50)
```

Register `read_calendar: 'auto'` in `PERMISSION_TIER` (read-only).

### 3. Executor case in `src/lib/ai/executor.js`

- Validate/normalize the dates (reject malformed, swap if reversed or error —
  pick one and document it in the tool description).
- Convert `start_date`/`end_date` (Toronto days) → `timeMin` = start day 00:00
  Toronto, `timeMax` = end day 24:00 Toronto, call `getEvents`, return
  `{ count, events }`.
- Follow the existing style of neighboring cases (`create_calendar_event` shows the
  validation pattern).

### 4. Prompt text updates in `src/lib/ai/orchestrator.js`

- Capabilities paragraph: mention reading the calendar.
- In the proactivity section, add: *"Before creating a calendar event, check
  read_calendar for conflicts around that time and mention any overlap you find."*

### 5. Documentation

Add the tool to the tools table in `src/lib/ai/ai_dox.md` (§4).

## Acceptance criteria

- [ ] In chat: "what's on my calendar this week?" lists real events with local times.
- [ ] "Schedule lunch with Mike tomorrow at noon" → Jarvis reads the calendar first,
      flags a conflicting event if present, then creates the event.
- [ ] Date-only inputs resolve to Toronto day bounds (an event at 11 PM Toronto on
      `end_date` is included; one at 1 AM the next day is not).
- [ ] Defaults work: no params → today through +6 days.
- [ ] Morning brief (`/start-day`) unchanged and still working.
- [ ] `ai_tool_log` shows `read_calendar` calls with sane input/output.

## Out of scope

- Editing/deleting events, secondary calendars, free-busy API, attendee invites.
