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
