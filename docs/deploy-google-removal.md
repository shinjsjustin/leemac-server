# Deploy: Google removal (IDEA-0055)

This deploy removes Google sign-in, Gmail, the old Export (Apps Script), Populate Google Sheet and Drive from the site. `print.py` on Justin's Mac is untouched.

## Before deploy

1. **Bourne invoice sweep.** Bourne confirms the Friday invoice sweep reads `GET /api/bourne/invoices/:number/pdf`, not the removed `POST /api/bourne/write/jobs/:id/export` or `POST /api/bourne/write/jobs/:id/export-quote`. Those addresses now return 404.
2. **Passwordless admins.** Google sign-in is gone, so an admin with no password can't log in. Find them:

   ```sql
   SELECT id, email FROM admin WHERE disabled = 0 AND (password IS NULL OR password = '');
   ```

   Have each admin found use **Forgot password** on the login page to set one.

## Deploy

No migration is needed. The stored Google tokens and the admin table's Google columns stay as they are. Deploy the server, then the client.

## Env vars you can remove later

The server no longer reads these. Remove them from the server environment once the deploy is settled:

- `GSCRIPT_URL`
- `CLIENT_ID`
- `CLIENT_SECRET`
- `REDIRECT_URL`
- `JARVIS_GOOGLE_REDIRECT_URL`
