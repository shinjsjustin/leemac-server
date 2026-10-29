# Client portal parts

Clients see the parts they have ordered, with their drawings. Both routes accept a client token only. The company always comes from the token, never from the query.

## Ownership

A part belongs to a company through part -> job_part -> job.company_id. A part shared across companies shows each company only its own jobs. A part the company has never ordered is a 404, the same as a part that does not exist.

## GET /api/portal/parts

Lists the company's parts, ordered by part number. Optional search params, both partial and case-insensitive matches, trimmed and cut to 100 characters:

- `number`: matches the part number.
- `description`: matches the part description.

The list has no prices. Each row has:

- `part_id`: the part id.
- `part_number`: the part number.
- `part_description`: the part description.
- `jobs`: the company's own jobs using the part, newest first, each with `id` and `job_number`.
- `drawing_count`: number of PDF drawings on the part.
- `latest_drawing`: `{ id, filename, mimetype }` of the newest PDF, or `null` when there is none.

## GET /api/portal/parts/:id

Returns one part, or 404 when the company does not own it or the id is invalid. Fields:

- `part_id`, `part_number`, `part_description`: as in the list.
- `jobs`: the company's own jobs only, each with `id` and `job_number`.
- `drawings`: every PDF on the part, newest first, each with `id`, `filename`, `mimetype`, `size` and `uploaded_at`.

## Drawings

Drawings are part-level PDFs: files on the part that belong to no job and no note. The newest PDF is the most recently uploaded one. Previews fetch the file through `/api/portal/files/:id`.

## Admin: /api/internal/part/getparts

Staff get the same drawing summary on `GET /api/internal/part/getparts` (behind normal staff auth). Each part row adds `drawing_count` and `latest_drawing`, with the same meaning as above.

## Pages

- The Parts link on `/client-home` goes to `/client-parts`.
- `/client-parts` lists the company's parts. Search by number or description; the search is remembered for the browser session under `clientPartListSearch`. Each row shows the three newest job links, then "+N more" when there are others.
- `/client-part/:id` shows one part with its jobs and all of its drawings.
- Each part has a "Click to show preview" control. The newest PDF loads only on click. When the part has more than one drawing it shows "1 of N drawings". Tapping the preview opens it full size.
- The admin part list has the same preview, fetched through its own blob download route, `GET /api/internal/part/blob/download`.
- The lists panel sits beside the parts table. Pick a list to filter the table to its parts, then select parts to add them to a list or remove them.
- Under 768px the panel and table stack, and the panel collapses.
- Clicking a list's Request opens Request mode, which clears the part selection and shows every part on the list with its drawings on file. The client edits description, rev, material, finish and quantity; parts left without a quantity are skipped, and Submit sends it as a request (see `docs/quote-requests.md`, Part lists).
