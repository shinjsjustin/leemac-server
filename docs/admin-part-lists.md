# Admin schedule and part lists

## What changed

- The admin Overview shows a schedule of jobs above the jobs, in both the List and Stage board views.
- The admin Parts page has part lists shared by all admins. They are kept apart from client lists: admins never see client lists, and clients never see admin lists.

## Deploy

Run the migration before deploying. Without it the Parts lists calls fail with 500.

1. Back up the database.
2. Dry-run `src/db/migrations/017_admin_part_lists.sql` on a copy of the database.
3. Run `017_admin_part_lists.sql` on the real database. It goes after `016_star_flags.sql`.
4. Deploy the server, then the client.

## Endpoints

| Route | Access level |
| ----- | ------------ |
| `GET /api/internal/job/schedule` | 1 |
| `GET /api/internal/part-lists` | 2 |
| `POST /api/internal/part-lists` | 2 |
| `PUT /api/internal/part-lists/:id` | 2 |
| `DELETE /api/internal/part-lists/:id` | 2 |
| `POST /api/internal/part-lists/:id/parts` | 2 |
| `POST /api/internal/part-lists/:id/parts/remove` | 2 |

## Notes

- A list records the admin's email as its creator and as its editor.
- Deleting a part removes it from every list.

## Browser checklist (as an admin)

- Overview, List view: the schedule sits above the jobs, with client names and a NOW line.
- Overview, Stage board view: the same schedule sits above the board.
- Clicking a schedule bar opens `/job/:id`.
- Choosing a stage filter narrows the schedule.
- Parts: the rail shows All parts, the lists with their part counts, and + New list.
- Picking a list filters the Parts page to its parts.
- Rename a list, delete a list, add parts and remove parts. A second admin sees each change.
- No client lists appear in the rail.
- Signed in to the client portal, no admin lists appear.
