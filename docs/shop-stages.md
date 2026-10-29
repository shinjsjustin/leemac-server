# Shop stages, schedule and ticker

`src/lib/shopStages.js` is the source of truth for stages and the status map. This page summarizes it.

## Stage order

| # | Stage | Label |
| - | ----- | ----- |
| 1 | `quoted` | Quoted |
| 2 | `in_shop` | In the shop |
| 3 | `material` | Material |
| 4 | `preparing` | Preparing |
| 5 | `machining` | Machining |
| 6 | `outside_finishing` | Outside finishing |
| 7 | `finishing` | Finishing |
| 8 | `inspection` | Inspection |
| 9 | `packing` | Packing |
| 10 | `done` | Done |
| 11 | `delivered` | Delivered |
| 12 | `invoiced` | Invoiced |

## Star status to stage

| Star status | Stage |
| ----------- | ----- |
| `quoted` | `quoted` |
| `open` | `in_shop` |
| `urgent` | `in_shop` |
| `waiting` | `in_shop` |
| `checking_stock` | `material` |
| `waiting_material` | `material` |
| `programming` | `preparing` |
| `setup` | `preparing` |
| `running_machine_a` | `machining` |
| `running_machine_d` | `machining` |
| `running_manual` | `machining` |
| `at_subvendor` | `outside_finishing` |
| `waiting_finish` | `outside_finishing` |
| `deburr_clean` | `finishing` |
| `qa` | `inspection` |
| `packing` | `packing` |
| `done` | `done` |
| `delivered` | `delivered` |
| `invoiced` | `invoiced` |

Clients see stages only, never the raw star status (it names machines).

Jobs with no starred part also use `open` (label Open) and `shipped` (label Shipped). Those two sit outside the stage order.

## How a job's stage is chosen

- A job with starred parts takes the stage of its least-advanced starred part.
- Otherwise: `invoiced` if it has an invoice date, `shipped` if it has a ship date, else `open`.

## Due soon and overdue

A job that has not shipped, has a due date and is before the `done` stage is flagged `overdue` when the due date has passed, and `due_soon` when it is due in 7 days or less. Flags are computed for a client's own jobs only.

## GET /api/portal/schedule

Client login required. Returns `{ window, timeline, board }`.

- `window`: `{ start, end }` as `YYYY-MM-DD`, 28 days starting the Monday before this week's Monday.
- `timeline`: the client's own jobs overlapping the window, each `{ id, job_number, start, due_date, ship_date, stage, flag }`, where `stage` is `{ key, label }`. `start` is the PO date, else the created date.
- `board`: every job with at least one starred part, sorted by stage then job number.
  - Other clients' jobs carry only `{ job_number, stage, part_count }`, with `stage` as `{ key, label }`.
  - Own jobs carry `{ id, job_number, stage, part_count, flag, own: true }`, with `stage` as `{ key, label }`.

## GET /api/portal/ticker

Client login required. Returns an array of at most 20 stage changes from the last 7 days, newest first. Status changes that stay within the same stage are skipped.

- Other clients' entries carry only `{ at, job_number, stage }`, with `stage` as `{ key, label }`.
- Own entries carry `{ at, job_number, part_number, stage, own: true }`, with `stage` as `{ key, label }`.

## Overview headline and wall

`GET /api/portal/overview` adds two fields.

- `headline`: `{ active_jobs, due_soon, overdue, on_time_rate, parts_in_shop }` for the client's own jobs. `on_time_rate` is the percent of jobs shipped in the last 90 days that shipped on or before the due date, or `null` when none shipped. `parts_in_shop` counts starred parts before the `done` stage.
- `wall`: up to 12 of the client's starred parts, least advanced first, each `{ job_part_id, part_id, part_number, rev, job_id, job_number, stage: { key, label }, drawing }`. `drawing` is the part's newest drawing or `null`.

## Status history

The admin and NFC status routes (`updatestarjobstatus`, `updatestarstatusbyjobnumber`, `updatestarstatusbynfctag`) log each change to `star_status_history` with the source (`admin` or `nfc`). A write that leaves the status unchanged logs nothing. The ticker reads this table.

`PUT /api/client/portal/status` answers 410. Clients can no longer set star status.

## Deploy

1. Back up the database: `mysqldump <database> > backup.sql`.
2. Dry run `src/db/migrations/015_star_status_history.sql` on a copy restored from that backup.
3. Run `015_star_status_history.sql` on the live database, before deploying.
4. Deploy the server.

The ticker is empty until changes are logged; nothing is backfilled.
