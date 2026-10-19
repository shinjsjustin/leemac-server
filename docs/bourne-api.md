# Bourne API

HTTP API for the Bourne agent to read LEEMAC data, plus a separate write API (see Write API below).

## Endpoints

Paths are relative to `/api/bourne`.

- `GET /docs`: this document.
- `GET /starred`: starred jobs.
- `GET /jobs`: list jobs.
- `GET /jobs/:id`: one job with its detail.
- `GET /parts`: search parts.
- `GET /parts/:id`: one part with its detail.
- `GET /jobs/:id/emails`: emails linked to one job.
- `GET /parts/:id/emails`: emails linked to one part.
- `GET /files/:id`: raw bytes of one file.
- `GET /finances`: finances overview.
- `GET /finances/periods/:id`: detail for one finance period.

## Base URL

`/api/bourne`

## Authentication

Send the shared secret in the `X-Bourne-Key` header. The server compares it to the `BOURNE_READ_KEY` environment variable. JWTs are not accepted here, and the Bourne key is not accepted on `/api/internal` or `/api/jarvis`.

## Methods

GET (and HEAD) only. Every other method returns 405.

## Rate limit

120 requests per minute per client IP. Exceeding it returns 429.

## Status codes

- 401: missing or wrong `X-Bourne-Key`.
- 405: method other than GET or HEAD.
- 429: rate limit exceeded.
- 503: `BOURNE_READ_KEY` is not configured on the server.
- 404: unknown path (JSON `{ "error": ... }`).

## Paging

List endpoints accept `limit` and `offset` and return:

```json
{ "total": 0, "limit": 50, "offset": 0, "hasMore": false }
```

alongside the result rows.

## GET /starred

Every starred part, in any status (open, done, delivered, invoiced, ...), grouped by job. Not paged. File entries are metadata only; file content is never returned.

Example response:

```json
{
  "jobs": [
    {
      "job_id": 1,
      "job_number": "J-1",
      "client": "Acme",
      "attention": "Bob",
      "po_number": "PO1",
      "po_date": "2026-01-01",
      "due_date": "2026-02-01",
      "ship_date": null,
      "created_at": "2026-01-01T00:00:00Z",
      "invoice_number": "INV1",
      "invoice_date": null,
      "invoice_status": "waiting",
      "notes": [
        {
          "id": 7,
          "content": "call client",
          "status": "new",
          "created_at": "2026-01-02T00:00:00Z",
          "author": "Sam",
          "files": [
            { "id": 51, "filename": "n.png", "mimetype": "image/png", "size": 9, "uploaded_at": "2026-01-04T00:00:00Z" }
          ]
        }
      ],
      "parts": [
        {
          "job_part_id": 10,
          "part_id": 100,
          "number": "P-100",
          "description": "Bracket",
          "quantity": 5,
          "price": 20,
          "rev": "A",
          "details": "anodize",
          "note": "rush",
          "star": { "status": "done", "attention": "Bob", "nfc_tag_id": "nfc1" },
          "files": [
            { "id": 50, "filename": "a.pdf", "mimetype": "application/pdf", "size": 123, "uploaded_at": "2026-01-03T00:00:00Z" }
          ]
        }
      ]
    }
  ]
}
```

## GET /jobs

Paged index of jobs, newest first (`created_at` descending, then job id descending). Returns `{ jobs, pagination }` where `pagination` is `{ total, limit, offset, hasMore }`.

Query params (all optional):

- `since`: `YYYY-MM-DD`. Only jobs with `created_at` on or after this date.
- `client`: substring match on company name or attention.
- `from`, `to`: non-negative integers. Inclusive range on the numeric value of `job_number`.
- `limit`: integer, default 50, clamped to 1..200.
- `offset`: non-negative integer, default 0.

A malformed `since`, `from`, `to`, `limit` or `offset` returns 400 `{ "error": ... }`.

Example response:

```json
{
  "jobs": [
    {
      "id": 2,
      "job_number": "102",
      "client": "Acme",
      "attention": "Bob",
      "po_number": "PO1",
      "po_date": "2026-01-01",
      "due_date": "2026-02-01",
      "created_at": "2026-01-01T00:00:00Z",
      "invoice_number": "INV1",
      "invoice_status": "waiting"
    }
  ],
  "pagination": { "total": 120, "limit": 50, "offset": 0, "hasMore": true }
}
```

## GET /jobs/:id

One job in full. `id` must be a non-negative integer, otherwise 400 `{ "error": ... }`; an unknown id returns 404 `{ "error": ... }`.

