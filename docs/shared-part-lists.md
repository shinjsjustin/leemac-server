# Shared part lists

## What changed

- An admin can share a part list with client companies. Sharing gives the list an invite link.
- A logged-in client opens the link, joins the list with their company, and then sees it under shared lists on the Parts page.
- Members can rename the list, add and remove parts, leave the list, and request a quote from it.
- Admins can turn sharing off and remove a member company.
- A fee-only part is hidden from clients. It is now 404 on the client part and file routes. Its fee line stays on the job page.

## Deploy

Run the migration before deploying. Without it the shared list calls fail with 500.

The automated tests run on sqlite, not MySQL, so the dry run below matters. Do not skip it.

1. Back up the database.
2. Dry-run `src/db/migrations/023_shared_part_lists.sql` on a MySQL copy of the database.
3. Run `023_shared_part_lists.sql` on the real database. It goes after `022_job_no_bid.sql`.
4. Deploy the server.
5. Deploy the client.

## Endpoints

Admin routes (`src/routes/adminPartLists.js`) are mounted at `/api/internal/part-lists`. Reads need level 2 and writes need level 3.

| Route | Access level |
| ----- | ------------ |
| `GET /api/internal/part-lists/:id/sharing` | 2 |
| `PUT /api/internal/part-lists/:id/share` | 3 |
| `DELETE /api/internal/part-lists/:id/members/:companyId` | 3 |

Client routes (`src/routes/portalSharedLists.js`) are mounted at `/api/portal-lists/shared`. They need a logged-in client.

| Route | Access level |
| ----- | ------------ |
| `GET /api/portal-lists/shared` | logged-in client |
| `POST /api/portal-lists/shared/invite` | logged-in client |
| `POST /api/portal-lists/shared/invite/join` | logged-in client |
| `GET /api/portal-lists/shared/:id` | logged-in client |
| `PUT /api/portal-lists/shared/:id` | logged-in client |
| `POST /api/portal-lists/shared/:id/parts` | logged-in client |
| `POST /api/portal-lists/shared/:id/parts/remove` | logged-in client |
| `POST /api/portal-lists/shared/:id/leave` | logged-in client |
| `GET /api/portal-lists/shared/:id/request-lines` | logged-in client |
| `POST /api/portal-lists/shared/:id/request` | logged-in client |

## Notes

- A fee-only part is 404 on the client part and file routes. Its fee line still shows on the job page.
- Links are copied by hand. No emails are sent.
- The invite token travels in the POST body, not the URL, so the audit log of request paths never records it.
- Forgot-password loses the return path. A client who resets their password must open the invite link again.

## Browser checklist

As an admin:

- Parts: share a list. An invite link appears; copy it.
- Turn sharing off. The link stops working for new joiners.
- Turn sharing on again and confirm the member companies are listed.
- Remove a member company. It disappears from the list members and from that company's shared lists.

As a client:

- Open the invite link while logged out. After login you land on the invite page, not `/`.
- Join the list. It appears under shared lists on the Parts page.
- Add parts to the list and remove parts from it.
- A fee-only part never appears in the list or its part picker, and its part page is 404.
- The fee line for that part still shows on the job page.
- Request a quote from the list. The request lines match the visible parts only.
- Leave the list. It disappears from shared lists.
- A second company that joined the same list sees none of the first company's hidden parts.
- A client who never joined sees none of the list.
