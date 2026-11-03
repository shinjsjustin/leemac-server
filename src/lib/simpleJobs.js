const PAGE_SIZE = 10;
const FIRST_QUOTED_JOB = 13709;

const NUMERIC_JOB = 'CAST(job.job_number AS UNSIGNED)';
const NO_PO = `(job.po_number IS NULL OR TRIM(job.po_number) = '')`;
const HAS_STAR = `EXISTS (SELECT 1 FROM job_part jp JOIN stars s ON s.job_part_id = jp.id WHERE jp.job_id = job.id)`;
const IS_PDF = `(f.mimetype = 'application/pdf' OR LOWER(f.filename) LIKE '%.pdf')`;

const OVERVIEW_WHERE = `${HAS_STAR} AND job.no_bid_at IS NULL`;
const QUOTED_WHERE = `${NUMERIC_JOB} >= ${FIRST_QUOTED_JOB} AND ${NO_PO} AND job.no_bid_at IS NULL`;
const NO_BID_WHERE = `job.no_bid_at IS NOT NULL AND ${NO_PO}`;

const toCents = (n) => Math.round(n * 100) / 100;

async function loadParts(db, jobIds) {
    const marks = jobIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT jp.job_id, p.id AS part_id, p.number, jp.rev, p.description, jp.material, jp.quantity, jp.price
           FROM job_part jp JOIN part p ON p.id = jp.part_id
          WHERE jp.job_id IN (${marks}) ORDER BY jp.id`,
        jobIds
    );
    if (rows.length === 0) return rows;
    const partIds = [...new Set(rows.map((r) => r.part_id))];
    const [files] = await db.execute(
        `SELECT f.id, f.part_id FROM uploaded_files f
          WHERE f.part_id IN (${partIds.map(() => '?').join(', ')}) AND ${IS_PDF} ORDER BY f.id`,
        partIds
    );
    const newestPdf = new Map(files.map((f) => [f.part_id, f.id]));
    return rows.map((r) => ({
        ...r,
        line_total: toCents(r.quantity * r.price),
        drawing_file_id: newestPdf.get(r.part_id) ?? null,
    }));
}

async function loadNotes(db, jobIds) {
    const [rows] = await db.execute(
        `SELECT n.jobid, n.content, a.name AS author, n.created_at
           FROM note n LEFT JOIN admin a ON a.id = n.userid
          WHERE n.jobid IN (${jobIds.map(() => '?').join(', ')}) AND n.part_id IS NULL ORDER BY n.id`,
        jobIds
    );
    return rows;
}

async function listJobs(db, where, page) {
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM job WHERE ${where}`);
    const pages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));
    const current = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
    const [jobs] = await db.execute(
        `SELECT job.id, job.job_number, company.name AS company, job.attention, job.created_at,
                job.po_number, job.invoice_number, job.invoice_status
           FROM job LEFT JOIN company ON company.id = job.company_id
          WHERE ${where} ORDER BY ${NUMERIC_JOB} DESC, job.id DESC
          LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`
    );
    if (jobs.length === 0) return { jobs: [], page: current, pages };

    const ids = jobs.map((j) => j.id);
    const [parts, notes] = await Promise.all([loadParts(db, ids), loadNotes(db, ids)]);
    const cards = jobs.map((job) => {
        const jobParts = parts.filter((p) => p.job_id === job.id).map(({ job_id, ...part }) => part);
        return {
            ...job,
            parts: jobParts,
            total: toCents(jobParts.reduce((sum, p) => sum + p.line_total, 0)),
            notes: notes.filter((n) => n.jobid === job.id).map(({ jobid, ...note }) => note),
        };
    });
    return { jobs: cards, page: current, pages };
}

const listOverview = (db, { page }) => listJobs(db, OVERVIEW_WHERE, page);

async function listQuoted(db, { page }) {
    const result = await listJobs(db, QUOTED_WHERE, page);
    const [noBid] = await db.execute(
        `SELECT job.id, job.job_number, company.name AS company
           FROM job LEFT JOIN company ON company.id = job.company_id
          WHERE ${NO_BID_WHERE} ORDER BY ${NUMERIC_JOB} DESC, job.id DESC`
    );
    return { ...result, no_bid: noBid };
}

// Returns 'ok', 'not_found', or 'has_po' (a job with a PO is no longer a quote).
async function writeNoBid(db, jobId, assignments, params) {
    const [[job]] = await db.execute('SELECT id, po_number FROM job WHERE id = ?', [jobId]);
    if (!job) return 'not_found';
    if (job.po_number && job.po_number.trim() !== '') return 'has_po';
    await db.execute(`UPDATE job SET ${assignments} WHERE id = ?`, [...params, jobId]);
    return 'ok';
}

const setNoBid = (db, jobId, adminId) =>
    writeNoBid(db, jobId, 'no_bid_at = CURRENT_TIMESTAMP, no_bid_by = ?', [adminId]);

const clearNoBid = (db, jobId) => writeNoBid(db, jobId, 'no_bid_at = NULL, no_bid_by = NULL', []);

module.exports = { listOverview, listQuoted, setNoBid, clearNoBid };