Returns `{ job }` with the job fields, `client` (company name), totals (`subtotal`, `tax`, `tax_percent`, `total_cost`), and:

- `parts`: every part on the job. `star` is `{ status, attention, nfc_tag_id }`, or `null` when the part is not starred.
- `notes`: with `author` (admin name only).
- `expenses`: expenses linked to the job.
- `files` on parts and notes are metadata only (no content).

Example response:

```json
{
  "job": {
    "id": 3,
    "job_number": "103",
    "client": "Acme",
    "attention": "Bob",
    "po_number": "PO1",
    "po_date": "2026-01-01",
    "due_date": "2026-02-01",
    "ship_date": null,
    "created_at": "2026-01-01T00:00:00Z",
    "invoice_number": "INV1",
    "invoice_date": null,
    "invoice_status": "waiting",
    "subtotal": 100,
    "tax": "8.00",
    "tax_percent": "8.00",
    "total_cost": 108,
    "parts": [
      {
        "job_part_id": 10,
        "part_id": 100,
        "number": "P-100",
        "description": "Bracket",
        "quantity": 5,
        "price": 20,
        "rev": "A",
        "details": "anodize",
        "note": "rush",
        "star": { "status": "done", "attention": "Bob", "nfc_tag_id": "nfc1" },
        "files": [{ "id": 50, "filename": "a.pdf", "mimetype": "application/pdf", "size": 123, "uploaded_at": "2026-01-03T00:00:00Z" }]
      }
    ],
    "notes": [
      {
        "id": 7,
        "content": "call client",
        "status": "new",
        "created_at": "2026-01-02T00:00:00Z",
        "author": "Sam",
        "files": []
      }
    ],
    "expenses": [
      { "id": 4, "description": "Anodizing", "vendor": "AnoCo", "amount": "55.00", "expense_date": "2026-01-10", "category": "outside" }
    ]
  }
}
```

## GET /parts

Searches parts. All filters are optional and combined with AND; each is a substring (`LIKE`) match.

| Param | Matches |
| --- | --- |
| `q` | part number or description |
| `number` | part number |
| `description` | part description |
| `limit`, `offset` | see Paging |

Parts are ordered by number, then id. A bad `limit` or `offset` returns 400.

```json
{
  "parts": [{ "id": 100, "number": "P-100", "description": "Bracket" }],
  "pagination": { "total": 1, "limit": 50, "offset": 0, "hasMore": false }
}
```

## GET /parts/:id

Returns one part with every job that used it (newest job first) and its file metadata. A non-integer `id` returns 400; an unknown id returns 404.

```json
{
  "part": {
    "id": 100,
    "number": "P-100",
    "description": "Bracket",
    "jobs": [
      {
        "job_id": 9,
        "job_number": "109",
        "client": "Acme",
        "po_number": "PO1",
        "po_date": "2026-01-01",
        "due_date": "2026-02-01",
        "created_at": "2026-01-01T00:00:00Z",
        "invoice_status": "waiting",
        "job_part_id": 10,
        "quantity": 5,
        "price": 20,
        "rev": "A",
        "details": "anodize",
        "star_status": null
      }
    ],
    "files": [{ "id": 50, "filename": "a.pdf", "mimetype": "application/pdf", "size": 123, "uploaded_at": "2026-01-03T00:00:00Z" }]
  }
}
```

`star_status` is `null` when the job part is not starred. File content is never returned.

## GET /jobs/:id/emails

Returns the emails linked to one job, newest `date` first. Each entry is a pointer to an email, not its content. A non-integer `id` returns 400 and an unknown job returns 404, both as `{ "error": "..." }`.

```json
{
  "emails": [
    {
      "id": 5,
      "message_id": "abc123@mail.example.com",
      "subject": "PO attached",
      "from": "bob@acme.com",
      "date": "2026-01-05T14:30:00.000Z",
      "created_by": "bourne"
    }
  ]
}
```

## GET /parts/:id/emails

Returns the emails linked to one part, in the same shape and order as `GET /jobs/:id/emails`. A non-integer `id` returns 400 and an unknown part returns 404, both as `{ "error": "..." }`.

```json
{
  "emails": [
    {
      "id": 6,
      "message_id": "def456@mail.example.com",
      "subject": "Drawing revision",
      "from": "bob@acme.com",
      "date": "2026-01-06T09:00:00.000Z",
      "created_by": "bourne"
    }
  ]
}
```

