const PART_START_ROW = 27;
const PART_BLOCK_ROWS = 7;
const CLEAR_RANGE = 'B5:B96';
const CLEAR_FIRST_ROW = 4; // zero-based
const CLEAR_END_ROW = 96;
const COLUMN_B = 1;

const sanitizeValue = (value) => {
    if (typeof value === 'string' && value.startsWith("'")) {
        return value.slice(1);
    }
    return value;
};

const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
};

const jobUpdates = (job) => {
    const hasTax = job.tax_code === 1 && job.tax > 0;
    const hasPercent = job.tax_code === 1 && !hasTax && job.tax_percent > 0;
    let taxCells = [];
    if (hasTax) taxCells = [{ cell: 'B20', value: job.tax }];
    else if (hasPercent) taxCells = [{ cell: 'B21', value: job.tax_percent / 100 }];

    return [
        { cell: 'B5', value: job.job_number },
        { cell: 'B6', value: job.company_code },
        { cell: 'B9', value: job.company_name },
        { cell: 'B10', value: job.address_line1 },
        { cell: 'B11', value: job.address_line2 },
        { cell: 'B13', value: job.attention },
        { cell: 'B14', value: formatDate(job.created_at) },
        { cell: 'B16', value: job.po_number || '' },
        { cell: 'B17', value: formatDate(job.po_date) },
        { cell: 'B18', value: formatDate(job.due_date) },
        { cell: 'B19', value: hasTax || hasPercent ? 'Y' : 'N' },
        ...taxCells,
        { cell: 'B23', value: job.invoice_number || '—' },
        { cell: 'B24', value: formatDate(job.invoice_date) },
        { cell: 'B25', value: formatDate(job.invoice_date) },
    ].map(({ cell, value }) => ({ cell, value: sanitizeValue(value) }));
};

const partDetails = (part) => {
    if (part.details) return part.details;
    const fallback = [part.material, part.finish].filter(Boolean).map((v) => `*${v}`).join(' ');
    return fallback || part.details;
};

const partUpdates = (part, index) => {
    const row = PART_START_ROW + index * PART_BLOCK_ROWS;
    const price = part.price === null || part.price === undefined ? part.price : Number(part.price);
    return [
        { cell: `B${row}`, value: sanitizeValue(part.number) },
        { cell: `B${row + 1}`, value: sanitizeValue(part.rev || '—') },
        { cell: `B${row + 2}`, value: sanitizeValue(part.description || '—') },
        { cell: `B${row + 3}`, value: sanitizeValue(partDetails(part)) },
        { cell: `B${row + 4}`, value: sanitizeValue(part.quantity) },
        { cell: `B${row + 5}`, value: price },
    ];
};

const buildSheetUpdates = (job, parts) => [
    ...jobUpdates(job),
    ...parts.flatMap(partUpdates),
];

const getCellFor = (sheet, cell) => {
    const column = cell[0];
    const row = parseInt(cell.slice(1), 10);
    return sheet.getCell(row - 1, column.charCodeAt(0) - 65);
};

const populateSheet = async (sheet, job, parts) => {
    await sheet.loadCells(CLEAR_RANGE);
    for (let row = CLEAR_FIRST_ROW; row < CLEAR_END_ROW; row++) {
        sheet.getCell(row, COLUMN_B).value = null;
    }
    await sheet.saveUpdatedCells();

    buildSheetUpdates(job, parts).forEach(({ cell, value }) => {
        getCellFor(sheet, cell).value = value;
    });
    await sheet.saveUpdatedCells();
};

module.exports = { buildSheetUpdates, populateSheet };
