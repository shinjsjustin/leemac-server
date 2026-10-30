# Leemac print overhaul: research (30 Oct 2026)

Read-only research. Nothing was changed in any repo, nothing deployed or installed.
Sources: ~/leemac-server at 0a5754b, ~/Scripts/leemac-print/print.py, the live "Blank Job" Google Sheet (read only), `lpstat`/`lpoptions`/`cupsctl` on the shop Mac, web sources cited in section 3.

## 1. Current state in plain words

1. On the Job page (`src/client/src/components/JobPage/JobHeader.js`) an admin with level 3 opens **Export ▾** and picks Quote, Order, or "Invoice + Packing + Shipping". There is also a separate "Populate Google Sheet" button.
2. `POST /api/internal/job/export?id=` (`src/routes/job/export.js`, `requireAdmin(3)`) calls `exportJobs` in `src/lib/quoteExport.js`. Exports run one at a time through `src/lib/exportQueue.js` because they all share one sheet (5 min queue wait, 2 min script timeout).
3. For each type: `loadJobSummary` (`src/lib/jobSummary.js`) reads job + company + job_parts; `populateSheet` (`src/lib/quoteSheet.js`) clears `Edit!B5:B96` of the "Blank Job" spreadsheet (via a service account) and writes the cells; then the server POSTs `{ action, jobId, jobNumber }` to the Apps Script web app (`GSCRIPT_URL`). Actions: exportQuote, exportOrder, exportInvoice, exportPackList, exportShipping.
4. The Apps Script (the legacy `doPost`, **not in the repo**; only the wrapper `docs/apps-script/exportPdf.gs` is) renders the matching tab (Quote, Order, Invoice, PackList, Shipping) to a PDF in Drive. The wrapper then finds the newest PDF created since it started (a Drive-wide search, not by folder or name), checks `Edit!B5` equals the job number, and returns it base64.
5. `src/lib/exportReply.js` checks the reply (job number matches, `%PDF` magic, <= 20 MB). The server then **already saves the PDF in MySQL** as a job file (`uploaded_files.content` LONGBLOB, `job_id`), named `<Label>-<jobNumber>-<YYYYMMDD-HHMMSS>.pdf`. So every export since that change is already in the DB; Drive is only the print path and the Friday sweep's source.
6. Google Drive for desktop syncs `My Drive/Leemac/{Invoice,Order,PackList,Shipping,Print,ShopOrder}` to the Mac. `print.py` (launchd `com.leemac.printwatcher`, RunAtLoad + KeepAlive, running now as PID 844) uses `watchdog` `on_created` and runs `lp`: Brother for Invoice/Order/Print/ShopOrder (1 copy) and PackList (2 copies); Shipping is cropped to 288x432 pt (first page only, PyPDF2) then `lp -o media=4x6 -o scaling=100` to the thermal printer, and the original is deleted.
7. Weak points seen: missed `on_created` events when Drive lags or writes atomically (no catch-up on restart, no "printed" record, the `printed` set lives in memory only); the Drive-wide "newest PDF" search can pick the wrong file if two exports overlap from other sources; Shipping PDFs are named `_SHIPPING (n).pdf` with no job number; Quote PDFs are not printed at all (no Quote watch folder); ShopOrder and Print are fed from outside the server (no ShopOrder export in the code).

Counts in Drive today: Invoice 376 files (`<invoice>.pdf`, e.g. `10796.pdf`), PackList 386 (`13706QWD_PACKLIST.pdf`), Shipping 288, Order 88 (`13704QSG_ORDER.pdf`), ShopOrder 94, Print 2.

**Storage of files and drawings.** All files are DB blobs in AWS RDS: `uploaded_files` (LONGBLOB `content`, with `part_id`, `job_id` or `note_id`). Part drawings are PDFs attached to the part (`src/lib/jobDrawings.js` requires a `.pdf` drawing, optional STEP; `insertPartFiles`). Served by `GET /api/internal/part/blob/download?fileID=` (`src/routes/part.js:216`, `Content-Disposition: attachment`); Bourne's `/api/bourne/files/:id` and the admin quote-request route serve `inline`. Upload cap 20 MB/file. No S3, no local disk.

