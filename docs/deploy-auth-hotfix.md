# Deploy: auth hotfix

1. Back up the database.
2. Run `src/db/migrations/009_auth_hotfix.sql` before deploying the server. Admin login reads `admin.disabled` and fails without it.
3. Check that Foster and Santiago each have a `clients` row and their admin rows are disabled. If a client row is missing, register them by hand from Client Register as a level-3 admin.
4. Build the client (`npm run build --prefix src/client`), then deploy and restart the server.
5. Everyone, Justin included, must log in again, because old tokens have no role.
6. Smoke test:
   - An unknown Google account is refused.
   - A client sees only its company on My Jobs, My Parts and the new job and part pages.
   - A level-1 admin gets no expenses section.
