# Client notes and portal overview

Client-role sessions only. All routes answer `Cache-Control: no-store`. Errors are `{ "error": "<message>" }`.

## Endpoints

### `GET /api/portal-notes`

Notes on the company's jobs and parts: client notes plus admin notes that are shared.

```json
{
  "jobs":  { "<jobId>":  [ Note ] },
  "parts": { "<partId>": [ Note ] }
}
```

Note: `{ id, content, author, is_client, mine, created_at, updated_at }`. `author` is the client's name, or `Leemac` for a shared admin note. `mine` is true only for the caller's own notes.

### `POST /api/portal-notes`

Body: `{ "content": "...", "job_id": 12 }` or `{ "content": "...", "part_id": 7 }`. Send exactly one of `job_id` or `part_id`.

Response `201`: `{ "id": 99 }`. Errors: `400` (bad content or ids), `404` (job or part not in the company), `503` (migration 009 admin missing).

### `PUT /api/portal-notes/:id`

Body: `{ "content": "..." }`. Response `200`: `{ "ok": true }`. `404` if the note is not the caller's own.

### `DELETE /api/portal-notes/:id`

Response `200`: `{ "ok": true }`. `404` if the note is not the caller's own.

### `GET /api/portal/overview`

Query: the same paging parameters as the jobs list. Response:

```json
{
  "jobs": [ ],
  "pagination": { },
  "parts": [ { "part_id": 7, "part_number": "A-1", "part_description": "...",
               "jobs": [ { "id": 12, "job_number": "J-100" } ],
               "drawings": [ { "id": 3, "filename": "a.pdf", "mimetype": "application/pdf",
                               "kind": "pdf", "url": "/api/portal/files/3" } ] } ],
  "lists": [ ],
  "requests": [ ]
}
```

`kind` is `pdf`, `image` or `other`. Drawing content is never included; fetch it from `url`.

### Old routes

`/api/client/portal/jobs/:id/notes` (every method) now answers `410` with `{ "error": "Note routes moved to /api/portal-notes" }`.

## Privacy rules

- Everything is scoped to the caller's company.
- Admin notes are private unless shared; only shared ones reach clients, authored `Leemac`.
- Clients edit only their own notes, and delete only their own.
- Content is trimmed and must be 1-255 characters.

## Deploy

1. Back up the database: `mysqldump <database> > backup.sql`.
2. Dry run `src/db/migrations/014_client_notes.sql` on a copy restored from that backup.
3. Run `014_client_notes.sql` on the live database.
4. Deploy the server.
