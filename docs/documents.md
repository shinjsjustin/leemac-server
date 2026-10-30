# Documents (server-rendered PDFs)

## What changed

- Five documents (Quote, Order, Invoice, Packing list, Shipping label) are now rendered on the server from the job's data, using the templates in `src/lib/documents/`.
- The Job page has a Documents panel. Level 3 admins see **Make PDF** per document. All admins see Download PDF and Print for the latest made file.
- Made files are saved to the job's files and named `...-site.pdf`, beside the files the old Export creates.
- The shipping label is 4x6 in; the others are Letter.
- **Make PDF answers 503 until Puppeteer is installed.** The server boots fine without it.

## Before deploy (on branch `idea-0040`)

The agents could not install Puppeteer (no network). Do it once:

```
npm install puppeteer
node --test test/documents/pdfRenderer.test.js
```

The second command runs the real-render test, which only runs once Puppeteer exists. Then commit `package.json` and `package-lock.json`.

## Deploy

No migration is needed.

1. On the server, check memory: `free -h`. If under about 1 GB is free, add 2 GB swap (or plan to move rendering to the Mac instead):

   ```
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

2. Run `npm install` so Puppeteer downloads Chromium.
3. Install Chromium's Ubuntu libraries (from Puppeteer's troubleshooting page). On Ubuntu 24.04 `libasound2` is named `libasound2t64`.

   ```
   sudo apt-get install -y ca-certificates fonts-liberation libasound2 \
     libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
     libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 \
     libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
     libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
     libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
     lsb-release wget xdg-utils
   ```

4. Deploy the server and the client.

## Browser checklist

- [ ] Make PDF works for each type: Quote, Order, Invoice, Packing list, Shipping label.
- [ ] Compare each with the old Export output for the same job.
- [ ] Download PDF and Print work on each made file.
- [ ] Packing list prints the right number of copies.
- [ ] The shipping label prints at 4x6.
- [ ] A job with over 10 parts renders correctly (page breaks, nothing cut off).
- [ ] The ship date comes from the job.
- [ ] A level 1 admin sees no Make PDF button (Download PDF and Print still show).

## Unchanged

The old Export, Populate Google Sheet, Drive and `print.py` keep working. No migration is needed.

# P3: Editable documents and invoice numbers

## What changed

- Level 3 admins see **Edit** per document (Quote, Order, Invoice, Packing list, Shipping label) in the Documents panel. It opens an editor for that document.
- **Save** stores a snapshot of the fields and parts in the new `job_document` table and makes a new PDF from it. The PDF is saved to the job's files as before.
- Later edits to the job do not change a saved document. To pick up job changes, open Edit, click **Refill from job**, then **Save**.
- The first time an invoice is saved, the site assigns the highest numeric invoice number plus one. Non-numeric numbers are ignored. The number is editable in the editor.
- Duplicate invoice numbers are refused, both by the app (a clear message in the editor and in Edit Job) and by the `uq_job_invoice_number` unique index. Blank invoice numbers stay allowed.
- The Billing card's **Update invoice** now uses the same max+1 rule. It still updates the metadata counter.

## Deploy

This phase needs a migration, `src/db/migrations/019_job_documents.sql`. Run it by hand, after 018, before deploying the code.

1. Back up the database. Dry run on a copy if you can.
2. Copy the pre-check query from the header of `019_job_documents.sql` and run it. It must return no rows. If it returns rows, two jobs share an invoice number: fix those first, or the unique key fails.
3. Run `019_job_documents.sql`. It is additive and drops nothing.
4. Deploy the server, then the client.

## Browser checklist

- [ ] Save each type (Quote, Order, Invoice, Packing list, Shipping label) and a PDF is made.
- [ ] Edit the job, then open the saved PDF: it is unchanged.
- [ ] Refill from job in the editor pulls in the job changes. Save makes a new PDF with them.
- [ ] The first invoice save gets the highest numeric invoice number plus one.
- [ ] A duplicate invoice number is refused in the editor.
- [ ] A duplicate invoice number is refused in Edit Job.
- [ ] A level 1 or 2 admin sees no Edit button.
- [ ] Update invoice on the Billing card uses max+1 and still updates the metadata counter.
- [ ] The old Export still works.

## Unchanged

The old Export, Populate Google Sheet, Drive and `print.py` keep working. Make PDF from the P5 section still works.