## GET /files/:id

Returns the raw bytes of one stored file, such as a drawing. Use the file ids listed by the other endpoints.

The body is the stored content unchanged, not JSON or base64. `Content-Type` is the stored mimetype (`application/octet-stream` when none), `Content-Length` is the byte length, and `Content-Disposition` is `inline; filename="<name>"` with quotes, backslashes and control characters removed from the name.

A non-integer `id` returns `400` and an unknown `id` returns `404`, both as `{ "error": "..." }`.

## GET /finances

Returns what the Finances page shows: the current period, invoice totals and every financial period with its summary.

Response:

```json
{
  "current_period_id": "2",
  "invoices": {
    "waiting": { "count": 3, "total_amount": 300.5 },
    "paid": { "count": 5, "total_amount": 900 }
  },
  "periods": [
    {
      "id": 2, "label": "Q2 2026", "quarter": 2, "year": 2026,
      "start_date": "2026-04-01", "end_date": "2026-06-30",
      "summary": {
        "waiting": { "count": 2, "total_amount": 100.25 },
        "paid": { "count": 1, "total_amount": 50 },
        "combined": { "count": 3, "total_amount": 150.25 },
        "expenses": { "count": 4, "total_amount": 75.5 }
      }
    }
  ]
}
```

`current_period_id` is `null` when no current period is set. `invoices` counts jobs that have an invoice number. `periods` are newest first (year, then quarter). An expense linked to a period through both a job and the period itself is counted once.

## GET /finances/periods/:id

Returns one financial period with its summary, jobs and expenses.

Response:

```json
{
  "period": { "id": 1, "label": "Q1 2026", "quarter": 1, "year": 2026, "start_date": "2026-01-01", "end_date": "2026-03-31" },
  "summary": {
    "waiting": { "count": 1, "total_amount": 100.5 },
    "paid": { "count": 1, "total_amount": 200 },
    "combined": { "count": 2, "total_amount": 300.5 },
    "expenses": { "count": 2, "total_amount": 30.25 }
  },
  "jobs": [
    { "id": 9, "job_number": "109", "client": "Acme", "po_number": "PO1", "invoice_number": "INV1", "invoice_date": "2026-02-01", "invoice_status": "waiting", "total_cost": "100.50" }
  ],
  "expenses": [
    { "id": 3, "description": "Tooling", "vendor": "Acme Tools", "amount": "10.25", "expense_date": "2026-02-03", "category": "tools" }
  ]
}
```

`jobs` are the jobs assigned to the period, newest invoice first. `expenses` are linked through those jobs or directly to the period. A non-integer `id` returns `400` and an unknown `id` returns `404`, both as `{ "error": "..." }`.

## Write API

Base URL: `/api/bourne/write`

Authentication: send the shared secret in the `X-Bourne-Key` header. The server compares it to the `BOURNE_WRITE_KEY` environment variable. The read key (`BOURNE_READ_KEY`) never works here. If `BOURNE_WRITE_KEY` is unset, or equal to `BOURNE_READ_KEY`, every request returns 503.

Methods: POST only. Any other method returns 405 with an `Allow: POST` header.

Rate limit: 30 requests per minute per client IP. Exceeding it returns 429. The limit is applied before the key check, so requests with a bad key count too.

Status codes:

- 400: invalid body, form data or file type.
- 401: missing or wrong `X-Bourne-Key`.
- 404: unknown path, or the job or part in `:id` does not exist.
- 405: method other than POST.
- 413: an uploaded file is over 20 MB.
- 429: rate limit exceeded.
- 500: unexpected server error.
- 502, 503: quote export failures (see the export-quote route).

Errors are JSON `{ "error": "..." }`.

Audit log: every request to this base URL, including rejected ones, is recorded in the `bourne_write_log` table with the actor, method, path, status, whether it was accepted, the client IP and a JSON summary of the request body (at most 4000 characters, shortened to a wrapper with a preview when longer). Uploaded files are logged by filename, mimetype and size only, never content. A failed audit insert is logged on the server and does not change the response.

### POST /jobs/quote

Creates a job from a list of parts and allocates the next job number. Send a JSON body:

- `company_id`: required.
- `attention`: optional string.
- `parts`: required non-empty array. Each part has `part_number` (required), `quantity` (integer, 1 or more, required), and optional `description`, `price` (defaults to 1), `rev`, `material`, `finish`, `stock_size`.

