# Printing (IDEA-0040, phase 1)

## What changed

- **Print and Download PDF** buttons on a job's PDF files, on drawings in the job's parts, and on the part page. Print queues a job for a printer; Download PDF saves the file as before.
- **Printers page** (System nav). Lists the printers, the agent's last-seen time and the 20 most recent print jobs with their status. Level-3 admins can edit printers, set copies per document kind (such as packing) and generate the agent token. Each printer has a Test print button.
- **Print agent** (`tools/print-agent`, LaunchAgent `com.leemac.printagent`) on the shop Mac. It long-polls the server for queued jobs, prints them with `lp`, and reports the result.
- New tables `printer`, `print_job` and `print_agent`, seeded with the Brother letter printer and the thermal 4x6 label printer.

## Deploy

Do these in order.

1. **Back up the database.** Dry-run the migration on a copy if you can.
2. **Run the migration by hand**, before deploying code: `src/db/migrations/018_printing.sql` (needs 017 applied). It only adds tables and seed rows.
3. **Deploy the server and the client.**
4. **Generate the agent token.** Open Printers as a level-3 admin and generate the token. It is shown once; copy it. Generating a new one replaces the old.
5. **Install the agent** on the shop Mac as described in `tools/print-agent/README.md`: copy `com.leemac.printagent.plist` to `~/Library/LaunchAgents/`, replace every `CHANGE_ME` (Node path, `agent.js` path, log paths, `PRINT_AGENT_URL`, `PRINT_AGENT_TOKEN`), then `launchctl load ~/Library/LaunchAgents/com.leemac.printagent.plist`. Logs: `~/Library/Logs/printagent.log`.

## Browser checklist

- [ ] Printers page shows the agent as recently seen once the agent is running.
- [ ] Job page, a PDF file: Print prints on the right printer; Download PDF downloads it.
- [ ] Job page, a drawing in the parts list: Print and Download PDF both work.
- [ ] Part page: Print and Download PDF both work.
- [ ] Packing copies: set packing copies on a printer (Brother default is 2), print a packing document, and check that many copies come out.
- [ ] Test print on each printer: a test page prints and the job shows printed.
- [ ] Stop the agent (`launchctl unload ...`), press Print, and see the job stay queued. Start the agent (`launchctl load ...`); the job prints and shows printed. Queued jobs that wait more than 72 hours expire.
- [ ] Log in as a level-1 admin: Printers is visible, but printers can't be edited and no token can be generated. Print and Test print still work.

## Not changed

The old Export, Drive sync and `print.py` keep working. `print.py` must stay loaded until P5 retires the Sheet path; don't unload it when installing the agent. Nothing from the new print path writes to Drive.
