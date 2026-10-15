# Dependency maintenance, 2026-10

Date: 2026-10-15

Commands run in the repo root (never in `src/client`, no `--force`):

    npm audit --omit=dev
    npm audit fix

Before: 17 vulnerabilities (8 moderate, 8 high, 1 critical). After: 5 moderate.
`package.json` ranges were not edited; only `package-lock.json` changed. Express stays on 4, multer on 1, googleapis on 148 (guarded by `test/package.test.js`). `npm test` passes.

## Packages bumped

| Package | Old | New |
| --- | --- | --- |
| aws-sdk | 2.1692.0 | 2.1693.0 |
| axios | 1.12.2 | 1.20.0 |
| body-parser | 1.20.3 | 1.20.8 |
| express | 4.21.2 | 4.22.3 |
| follow-redirects | 1.15.9 | 1.16.1 |
| form-data | 4.0.4 | 4.0.6 |
| hasown | 2.0.2 | 2.0.4 |
| ip-address | 10.2.0 | 10.7.4 |
| jwa | 1.4.1 | 1.4.2 |
| jwa (google-auth-library, gtoken) | 2.0.0 | 2.0.1 |
| jws | 3.2.2 | 3.2.3 |
| jws (google-auth-library, gtoken) | 4.0.0 | 4.0.1 |
| lodash | 4.17.21 | 4.18.1 |
| long | 5.2.3 | 5.3.2 |
| lru.min | 1.1.1 | 1.1.5 |
| mysql2 | 3.11.3 | 3.24.6 |
| iconv-lite (mysql2) | 0.6.3 | 0.7.3 |
| named-placeholders | 1.1.3 | 1.1.6 |
| object-inspect | 1.13.2 | 1.13.4 |
| path-to-regexp | 0.1.12 | 0.1.13 |
| proxy-addr | 2.0.7 | 2.0.8 |
| proxy-from-env | 1.1.0 | 2.1.0 |
| qs | 6.13.0 | 6.16.1 |
| raw-body | 2.5.2 | 2.5.3 |
| shell-quote | 1.8.1 | 1.12.0 |
| side-channel | 1.0.6 | 1.1.1 |

Newly added transitive packages: @types/node 26.6.5, undici-types 8.9.0, sql-escaper 1.5.2, side-channel-list 1.0.1, side-channel-map 1.0.1, side-channel-weakmap 1.0.2, http-errors 2.0.1 and statuses 2.0.2 (under body-parser and raw-body), agent-base 6.0.2, debug 4.4.3, https-proxy-agent 5.0.1 and ms 2.1.3 (under axios).

## Findings left

| Package | Severity | Advisory | Major upgrade that would fix it |
| --- | --- | --- | --- |
| uuid (<11.1.1) | moderate | GHSA-w5hq-g745-h8pq | Newer uuid pulled in by aws-sdk v2 (migrate to AWS SDK v3) and by gaxios/googleapis-common (needs a googleapis major above 149) |
| aws-sdk (>=2.0.1) | moderate | GHSA-j965-2qgj-vjmq | Migrate to AWS SDK v3. `npm audit fix --force` offers aws-sdk@1.18.0, a downgrade, so it was not used |
| gaxios (6.4.0 - 6.7.1) | moderate | via uuid | googleapis major above 149 |
| googleapis-common (<=7.2.0) | moderate | via uuid | googleapis major above 149 |
| googleapis (33.0.0 - 149.0.0) | moderate | via googleapis-common | googleapis major above 149 (currently 148) |
