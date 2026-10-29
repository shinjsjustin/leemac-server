# Quote requests

Clients submit quote requests in the portal. Staff review them, check matches against existing parts, and create a job.

## Client API

`/api/portal-requests`, for signed-in clients only. Routes: list and create a request, get, update and submit one, upload files to a request or to a line, and delete a file.

- Uploads: 20 MB a file, 10 files per upload, 60 files per request. Allowed types: pdf, step, stp, igs, iges, dxf, dwg, x_t, sldprt, png, jpg, jpeg.
- Writes (non-GET): 60 writes per 15 minutes per client.
- A request has at most 200 lines.

Submitting emails the address in `QUOTE_REQUEST_EMAIL`.

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

Set `QUOTE_REQUEST_EMAIL` in the server environment. Apply `src/db/migrations/012_quote_requests.sql` by hand to the production database before you deploy the server; nothing applies it on deploy. Bourne endpoints are in `docs/bourne-api.md`.
