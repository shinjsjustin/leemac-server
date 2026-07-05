# [BUG FIX] SSE notifications endpoint is unreachable; JWT leaks into URLs

**Category:** Bug fix (security + dead feature)
**Priority:** P1
**Files:** `src/server.js`, `src/routes/jarvis/chat.js`, `src/routes/jarvis/index.js`,
`src/client/src/components/Jarvis/Jarvis.js`

## Problem

Two stacked issues with `GET /api/jarvis/events` (the SSE stream for
`ai_notifications`):

1. **The endpoint is unreachable.** The route does its own inline JWT check and
   accepts `?token=` because `EventSource` cannot send an `Authorization` header.
   But the router mounting defeats it:
   - `src/server.js`: `app.use('/api/jarvis', isAuth, jarvisRoutes)` — `isAuth`
     (`src/middleware/isAuth.js`) reads **only** the `Authorization` header and 401s
     when it's missing.
   - `src/routes/jarvis/index.js` then applies the owner-access check
     (`req.user.access >= 3`) to **all** sub-routes.
   - `src/routes/jarvis/chat.js` also applies `router.use(requireOwner)` **above**
     the `/events` handler (the comment claims `/events` is above the guard, but it
     is defined below it).
   An `EventSource('/api/jarvis/events?token=…')` request has no header, so `isAuth`
   returns 401 before the route's own token check ever runs. The client
   (`Jarvis.js` → `connectEventSource`) silently reconnect-loops. The whole
   notifications feature is dead.

2. **Even if it worked, the design leaks the owner's long-lived JWT** into the URL
   query string — captured by nginx access logs, browser history, and any proxy.

## Required changes — single-use short-lived tickets

### 1. Ticket issuance (authenticated, header-based)

In `chat.js`, add `GET /events-ticket` (a normal route behind the existing auth):
returns `{ ticket }` where ticket is `crypto.randomBytes(32).toString('hex')`,
stored in a module-level `Map<ticket, { adminId, expiresAt }>` with a 60-second TTL.
Sweep expired entries opportunistically on each issue/consume. In-memory is
acceptable — this app runs as a single Node process (note this assumption in a
comment).

### 2. Ticket consumption on `/events`

- Route the SSE endpoint **around** the header-only auth. Cleanest option: mount it
  in `src/server.js` *before* `isAuth` (mirroring the existing
  `jarvisGoogleCallbackRoutes` precedent at `/api/jarvis/google`), e.g. move the
  handler into its own small router file mounted at `/api/jarvis/events`.
- The handler accepts `?ticket=`, looks it up, checks expiry, **deletes it**
  (single-use), and proceeds with the stream. Invalid/expired/missing → 401. Remove
  the `?token=` JWT path entirely.
- Keep the existing stream behavior (poll `ai_notifications`, keepalives,
  `X-Accel-Buffering: no`, cleanup on `close`).

### 3. Client update (`Jarvis.js`)

- Before opening the `EventSource`, `await jarvisFetch('/events-ticket')` and use
  `.../events?ticket=${ticket}`.
- Tickets are single-use, so the browser's automatic `EventSource` reconnect will
  fail with 401. Handle `onerror`: close the `EventSource`, fetch a fresh ticket,
  and reconnect with backoff (e.g. 2s, capped at 30s). Guard against reconnect
  storms when auth is genuinely broken (stop after ~5 consecutive failures and
  surface a console warning).
- Update the now-incorrect comment about `req.query.token`.

### 4. Fix the stale comment in `chat.js`

The "The /events SSE route above handles its own auth" comment block is wrong on two
counts after this change — rewrite it to describe the ticket flow.

## Acceptance criteria

- [ ] With the app running and a row inserted into `ai_notifications`
      (`INSERT INTO ai_notifications (type, content) VALUES ('email_summary','test')`),
      the Jarvis UI receives the SSE event within one poll interval. (This is the
      first time the feature will have worked — verify end to end.)
- [ ] `curl` the events URL with a used or made-up ticket → 401.
- [ ] A ticket older than 60s → 401.
- [ ] No JWT appears in any URL. Grep the client for `token=` to confirm the old
      path is gone.
- [ ] Killing and restarting the connection (dev-tools offline toggle) recovers via
      the fresh-ticket reconnect path.

## Out of scope

- Replacing polling with a push/notify mechanism inside the server.
- Multi-process/cluster ticket storage (single process assumption documented).
- Producing more notification types (only `/ingest-email` writes them today — worth
  a follow-up note in your summary, e.g. notifying on queued approvals).
