# Client portal redesign (29 Oct 2026)

The client portal got a new look and layout: a shared top nav (bottom tab bar on phones), drawings leading every part card, status colour as the only colour, and a dark no-scroll Overview. The design is in `references/redesign-2026-10-29/notes.md`; wireframes are in `references/redesign-2026-10-29/wireframes/` and renders in `references/redesign-2026-10-29/renders/`.

## Pages

| Page | Route | Wireframe | Render | Main components |
| ---- | ----- | --------- | ------ | --------------- |
| Overview | `/client-overview` | `overview.html` | `overview.png`, `overview-calm.png` | `ClientOverview`, `OverviewSchedule`, `OverviewTicker`, `StageBadge`, `NotePin` |
| Your jobs | `/client-home` | `index.html` | `index.png` | `ClientHome`, `JobRow`, `StageBadge`, `NotePin` |
| Job | `/client-job/:id` | `job.html` | `job-desktop.png`, `job-mobile.png`, `job-mobile-pin-tap.png` | `ClientJob`, `PortalDrawing`, `StageBadge`, `NotePin` |
| Parts | `/client-parts` | `parts.html` | `parts-desktop.png`, `parts-desktop-full.png`, `parts-mobile.png`, `part-detail-*.png` | `ClientPartsPage`, `PartWall`, `PartListsPanel`, `DrawingWindows`, `DrawingTile`, `ListRequestForm` |
| Your requests | `/client-requests` | `request.html` | `request-desktop.png`, `request-mobile.png` | `ClientRequestsPage`, `RequestRail` |
| Request | `/client-request/:id` (`/client-request/new` for a new one) | `request.html` | `request-desktop.png`, `request-mobile.png` | `ClientRequestPage`, `RequestRail`, `RequestGrid`, `PortalField` |

`/client-part/:id` (`ClientPartPage`) still exists for a single part. All pages sit in `PortalLayout`. `/client-request` redirects to `/client-requests`.

## Deploy order

Migration `src/db/migrations/015_star_status_history.sql` must be live before the server is deployed:

1. Back up the database.
2. Dry run `015_star_status_history.sql` on a copy restored from that backup.
3. Run it on the live database.
4. Deploy the server and client.

The commands and the ticker's empty start are in [docs/shop-stages.md](shop-stages.md) (Deploy section).

## Behaviour changes

- `PUT /api/client/portal/status` is refused with 410 ("Status is set by Leemac"). Clients no longer set status.
- Reorder is dropped from the portal.
- Requests start from a list ("Start from a list") or a new request; the 28 Oct request flow is otherwise unchanged.
- Admin pages are unchanged.

## Manual checks

Log in as the test client. Check every page at 1440x900 and at 393 wide: Overview, Your jobs, Job, Parts, Your requests, Request.

- [ ] Overview at 1440x900 fits without scrolling (jobs, schedule, wall, ticker, parts rail).
- [ ] In the schedule, other clients' entries show only job number, stage and part count.
- [ ] Parts: clicking parts opens drawing windows, at most 6; opening a 7th closes the oldest.
- [ ] Esc closes the focused window; a click on the dark area and Close all close every window.
- [ ] Note pins open after a short hover on desktop and in a bottom sheet on tap at 393 wide.
- [ ] At 393 wide, the bottom tab bar shows Jobs, Parts, Requests, Account, and Parts | Lists switches the view.
- [ ] At 393 wide, the drawing viewer swipes between opened parts.
- [ ] Request: add a PDF and STEP, check the missing-STEP and empty Qty warnings, submit, and confirm the sent request is read-only.
- [ ] Start a request from a list and from "New request".
- [ ] The status change is refused (410) and no Reorder control appears.
- [ ] Admin pages look and work as before.
