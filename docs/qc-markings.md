# QC markings

Markings are points, lines and boxes drawn on a part's drawing page, with optional photos. Coordinates are fractions 0-1 of the full untrimmed page. All routes answer `Cache-Control: no-store`. Errors are `{ "error": "<message>" }`; an unknown route or a non-numeric `:id` answers `404 { "error": "Not found" }`.

Marking body (create and update): `{ "file_id": 3, "page": 1, "kind": "point", "x1": 0.2, "y1": 0.4, "x2": 0.6, "y2": 0.8, "size": 12, "note": "..." }`.

- `kind` is `point`, `line` or `box`. `page` is an integer of 1 or more. `x1`, `y1` are 0-1.
- `line` and `box` need `x2`, `y2` (0-1); `size` is ignored. `point` needs `size` 1-40; `x2`, `y2` are ignored.
- `note` is optional, at most 255 characters.
- `file_id` must be a drawing of the part (not a job file or note attachment), else `404`.

## Client routes

Base `/api/portal-qc`. Client-role sessions only (invalid token `401`, non-client `403`), with the portal rate limits; writes use the portal write limiter. Everything is scoped to the caller's company.

### `GET /api/portal-qc/parts/:id`

Response `200`:

```json
{
  "markings": [ { "id": 1, "part_id": 7, "file_id": 3, "page": 1, "company_id": null, "kind": "box",
                  "x1": 0.1, "y1": 0.1, "x2": 0.5, "y2": 0.5, "size": null, "note": "...",
                  "author_name": "Pat", "created_at": "...", "updated_at": "...",
                  "is_leemac": true, "mine": false } ],
  "photos": [ { "job_id": 12, "job_number": "J-100", "ship_date": "...", "po_number": "...", "quantity": 4,
                "photos": [ { "id": 5, "marking_id": 1, "position": 1, "value": "4.50", "caption": "...",
                              "mimetype": "image/jpeg", "size": 1234, "uploaded_by_name": "Sam",
                              "uploaded_at": "..." } ] } ]
}
```

`is_leemac` is true for Leemac markings; `mine` is true for the caller's company's. Photos are metadata only, grouped by job, newest job first. Errors: `404` (part not in the company).

### `POST /api/portal-qc/parts/:id/markings`

Body: a marking body. Response `201`: `{ "id": 99 }`. Errors: `400` (invalid field), `404` (part or drawing not found).

### `DELETE /api/portal-qc/parts/:id/markings`

Clear: removes all of the company's markings on the part, and their photos. Leemac's stay. Response `200`: `{ "ok": true }`. Errors: `404`.

### `POST /api/portal-qc/parts/:id/ping`

No body. Asks Leemac to photograph the part. Response `200`: `{ "ok": true }`. Errors: `400` ("Add a marking before pinging", the company needs at least one marking on the part), `404`.

### `PUT /api/portal-qc/markings/:id`

Body: a marking body. Response `200`: `{ "ok": true }`. Errors: `400`, `404` (not the company's own marking, or drawing not found).

### `DELETE /api/portal-qc/markings/:id`

Deletes the marking and its photos. Response `200`: `{ "ok": true }`. `404` if not the company's own marking.

### `GET /api/portal-qc/photos/:id`

Response `200`: the image bytes, with the stored `Content-Type`. `404` unless the photo is on a job of the caller's company.

## Admin routes

Base `/api/internal/qc`. Reads need access level 2, writes need access level 3 (otherwise the admin gate answers the refusal). Photos and markings are recorded under the admin's name.

### `GET /api/internal/qc/parts/:id` (access 2)

Response `200`: `{ "markings", "pings", "photos", "jobs" }`.

- `markings`: every marking on the part, Leemac and every company, with `company_id` (null for Leemac) and `company_name`.
- `pings`: `{ company_id, company_name, pinged_at, pinged_by_name, ping_count }` per company.
- `photos`: grouped by job like the client route, across all companies.
- `jobs`: `{ id, job_number, company_id, created_at }` for each job holding the part, newest first.

### `POST /api/internal/qc/parts/:id/markings` (access 3)

Body: a marking body. Creates a Leemac marking. Response `201`: `{ "id": 99 }`. Errors: `400`, `404` (part or drawing).

### `DELETE /api/internal/qc/parts/:id/markings` (access 3)

Clears Leemac's markings on the part and their photos. Client markings stay. Response `200`: `{ "ok": true }`.

### `PUT /api/internal/qc/markings/:id` (access 3)

Body: a marking body. Response `200`: `{ "ok": true }`. Errors: `400`, `403` ("Client markings cannot be changed"), `404`.

### `DELETE /api/internal/qc/markings/:id` (access 3)

Deletes a Leemac marking and its photos. Response `200`: `{ "ok": true }`. Errors: `403` (client marking), `404`.

### `POST /api/internal/qc/markings/:id/photos` (access 3)

Multipart form: `photo` (file: JPEG, PNG or WebP, at most 3 MB), `job_id`, and optional `value` (at most 64 characters) and `caption` (at most 255). Response `201`: `{ "id": 5 }`. The photo goes last in its marking's order.

Errors: `400` (no or wrong-type photo, bad text, the job does not hold the part, or on a client marking the job is not that company's), `404` (marking), `413` (over 3 MB).

### `PUT /api/internal/qc/markings/:id/photos/order` (access 3)

Body: `{ "ids": [5, 4, 6] }`, every photo id of the marking exactly once, in the new order. Response `200`: `{ "ok": true }`. `400` otherwise.

### `PUT /api/internal/qc/photos/:id` (access 3)

Body: `{ "value": "...", "caption": "..." }`; an absent field is cleared. Response `200`: `{ "ok": true }`. Errors: `400`, `404`.

### `DELETE /api/internal/qc/photos/:id` (access 3)

Response `200`: `{ "ok": true }`. `404` if unknown.

### `GET /api/internal/qc/photos/:id` (access 2)

Response `200`: the image bytes with the stored `Content-Type`. `404` if unknown.

### `GET /api/internal/qc/requests` (access 2)

Pings as a list: `{ id, company_id, company_name, contact, part_id, part_number, pinged_at, ping_count, newest_job_id, newest_job_number, marking_count, photo_count, status, closed_at }`. Open requests first, newest ping first, then answered and dismissed ones closed in the last 30 days, newest closed first.

### `PUT /api/internal/qc/requests/:id/dismiss` (access 3)

Response `200`: `{ "ok": true }`. `404` if unknown.

## Rules

- Client markings belong to the company and are seen only by that company. Clients change or delete only their own.
- Leemac markings are shown to every company that has the part. Clients cannot change them; admins cannot change client markings.
- Photos are shown only to the company of the photo's job. A Leemac marking can carry photos for several companies' jobs; each company sees only its own.
- Clear takes the photos with it: the markings removed and their photos go together. Deleting one marking does the same.
- A ping is one row per part and company. Pinging again raises `ping_count`, refreshes the time and name, and reopens a dismissed ping.
- A ping is `answered` once every one of the company's markings on the part has a photo uploaded since the ping. Until then it is `open`.
- A ping is `dismissed` when an admin dismisses it, which wins over answered. A ping whose markings were all deleted stays open until dismissed.
- The admin badge counts open pings.
