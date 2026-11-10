# leemac-server

Complements `~/.claude/CLAUDE.md`. Node 23 or newer.

## Layout
- Express server: `src/server.js`, `src/app.js`, `src/routes`, `src/lib`, `src/middleware`.
- React app: `src/client`. Its Jest tests sit beside the files they test.
- Server tests: `test/`, run with `node --test`.
- Database: `src/db/schema.sql` and `src/db/migrations/NNN_name.sql` (next number after the highest).

## Commands (run from the repo root)
- Install root: `npm install`
- Install client: `npm install --prefix src/client`
- Server tests: `npm test`
- Client tests: `CI=true npm --prefix src/client test -- --watchAll=false`
- Client build: `npm --prefix src/client run build`
- Local migration (manual; loads `.env`, never run it on production from here):
  `set -a; . ./.env; set +a; MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" < src/db/migrations/NNN_name.sql`

Plan checks:
- test: `node --test 'test/**/*.test.js'; n=$?; CI=true npm --prefix src/client test -- --watchAll=false && test $n -eq 0`
- lint: `find src test -path src/client -prune -o -name '*.js' -print | xargs -n1 node --check`
- typecheck: `true`
- build: `npm --prefix src/client run build`

## Deploy
Bourne deploys through the Central Bridge, never from the repo.

## House rules
- Commits: `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).
- Migrations are append-only: add a new numbered file, never edit an existing one. Back up the production DB before running one.
- Admin writes in `src/routes/internal.js` need `WRITE_LEVEL` 3; levels 1 and 2 may make only `LOW_LEVEL_WRITES`.
- `references/` is git-excluded (`.git/info/exclude`); never commit it.
- No secrets in code or commits. Config comes from `.env` (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and more).
- Portal design questions go to Bourne.