**Where buttons would go.**
- Documents: `JobPage/JobHeader.js` (today's Export menu) or a new `JobPage/JobDocuments.js` panel beside `JobFiles.js` / `JobBilling.js`.
- Job files: `JobPage/JobFiles.js` (already has Preview/Download per file).
- Drawings: `JobPage/JobParts.js` rows, `AdminComponents/Part.js` (part page), and `components/PartPdfPreview.js` (pdf.js preview, `pdfjs-dist` 3.11).

**Numbering today.**
- Job number (`job.job_number`, e.g. 13706) is the quote number base; the printed "Quote #" / "Reference #" is `job_number + company.code` (13706QWD), composed in the sheet.
- Invoice number (`job.invoice_number`, VARCHAR(50), e.g. 10796) and `invoice_date` are **typed by hand** in `EditJobModal.js`; nothing in the server or (as far as the visible sheet shows) the sheet assigns them. No uniqueness constraint on `invoice_number`.
- No order or packing-list number exists ("PACKING #" on the PackList tab is blank).
- `Edit!A1` = 13267 and `Edit!A2` = 10457 hold numbers that look like old counters; they are below current numbers, so they appear unused. Not verified (the legacy script was not readable).
- The Friday sweep (`~/Bourne/bin/invoices-due`) reads `LEEMAC_DRIVE_DIR/Invoice/<invoice_number>.pdf` (default `~/My Drive/Leemac`) and checks its text. This is the one hard dependency on Drive outside printing.

**Migrations and tests.** `src/db/migrations/NNN_name.sql`, 001-017, run **by hand** on production before deploying code that needs them; header comment says what it does, that it is additive, and the order. Also kept: `src/db/schema.sql`. Tests: `npm test` (node:test) for server, Jest for client; contract fixtures per `src/client/src/api` module in `src/client/src/api/contracts` with a node test in `test/contracts`; screens checked by screenshot, not Jest; no tests that grep source text (`test/README.md`).

## 2. Field map per document

DB columns come from `job` (j), `company` (c), `job_part` (jp), `part` (p). "Sheet-only" = fixed text or a value in the template, not in the DB. Values seen in the live tabs for job 13706 (WD Media).

**Shared header (all but the label):** Leemac Manufacturing Inc., 1980 Hartog Drive, San Jose CA 95131, Phone (408)573-0130, Fax (408)573-0131: sheet-only constants.

**Shared part block (Quote, Order, Invoice, PackList):** per part, 3 rows: Item #, Part # (p.number), Rev (jp.rev or "—"), Description (p.description), second row "Details" (jp.details, else `*material *finish` from jp.material/jp.finish), Qty (jp.quantity), Unit Price (jp.price), Ext Price (qty x price, computed in sheet). Template holds 30 numbered rows = **10 parts max**; `CLEAR_RANGE B5:B96` with 7-row blocks from row 27 also caps the Edit tab at 10 parts. Not stored: jp.stock_size, jp.note.

| Field | Quote | Order | Invoice | PackList | Shipping label | Source |
|---|---|---|---|---|---|---|
| Customer name, address lines 1-2 | To: | Ship to + Sold to | Bill to + Ship to | Ship to + Sold to | To block | c.name, c.address_line1, c.address_line2 (ship-to always = bill-to; no separate ship-to address in DB) |
| Attn | Attn. | Attn + Buyer name | under Ship to | Attn | Attn | j.attention |
| "Attn: Account Payable" | | | yes | Sold-to | | sheet-only constant |
| Quote/Ref # | Quote # | Reference # | Reference # | Ref # | Quote: | j.job_number + c.code (composed) |
| Date | Date = j.created_at | | | | | j.created_at |
| PO number | | Customer Order Number | Customer Order Number | Customer Order Number | PO: | j.po_number |
| PO date | | P.O. Date | | | | j.po_date |
| Delivery / due date | | Delivery Date | | | | j.due_date |
| Tax code Y/N | | yes | yes | yes | | derived: j.tax_code=1 and (j.tax>0 or j.tax_percent>0) |
| Tax amount / % | | | TAX % line | | | j.tax or j.tax_percent |
| Invoice no. | | | Invoice No. | Invoice# | Invoice: | j.invoice_number |
| Invoice date | | | Invoice Date | | | j.invoice_date |
| Ship date | | per-line Ship Date column (blank) | Ship Date | SHIP DATE | | **filled from j.invoice_date, not j.ship_date** (`quoteSheet.js` B25); j.ship_date exists but is unused |
| Subtotal, total | (extended prices) | ext prices | SUBTOTAL, TOTAL TO REMIT | | | computed in sheet; j.subtotal / j.total_cost exist in DB but are not sent |
| Payment term | | | NET 30 DAYS | NET 30 DAYS | | sheet-only constant (no per-company term in DB) |
| Ship via | | LEEMAC | LEEMAC | LEEMAC | | sheet-only constant |
| Transportation, Special instructions | | | blank lines | | | sheet-only, blank |
| Qty shipped / Qty bal | | | | Qty shipped = Qty ord, Bal 0 | | computed in sheet (no partial shipments in DB) |
| PACKING # | | | | blank | | none |
| Prepared by, Tel., Cell | Justin Shin, 408-717-6241, 669-369-8895 | | | | | sheet-only constants |
| OUTSIDE SERVICE checklist (CA, BA, HBA, HCA, HT, GR) | right margin | | | | | sheet-only, hand marks |
| Customer phone "Tel: 408-576-2158" | | | | under Attn | | sheet-only, apparently fixed text in the template (not in DB; company has no phone column) |
| From block "Leemac / Manufacturing / 1980 Hartog Drive" | | | | | yes | sheet-only constant |
| Parts on label | | | | | Part #, Desc, details, Qty per part | p.number, p.description, details, jp.quantity |

The **shipping label is Leemac's own 4x6 delivery label** (Ship via LEEMAC, i.e. Leemac drives it), not a carrier label. No carrier, tracking or weight anywhere in DB or sheet.

Sheet tabs also include Manual* variants (ManualQuote/Order/Invoice/PackList/Shipping), "Order-new" and "Copy of PackList": hand-edited versions the server never uses. Whether Justin still uses them weekly is unknown.

## 3. Options compared

### The shop Mac (checked read-only)

- `lpstat`: `Brother_HL_L2305_series` (`usb://Brother/HL-L2305%20series`, system default) and `Printer_ThermalPrinter` (`usb://Printer/ThermalPrinter`), both idle and enabled.
- Brother media: Letter is the default (`*Letter`); also A4, Legal, Label media type, Tray1/Manual.
- Thermal media: `*4x6` default; also 4x8, 2x1, round, Custom. 203/600 dpi, Gap tracking, darkness 0-15, offsets. It has a working CUPS driver, so a true 4x6 PDF prints directly with `lp -o media=4x6`.
- `cupsctl`: `_share_printers=0`, `_remote_any=0`, `WebInterface=No`. **Printer sharing is off.**
- `pmset`: `sleep 0` (never sleeps), `autorestart 1` (restarts after power loss), `womp 1`, Power Nap on. Model Mac16,10, Apple Silicon. A launchd agent on it stays up as long as the Mac is on and logged in.

### Print paths

| | 1. Browser print dialog | 2. Own print agent on the Mac (`lp`) | 3. QZ Tray | 4. PrintNode | 5. CUPS/IPP sharing via Tailscale |
|---|---|---|---|---|---|
| One-click silent | No. Every print shows the dialog. Chrome `--kiosk-printing` is mainly a Windows feature and prints only to one default printer. | **Yes** | Yes, but only with a signed certificate (paid tiers only) | Yes | No. Phones show the iOS print sheet. |
| Works from phones and other shop computers | Yes, if that device can reach a printer (the USB printers are only on the Mac, so other devices can't) | **Yes**: the server queues the job, the Mac prints it | No: needs QZ Tray on every device; phones can't run it | Yes | Partly: iOS discovery needs Bonjour, which Tailscale doesn't carry (unverified); a manually added IPP printer is unverified |
| Mac asleep or off | Can't print | Jobs wait in the DB and **print on wake or boot** (catch-up) | Can't print | Mac must be on; offline queueing unverified | Can't print |
| 4x6 thermal | Dialog paper size per print; error-prone | Exact: `lp -d Printer_ThermalPrinter -o media=4x6` on a PDF made at 4x6 | Supported (pixel or raw) | `paper` option; fit_to_page | Driver on the Mac, as today |
| Cost | $0 | $0 (your code) | Premium Support $449-549/yr to get silent printing | Lite free (50 prints/mo, 1 computer); Essential $9/mo or $90/yr (5,000/mo) | $0 |
| Security | Nothing new exposed | Outbound HTTPS from the Mac with a device token; no inbound port | Local websocket; signing key on the server | Third party sees the PDFs (unless `pdf_uri`); API key on the server | Opens IPP 631 to the tailnet; needs ACLs |
| Upkeep | None | ~200 lines of code and one LaunchAgent, like `print.py` today | Java app updates, certificate renewal every 1-5 yrs | Client updates; vendor dependency | CUPS/Tailscale config; fragile on iOS |
| Printed status shown in app | No | **Yes** (agent reports done or failed with the `lp` job id) | Partly (JS promise) | Yes (API job states) | No |

Sources:
- Chrome kiosk printing: https://support.churchsuite.com/article/699-silent-browser-printing, https://developer.samsung.com/browser/policy/silent-printing-enabled.html
- iOS iframe print bugs: https://bugs.webkit.org/show_bug.cgi?id=177841
- QZ licensing and signing: https://qz.io/docs/licensing, https://qz.io/docs/Signing, https://buy.qz.io/Premium-Support-_p_13.html
- PrintNode: https://www.printnode.com/en/pricing, https://www.printnode.com/en/download, https://www.printnode.com/en/docs/api/curl
- CUPS `lp` options: https://opensource.apple.com/source/cups/cups-450/cups/man/lp.man.auto.html
- AirPrint and CUPS: https://wiki.debian.org/CUPSAirPrint, https://lists.cups.org/pipermail/cups/2015-October/055493.html

**Download PDF** is the same for every path: a server route that returns the stored PDF. The browser's own viewer then gives a manual print fallback from any device.

### PDF engine (server, small Ubuntu box)

| | Fidelity / matching the Sheet layouts | Layout effort | Footprint | Upkeep |
|---|---|---|---|---|
| **HTML+CSS to PDF with Puppeteer/Playwright (headless Chromium)** | Highest. HTML tables and `@page` sizes (letter, 4x6) reproduce the sheet grids closely. One template system for all 5 documents. | Low: the same HTML can be the in-app preview | ~0.5 GB disk for Chrome + headless shell; budget ~300-500 MB RAM while rendering. Third-party figures, unverified on this box. | Chromium updates and system libs (`apt` deps) |
| Gotenberg (Chromium in Docker, HTTP API) | Same as above | Low | ~480-670 MB image; >=512 MB RAM recommended; needs Docker | Keeps Chromium out of the Node process |
| @react-pdf/renderer | Good. Flexbox subset, no grid; tables are hand-built. | Medium. Can't reuse app CSS; supports React 19 (v4.1+) and Node 18-21. | Light (pure JS) | Low |
| pdfkit | Exact but every line is placed by coordinates | High | Light | Low, but changing layouts is costly |
| pdf-lib | Fills or stamps existing PDFs, not a layout engine. Useful only to crop or merge (e.g. drawings). | n/a | Light | Low |

Sources:
- Chromium disk size: https://github.com/puppeteer/puppeteer/issues/12460
- Gotenberg: https://gotenberg.dev/docs/getting-started/installation, https://computingforgeeks.com/gotenberg-html-to-pdf-api/
- react-pdf compatibility: https://react-pdf.org/compatibility
- Comparisons: https://reintech.io/blog/nodejs-pdf-generation-pdfkit-puppeteer-jspdf-comparison

**Not checked:** the production box's RAM and disk; it was not touched. Check them before choosing Chromium: `bin/server leemac status`.

### Not verified

- Whether `--kiosk-printing` works on current Chrome for macOS.
- Whether PrintNode queues jobs while its client is offline.
- How QZ's unsigned "code restriction" behaves exactly.
- iOS printing to an IPP printer at a Tailscale IP.
- Chromium RAM on the prod box.
- Raw ZPL/ESC-POS support on the generic thermal printer. It isn't needed: its CUPS driver already takes PDF at 4x6.
- The legacy Apps Script source (not in the repo), so any sheet formulas or hidden logic in it are unknown.

## 4. Recommended architecture and phased plan

**Recommendation:** generate PDFs on the server from HTML templates with headless Chromium, and store them in MySQL as today. Print through a small self-written **print agent** on the shop Mac: a Node or Python LaunchAgent that long-polls the server over HTTPS with a device token, fetches the PDF, runs `lp` with the printer and options from a Printers page, and reports done or failed. Drive and Apps Script leave the path entirely.

Why the agent over the others:
- It is the only free option that is silent and one-click from phones and other computers.
- It catches up after downtime, and it shows a printed status.
- It replaces `print.py` like for like: same `lp` calls, same Mac, same LaunchAgent pattern.
- The Mac never sleeps and auto-restarts, so the "Mac off" weakness rarely applies.
- PrintNode Essential ($90/yr) is the fallback if Justin would rather not own the agent: it gives the same flow and the same server code shape.

**Data shape (sketch):**
- `job_document`: job_id, type (quote, order, packing, shipping, invoice), status (draft, saved), the editable field values as JSON, a snapshot of the parts, the PDF file_id in `uploaded_files`, number, created and saved by and at.
- `printer`: name shown, CUPS queue name, role (letter or label), default media, copies per document type, enabled.
- `print_job`: file_id, printer_id, copies, options, requested_by, status (queued, sent, printed, failed), lp_job_id, error, timestamps.
- `print_agent`: token hash, last_seen.

The documents start blank in the sense Justin means: each job page lists all five with "Fill from job" defaults. The form pre-fills from job, company and parts, and edits are saved on the document, not back on the job. Saving renders and stores the PDF.

### Phases (each shippable alone; old Export + Drive + `print.py` keep working until phase 5)

1. **Print and Download on files and drawings.**
   - Server: Printers page, the `printer`/`print_job`/`print_agent` tables, and agent endpoints (claim next job, report result).
   - Mac: the agent LaunchAgent.
   - App: "Download PDF" and "Print" on job files (`JobFiles.js`) and part drawings (`JobParts.js`, `Part.js`).
   - Drawings print on the Brother, letter, fit to page.
   - This proves the print path with no change to documents. The exported Sheet PDFs are already job files, so they can be printed from the app at once.
2. **Server-rendered PDFs, same data, side by side.**
   - HTML templates for Invoice, Packing list, Order, Quote and Shipping label that copy the sheet layouts and pull from `loadJobSummary`, plus the sheet constants.
   - "Download PDF" and "Print" per document.
   - The old Export menu stays. Justin compares both PDFs for a week of real jobs.
3. **Editable documents.**
   - `job_document` with a form per type, pre-filled from the job; save stores the field values and the PDF.
   - Removes the 10-part cap, and fixes ship date (use `j.ship_date`) and the per-line extras.
   - Invoice save requires an invoice number, unique.
4. **Invoice handoff for the Friday sweep.**
   - Saving an invoice also writes `<invoice>.pdf` where the sweep reads it, or `bin/invoices-due` reads the PDF from the Leemac Bourne API instead of Drive (preferred).
   - Confirm Sent Items matching still works with the new PDF text.
5. **Retire the old path.**
   - Remove the Export menu, "Populate Google Sheet", the Apps Script call and the `google-spreadsheet` dependency.
   - Unload `com.leemac.printwatcher` and archive `print.py`.
   - Leave the Drive folders read-only as history.

## 5. Decisions for Justin

1. **Print path?**
   - (a) Own print agent on the shop Mac. Free, silent from any device, catches up, shows printed status.
   - (b) PrintNode Essential, $90/yr. Same flow with no agent code to own, but a third party and an account.
   - (c) Browser print dialog only. No code, but no silent printing and the USB printers can't be reached from other devices.
   - (d) QZ Tray. $449-549/yr for silent, and it doesn't work from phones.
2. **PDF engine?**
   - (a) HTML templates rendered by headless Chromium (Puppeteer) on the server. Closest match to the sheets, and one template doubles as the preview.
   - (b) Gotenberg in Docker. Same output, keeps Chromium out of Node, but adds Docker.
   - (c) @react-pdf/renderer. Light, but layouts are rebuilt by hand.
   - (d) pdfkit. Lightest, but coordinate layouts are costly to change.
3. **Layout fidelity?**
   - (a) Copy the current sheet layouts closely first, redesign later. Customers' AP teams already know these forms.
   - (b) Redesign now. Cleaner, but adds design time to the critical path.
   - (c) Copy exactly, including the Quote margin checklist and fixed phone lines.
4. **Where invoice numbers come from?**
   - (a) The DB assigns the next number on first invoice save (max+1 with a unique key), editable by an admin. No more hand typing, no duplicates.
   - (b) Keep typing it by hand in Edit Job, and add a unique key.
   - (c) A settings counter like the sheet's old `Edit!A2`.
5. **Order and packing-list numbers?**
   - (a) Keep using `job_number+company code` as the reference, and add no new numbers. That is what the forms already show.
   - (b) Add a packing number per shipment. Only needed for partial shipments.
6. **What happens to Drive copies?**
   - (a) Stop writing to Drive. The DB holds every PDF, and Download covers the rest.
   - (b) Keep writing the invoice PDF only, to Drive through the API, until the sweep moves.
   - (c) Mirror all documents to Drive as an archive.
7. **The Friday invoice sweep?**
   - (a) `bin/invoices-due` reads the invoice PDF from the Leemac Bourne API by invoice number. This removes the last Drive dependency.
   - (b) Keep reading `~/My Drive/Leemac/Invoice/<n>.pdf`, written by the app through the Drive API.
8. **Who may print and edit documents?**
   - (a) Edit and save: level 3 (same as Export today). Print: any admin, level 0+, so shop staff can print drawings and packing lists.
   - (b) Level 3 for everything.
   - (c) Print for level 2+.
9. **Printers page fields?**
   - (a) Name, CUPS queue, role (letter or label), media, default copies per document type (PackList 2), enabled, plus agent last-seen and a test-print button. That covers what `print.py` hardcodes today.
   - (b) Same, without per-type copies (copies asked per click).
10. **Shipping label?**
    - (a) Keep Leemac's own 4x6 delivery label (to and from blocks, quote, PO, invoice, parts) from the job data. That is what it is today; no carrier is involved.
    - (b) Also allow uploading a carrier label PDF (UPS/FedEx) to print on the thermal printer.
    - (c) Integrate a carrier API (Shippo/EasyPost). Only if Leemac starts shipping by carrier often.
11. **Drawings: paper and scaling?**
    - (a) Letter on the Brother, fit to page, 1 copy. Most drawings are A/B size, and fit keeps the title block.
    - (b) Actual size, with a warning when the drawing is larger than letter.
    - (c) Ask per print for copies and size.
12. **Do quotes and orders keep their Sheet templates?**
    - (a) No: move all five to the app in phase 2-3, so Apps Script, the shared-sheet queue and Google credentials can all go.
    - (b) Keep quote and order on the sheet for now, and move only invoice, packing and shipping (the printed ones).
    - (c) Keep the Manual* tabs for one-off hand-made documents.
13. **Do documents copy job data or stay linked?**
    - (a) Snapshot on save: a saved invoice never changes when the job is edited, and "Refill from job" is a button. Matches how a sent invoice must stay fixed.
    - (b) Always live from the job until marked final.
14. **Packing list copies and auto-print?**
    - (a) The Print button prints the configured copies (PackList 2). Saving never prints by itself.
    - (b) Saving an invoice, packing list or label prints them all at once, like the old combined export.
15. **Where does the print agent run and in what language?**
    - (a) Node, as a LaunchAgent on the shop Mac, in the leemac-server repo (`tools/print-agent`), so one codebase and one test suite.
    - (b) Python, next to `print.py` in `~/Scripts`.
