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
{ "total": 0, "limit": 20, "offset": 0, "hasMore": false }
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
