# Deploy login security

## Before you deploy

1. First dry-run `src/db/migrations/010_login_security.sql` on a copy of the production database. Fix anything it reports.
2. Run `src/db/migrations/010_login_security.sql` on production.
3. Then deploy and restart the server.

Everyone is logged out at deploy, so every admin and client must log in again.

## Environment variables

- `JWT_SECRET`: signs login tokens.
- `SESSION_SECRET`: signs session cookies.
- `CLIENT_URL`: base URL of the client app, used in links inside emails.
- `AWS_REGION`: the SES region mail is sent from.
- `AWS_ACCESS_KEY_ID`: AWS key ID of the user allowed to send through SES.
- `AWS_SECRET_ACCESS_KEY`: the secret for that key.
- `MAIL_FROM`: the sender address, on the verified domain.
- `TOTP_ENCRYPTION_KEY`: encrypts 2FA secrets. It is 32 random bytes as 64 hex characters. Generate it with `openssl rand -hex 32`.

## Amazon SES

1. Verify the domain leemac.co in SES.
2. Add the three Easy DKIM CNAME records SES shows you to the DNS for leemac.co.
3. Add an SPF TXT record: `v=spf1 include:amazonses.com ~all`.
4. Add a DMARC TXT record at `_dmarc` with `p=none`. After a clean week, change it to `p=quarantine`.
5. Request SES production access so mail reaches any inbox, not only verified addresses.

## Packages

Before the 2FA phase, run `npm install otpauth qrcode` on branch idea-0007.

## After deploy

- Admins verify their email from the credentials page.
- Level-3 admins use Force logout and Reset 2FA on an admin's page.