`details` on each job part is built from `material` then `finish`, each prefixed with `*`. Parts that do not exist yet are created by part number. The job, its number and its parts are written in one transaction.

Example response (201):

```json
{ "id": 12, "job_number": "1043", "job_part_ids": [31, 32] }
```

Errors: 400 for a missing `company_id`, an empty or missing `parts`, a part without `part_number`, a bad quantity or a bad price.

### POST /jobs/:id/files

Attaches files to an existing job. Send `multipart/form-data` with one or more `files` fields.

Limits: 20 MB per file and 10 files per request. Allowed extensions: .pdf, .png, .jpg, .jpeg, .gif, .step, .stp, .igs, .iges, .dxf, .dwg, .x_t, .sldprt, .xlsx, .xls, .docx, .doc, .txt, .csv.

Example response (201):

```json
{ "ids": [60, 61] }
```

Errors: 404 for an unknown job, 400 when no file is sent, a file type is not allowed or the file count is exceeded, 413 when a file is over 20 MB.

### POST /parts/:id/files

Attaches files to an existing part so they show on the part details page and in `GET /parts/:id`. Send `multipart/form-data` with one or more `files` fields. Every file is saved.

Limits and allowed extensions are the same as for job files: 20 MB per file and 10 files per request; .pdf, .png, .jpg, .jpeg, .gif, .step, .stp, .igs, .iges, .dxf, .dwg, .x_t, .sldprt, .xlsx, .xls, .docx, .doc, .txt, .csv. A missing or `application/octet-stream` mimetype is set from the file extension.

Example response (201):

```json
{ "ids": [70, 71] }
```

Errors: 404 for an unknown part, 400 when no file is sent, a file type is not allowed or the file count is exceeded, 413 when a file is over 20 MB.

### POST /jobs/:id/po

Updates the purchase order fields of an existing job. Send a JSON body with any of these fields; only the fields present are changed and at least one is required:

- `po_number`: string, 1 to 50 characters after trimming (stored trimmed).
- `po_date`, `due_date`: `YYYY-MM-DD` or `null`.
- `tax_code`: `0` or `1`.
- `tax`, `tax_percent`: numbers, 0 or more.

Example response (200):

```json
{ "id": "12" }
```

Errors: 404 for an unknown job, 400 for an invalid field or when no PO field is sent.

### POST /jobs/:id/export-quote

Writes the job's quote into the Google quote sheet and then calls the Google Apps Script at `GSCRIPT_URL` with `{ "action": "exportQuote" }`. No request body is needed.

Example response (200):

```json
{ "id": "12", "action": "exportQuote", "parts": 2 }
```

Errors: 404 for an unknown job, 503 when `GSCRIPT_URL` is not set or the quote sheet is not found, 502 when the script call fails.

Job parts are addressed by `job_part_id`, the `id` of each entry in the job's parts from `GET /jobs/:id`, not by part id. To find a job id from its number, use `GET /jobs?from=N&to=N`.

### POST /jobs/:id/parts

Adds a part to an existing job. Send a JSON body:

- `part_id`: an existing part, or `part_number`: a part number (the part is created when new). One of the two is required.
- `quantity`: integer, 1 or more, required.
- Optional `description`, `price` (defaults to 1), `rev`, `material`, `finish`, `stock_size`.

`details` is built from `material` then `finish`, each prefixed with `*`.

Example response (201):

```json
{ "job_part_id": 33, "part_id": 18 }
```

Errors: 404 for an unknown job or `part_id`, 400 for neither `part_id` nor `part_number`, a bad quantity or a bad price.

### POST /jobs/:id/parts/:jobPartId

Updates a job part of this job. Send a JSON body with any of `quantity`, `price`, `rev`, `details`, `note`, `material`, `finish`, `stock_size`; only the fields present are changed and at least one is required. Empty text is stored as `null`.

Example response (200):

```json
{ "id": "33" }
```

Errors: 404 for an unknown job or a job part not on this job, 400 for a bad quantity, a bad price, a non-numeric `jobPartId` or when no field is sent.

### POST /jobs/:id/parts/:jobPartId/remove

Removes a job part from the job. No request body is needed. Removal deletes the part's star too, but keeps the part and its files. It is refused with 409 when the job has an invoice number.

Example response (200):

```json
{ "id": "33" }
```

Errors: 404 for an unknown job or a job part not on this job, 409 for a job with an invoice number, 400 for a non-numeric `jobPartId`.

### POST /jobs/:id/parts/:jobPartId/star

Stars a job part. Send an optional JSON body:

