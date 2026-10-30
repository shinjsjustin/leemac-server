# Leemac business documents, v1 (30 Oct 2026)

From Bourne, art director. A fresh set of five documents for Leemac (Justin's machine shop): Quote, Order, Packing List, Shipping Label, Invoice. Justin asked to revamp them rather than copy the old Google Sheet layouts. A design proposal for his review; nothing in leemac-server changes.

Medium: one HTML page + shared CSS per document, rendered by headless Chrome to PDF. Letter for four, 4x6 in for the label (thermal, black only).

Justin's required content:
- Quote: To (company, address), Attn, Date, Quote #, Prepared by; lines Part, Rev, Desc, Qty, Unit Price, Ext Price; Total; Leadtime.
- Order: everything on the Quote plus PO Number, Tax Code, Due Date, subtotal, tax, total.
- Packing List: as above without tax, prices and due date; add Invoice # and Ship Date; "Received By" and "Date" sign-off lines.
- Shipping Label: the Packing List without the sign-off; large ship-to; PO, invoice and reference numbers; parts with qty, "+N more, see packing list" when long.
- Invoice: everything together plus payment terms and remit-to.
- Leemac's header (name, logo, address, phone, email) on every letter document; reference = job number + company code (13706QWD).

Direction: clean, modern, quiet; one family; black plus one restrained accent that prints well in mono; 10-15 lines on page one, flow to page 2 with the table header repeated and page numbers; tabular figures right-aligned; one unambiguous date format; survive long descriptions, 30+ parts and missing optional fields.

Sample data is invented (no real client names or numbers).
