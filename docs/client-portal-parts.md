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

The redesign (pages, deploy order and manual checks) is described in [client-portal-redesign.md](client-portal-redesign.md).

- The Parts link in the top nav (and on `/client-home`) goes to `/client-parts`.
- `/client-parts` shows the company's parts as a `PartWall`: a grid of drawing cards, each showing its drawing first. Search by number or description; the search is remembered for the browser session under `clientPartListSearch`.
- The lists rail (`PartListsPanel`) sits beside the wall. Pick a list to filter the wall to its parts, then select parts to add them to a list or remove them.
- Clicking a part, on the wall or in the rail, opens a drawing window (`DrawingWindows`). Up to 6 stay open and tile side by side; Esc, the dark area, or Close all closes them.
- Under 768px the wall and rail are replaced by a Parts | Lists switch, and the windows become a swipeable viewer.
- `/client-part/:id` shows one part with its jobs and all of its drawings.
- The admin part list has a preview, fetched through its own blob download route, `GET /api/internal/part/blob/download`.
- Clicking a list's Request opens Request mode, which clears the part selection and shows every part on the list with its drawings on file. The client edits description, rev, material, finish and quantity; parts left without a quantity are skipped, and Submit sends it as a request (see `docs/quote-requests.md`, Part lists).
