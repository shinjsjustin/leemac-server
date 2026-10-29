# Tests

Run the server tests with `npm test` (node:test) from the repo root.
Run the client tests with `cd src/client && CI=true npm test` (Jest).

## Keep

- Server rule and route tests: behaviour through `src/app` or a mounted router (see `test/internal/accessLevels.test.js`, `test/bourne/writeMount.test.js`). Stub with `node:test` `mock.method`.
- Contract tests (below).
- React tests of state, rules or payloads.
- `test/db`: SQL tests for the migrations and schema.
- Route output vs file: `test/bourne/router.test.js` checks the route output against the docs file.
- `test/repoHygiene.test.js`: checks the file list.

## Don't write

- Tests that read `src`, CSS or docs text for words or selectors.
- React tests that only check markup or class names.

Write the test first for server rules and route contracts.

## Screens

Screens are checked by screenshot, not by Jest.

## Contracts

One JSON fixture per `src/client/src/api` module, in `src/client/src/api/contracts`.
The Jest api test proves the module sends the fixture. A node route test sends the same fixture to the real route with the db stubbed.
`test/job/exportContract.test.js` came first.

## Server rules

- Company scoping: `test/portal/*Isolation.test.js`
- Notes privacy: `test/portal/notesRouter.test.js`, `test/portal/notesSpoof.test.js`
- Shared schedule: `test/portal/scheduleIsolation.test.js`
- Stars: `test/job/starStatusRoutes.test.js`, `test/lib/starHistory.test.js`
- Finish: `test/job/stageRoutes.test.js`
- Mark paid: `test/internal/markPaidRoute.test.js`
- Admin gates: `test/internal/accessLevels.test.js`
- Export types: `test/job/exportRoute.test.js`
