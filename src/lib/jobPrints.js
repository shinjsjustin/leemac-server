const { latestDocuments } = require('./jobDocuments');
const { enqueuePrint } = require('./printJobs');
const { pickPrinter } = require('./printers');

const DOCUMENTS = [
    { type: 'quote', label: 'Quote' },
    { type: 'order', label: 'Order' },
    { type: 'invoice', label: 'Invoice' },
    { type: 'packing', label: 'Packing list' },
    { type: 'shipping', label: 'Shipping label' },
];
const GATED_TYPES = ['invoice', 'packing', 'shipping'];

async function loadJob(db, jobId) {
    const [rows] = await db.execute('SELECT invoice_clicked_at FROM job WHERE id = ?', [jobId]);
    if (!rows.length) throw Object.assign(new Error('job not found'), { code: 'NOT_FOUND' });
    return rows[0];
}

const isPdf = (file) => file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.filename);

async function pdfDrawings(db, jobId) {
    const [rows] = await db.execute(
        `SELECT f.id, f.filename, f.mimetype FROM uploaded_files f
         JOIN job_part jp ON jp.part_id = f.part_id
         WHERE jp.job_id = ? ORDER BY f.id`,
        [jobId]
    );
    return rows.filter(isPdf);
}

function reasonFor(type, file, job) {
    if (GATED_TYPES.includes(type) && !job.invoice_clicked_at) return 'Click Update invoice first';
    return file ? null : 'Not made yet';
}

async function jobPrintables(db, jobId) {
    const job = await loadJob(db, jobId);
    const latest = await latestDocuments(db, jobId);
    const documents = DOCUMENTS.map(({ type, label }) => {
        const file = latest[type];
        return {
            type, label, file_id: file ? file.id : null, filename: file ? file.filename : null,
            reason: reasonFor(type, file, job),
        };
    });
    return { documents, drawings: (await pdfDrawings(db, jobId)).length };
}

async function printJobDrawings(db, jobId, user) {
    await loadJob(db, jobId);
    const drawings = await pdfDrawings(db, jobId);
    if (!drawings.length) return { queued: 0, printer: null };
    const printer = await pickPrinter(db, 'drawing');
    for (const drawing of drawings) {
        await enqueuePrint(db, { fileId: drawing.id, kind: 'drawing', user });
    }
    return { queued: drawings.length, printer: printer.name };
}

module.exports = { jobPrintables, printJobDrawings };
