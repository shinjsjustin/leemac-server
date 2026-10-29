# Quote requests

Clients submit quote requests in the portal. Staff review them, check matches against existing parts, and create a job.

## Client API

`/api/portal-requests`, for signed-in clients only. Routes: list and create a request, get, update and submit one, upload files to a request or to a line, and delete a file.

- Uploads: 20 MB a file, 10 files per upload, 60 files per request. Allowed types: pdf, step, stp, igs, iges, dxf, dwg, x_t, sldprt, png, jpg, jpeg.
- Writes (non-GET): 60 writes per 15 minutes per client.
- A request has at most 200 lines.

Submitting emails the address in `QUOTE_REQUEST_EMAIL`.

## Part lists

`/api/portal-lists`, for signed-in clients only. Lists are shared by the whole company; company-only access means the company always comes from the token. Routes:

- `GET /`: the company's lists.
- `POST /`: create a list.
- `PUT /:id`: rename a list.
- `DELETE /:id`: delete a list.
- `POST /:id/parts`: add parts to a list.
- `POST /:id/parts/remove`: remove parts from a list.
- `GET /:id/request-lines`: prefilled request lines for the list, with drawings.
- `POST /:id/request`: create a request from the list. 400 when no quantity is given, 409 when the list is stale, 404 when the list is gone.

Limits: names are 1-100 characters, 100 lists per company, 200 parts per list. Going over a cap returns 409. Writes are limited by `portalListWriteLimiter` to 120 writes per 15 minutes.

A request made from a list is inserted as `sent`, with no draft step. Its lines carry `source_part_id`, the part they came from.

- Drawings: lines show the source part's drawings by reference, so no files are copied. Clients download them with `downloadFile` and admins with `fetchAdminDrawingUrl`.
- Edited numbers: when the client changes a line's part number, the admin review shows a warning, with `source_part_number` as the original.
- Job creation: the job uses the original part (`source_part_id`), not a match for the edited number.
- Removing lines: admins can remove a line with `DELETE /api/internal/quote-requests/:id/lines/:lineId`. It returns the updated review, or 409 once the request is `job_created`.

## Client pages

- `/client-requests`: the client's requests.
- `/client-request/new`: start a request.
- `/client-request/:id`: edit a draft or view a submitted request.

## Admin API

`/api/internal/quote-requests`, admin access level 2 required. Responses are not cached.

- `GET /`: inbox of submitted requests.
- `GET /:id`: review with lines, prices, files and `bourne_suggestion`.
- `PUT /:id`: save the review.
- `GET /:id/check`: matches against existing parts.
- `POST /:id/job`: create the job (201, `{ id, job_number }`).
- `GET /:id/files/:fileId`: one file's bytes.

## Admin pages

- `/quote-requests`: the inbox, shown in the navbar at level 2.
- `/quote-request/:id`: the priced review grid with Bourne hints, Check, and create job.

## Job creation

Creating a job from a reviewed request sets the request to `job_created` and links it to the job. After that Bourne suggestions return 409.

## Deployment

Set `QUOTE_REQUEST_EMAIL` in the server environment. Apply `src/db/migrations/012_quote_requests.sql` by hand to the production database before you deploy the server; nothing applies it on deploy. Then apply `src/db/migrations/013_part_lists.sql` the same way, after 012 and before you deploy. Dry-run it first on a copy of the production database. Bourne endpoints are in `docs/bourne-api.md`.
