# Deploy: QC markings

Migration `024_qc_markings.sql` adds three tables (`qc_marking`, `qc_photo`, `qc_ping`). It is additive; no existing table changes. Apply it before deploying the code, because the code reads these tables.

1. Back up the database: `mysqldump <database> > backup.sql`.
2. Dry run `src/db/migrations/024_qc_markings.sql` on a copy restored from that backup. It needs `023_shared_part_lists.sql` applied first.
3. Run `024_qc_markings.sql` on the live database.
4. Confirm the three tables exist; this returns 3:

   ```sql
   SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name IN ('qc_marking', 'qc_photo', 'qc_ping');
   ```

5. Deploy the server.
