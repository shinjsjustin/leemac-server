# Bourne API

Read-only HTTP API for the Bourne agent to read LEEMAC data.

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

## GET /files/:id

Returns the raw bytes of one stored file, such as a drawing. Use the file ids listed by the other endpoints.

The body is the stored content unchanged, not JSON or base64. `Content-Type` is the stored mimetype (`application/octet-stream` when none), `Content-Length` is the byte length, and `Content-Disposition` is `inline; filename="<name>"` with quotes, backslashes and control characters removed from the name.

A non-integer `id` returns `400` and an unknown `id` returns `404`, both as `{ "error": "..." }`.