- `status`: one of the star statuses (`open`, `urgent`, `waiting`, `done`, `quoted`, `checking_stock`, `waiting_material`, `at_subvendor`, and the others the app allows); defaults to `open`.
- `attention`: optional string. When omitted it defaults to the job's attention, then to the company name.

A part that is already starred is left unchanged.

Example response (201 when the star is created, 200 when it already existed):

```json
{ "starred": true, "created": true }
```

Errors: 404 for an unknown job or a job part not on this job, 400 for an invalid `status` or a non-numeric `jobPartId`.

### POST /jobs/:id/parts/:jobPartId/unstar

Removes the star from a job part. No request body is needed. Unstarring a part that is not starred succeeds.

Example response (200):

```json
{ "starred": false }
```

Errors: 404 for an unknown job or a job part not on this job, 400 for a non-numeric `jobPartId`.

### POST /jobs/:id/details

Updates job fields. Send a JSON body with any of these; only the fields present are changed and at least one is required:

- `attention`: string of at most 100 characters; an empty string clears it.
- `company_id`: positive integer.
- `due_date`, `ship_date`: `YYYY-MM-DD` or `null`.

Example response (200):

```json
{ "id": "12" }
```

Errors: 404 for an unknown job, 400 for an invalid field or when no field is sent.

### POST /jobs/:id/notes

Adds a note to the job. Send a JSON body with `content`, 1 to 255 characters after trimming. Notes are authored by Bourne, so they show author Bourne in the app and in `GET /jobs/:id`. Notes cannot be edited or deleted through the API.

Example response (201):

```json
{ "id": 88 }
```

Errors: 404 for an unknown job, 400 for missing, empty or over-long `content`, 503 when migration 007 has not been applied.

### POST /parts/:id/details

Updates a part. Send a JSON body with `number` (non-empty string, unique across parts) and/or `description` (string); at least one is required.

Example response (200):

```json
{ "id": "18" }
```

Errors: 404 for an unknown part, 409 when the number is already used by another part, 400 for an invalid field or when no field is sent.

### POST /jobs/:id/drawings

Adds a part to a job from its drawing. Send `multipart/form-data` with these files:

- `drawing`: one PDF, required.
- `step`: one `.step` or `.stp` file, optional.

and these text fields:

- `part_number`: required.
- `title`: the part description, used only when the part is new.
- `rev`, `material`, `finish`, `stock_size`: optional.
- `quantity`: integer, 1 or more; defaults to 1.
- `price`: defaults to 1.

An existing part number reuses that part, links it to the job and attaches the files, but doesn't change its description (`part_created` is false). Resending a drawing attaches another copy.

Example response (201):

```json
{ "job_part_id": 34, "part_id": 19, "part_created": true, "file_ids": [51, 52] }
```

Errors: 404 for an unknown job, 400 for a missing or bad field or file (no `part_number`, no `drawing`, a drawing that is not a PDF, a step file that is not `.step` or `.stp`), 413 for a file over 20 MB.

### POST /emails

Links emails to jobs or parts. Approval happens outside leemac, before Bourne calls this. Send a JSON body `{ "links": [...] }` with 1 to 500 links. Each link has:

- `job_id` or `part_id`: exactly one, a positive integer.
- `message_id`: the email's Message-ID; angle brackets are optional.
- `subject`, `from`: optional text, cut to 255 characters.
- `date`: when the email was sent, ISO 8601.

Only a pointer is stored (message id, subject, sender and date), never the body or attachments. A link already present for the same job or part and `message_id` counts as existing and is not duplicated, so resending a link is safe.

Example response (201):

```json
{ "created": 1, "existing": 1, "ids": [5, 2] }
```

`ids` has one entry per link, in order.

Errors: 400 for a `links` that is not an array of 1 to 500 items or a bad link (the message names its index, such as `links[2]`), 404 for an unknown job or part, in which case nothing is saved.

## Deployment

Do these in order. The migrations are manual production steps; nothing applies them on deploy.

1. Apply `src/db/migrations/005_prices_part_fields_job_files.sql` to the production database.
2. Apply `src/db/migrations/006_bourne_write_log.sql` to the production database, after 005.
3. Apply `src/db/migrations/007_bourne_note_author.sql` to the production database, after 006. It adds the Bourne note author.
4. Set `BOURNE_WRITE_KEY` (it must differ from `BOURNE_READ_KEY`) and `GSCRIPT_URL` in the server environment.
5. Deploy the server.
