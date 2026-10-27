# Deploy trusted browser

## Before you deploy

1. Confirm `src/db/migrations/010_login_security.sql` is already applied.
2. First dry-run `src/db/migrations/011_trusted_device.sql` on a copy of the production database. Fix anything it reports.
3. Run `src/db/migrations/011_trusted_device.sql` on production.
4. Then deploy branch idea-0014 and restart the server.

Without the migration, every 2FA login with the box ticked fails.

Deploying waits for Justin's explicit yes.

## After deploy

- After entering a code, admins can tick "Trust this browser for 30 days" to skip the code on that browser.
- Each login from a trusted browser restarts the 30 days.
- Google sign-in skips the code too on a trusted browser.
- Admins revoke their trusted browsers on their account page.
- Level-3 admins revoke another admin's browsers on that admin's details page.
- Reset 2FA, password reset and password change wipe all of that admin's trusted browsers.
