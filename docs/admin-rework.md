# Admin rework hand-over

Steps for shipping the admin rework branch once. Stage details are in [shop-stages.md](shop-stages.md).

## Deploy

1. Back up the database.
2. Dry-run migration 016 on a copy of the backup.
3. Apply `src/db/migrations/016_star_flags.sql` to the production database (after 015, before the new code).
4. Deploy the server.

The migration rewrites the old `urgent` and `waiting` statuses to open plus the Urgent or Waiting flag. All three map to the `in_shop` stage, so clients see no change. Nothing is dropped.

## What changed

- **Rail and Cmd-K:** the admin shell has a left rail for navigation, and Cmd-K opens search across jobs and pages.
- **Overview:** `/starred-jobs` is now the Overview, with the board, stage chips and stage menu, notes, and a phone layout with a sheet.
- **Job page:** `/job/:id` has a stage strip, files and expenses, and the old level gates kept.
- **Quote requests:** `/quote-requests` has an inbox rail with tabs, and `/quote-request/:id` has the price sheet and review page with past prices. The 28 Oct request flow is unchanged.
- **Finances:** `/finances` shows headline cards, the month chart, the quarter summary, invoices and expenses with their modals.
- **Finish and paid-unstar:** finishing a job and marking its invoice paid un-stars it, so it leaves the Overview.
- **Jarvis and Daily report removal:** the Jarvis and Daily report pages are removed, but their tables are kept. The Google OAuth addresses under `/api/jarvis/google` stay, since Connect Google and Check Gmail use them.

## Manual checks

Compare each page with `references/admin-rework-2026-10-29/renders`.

- [ ] Overview at 1440 wide
- [ ] Job page at 1440 wide
- [ ] Quote requests at 1440 wide
- [ ] Finances at 1440 wide
- [ ] Cmd-K search and the rail at 1440 wide
- [ ] Overview at 393 wide, including the phone sheet
- [ ] Connect Google from Settings
- [ ] Check Gmail from Settings
- [ ] Mark an invoice paid: the job is un-starred and leaves the Overview
