# Export PDF Apps Script

`exportPdf.gs` makes the quote, order, invoice, packing list and shipping exports reply with the saved PDF. Other actions, such as the note post, pass through to the old script unchanged.

## Paste steps

1. Open the Google Sheet script (Extensions > Apps Script).
2. Rename the existing `doPost` to `legacyDoPost`.
3. Paste the contents of `exportPdf.gs` into the project, as a new file or below the existing code.
4. Choose Deploy > Manage deployments, edit the current deployment and pick a new version, so the web app URL stays the same.
5. Test one export from the Job page and confirm the PDF comes back.

The server still accepts the old script until then, so nothing breaks before you deploy.
