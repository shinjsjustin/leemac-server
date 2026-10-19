const path = require('path');
const { JobPartError, addPartToJob } = require('./jobParts');
const { insertPartFiles } = require('./partFiles');

const BAD_REQUEST = 400;
const DRAWING_EXTENSIONS = ['.pdf'];
const STEP_EXTENSIONS = ['.step', '.stp'];

const hasExtension = (file, extensions) =>
    extensions.includes(path.extname(file.originalname || '').toLowerCase());

// Returns the files to attach; throws before any DB work on bad input.
function validate(body, files) {
    const partNumber = String(body.part_number ?? '').trim();
    if (!partNumber) throw new JobPartError('part_number is required', BAD_REQUEST);

    const drawing = files && files.drawing && files.drawing[0];
    if (!drawing) throw new JobPartError('drawing is required', BAD_REQUEST);
    if (!hasExtension(drawing, DRAWING_EXTENSIONS)) {
        throw new JobPartError('drawing must be a .pdf file', BAD_REQUEST);
    }

    const step = files.step && files.step[0];
    if (step && !hasExtension(step, STEP_EXTENSIONS)) {
        throw new JobPartError('step must be a .step or .stp file', BAD_REQUEST);
    }
    return { partNumber, attachments: step ? [drawing, step] : [drawing] };
}

// Creates or reuses the part for a drawing, links it to the job and stores its files.
async function addDrawingPartToJob(db, jobId, body, files) {
    const input = body || {};
    const { partNumber, attachments } = validate(input, files);
    const quantity = String(input.quantity ?? '').trim() === '' ? 1 : input.quantity;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.execute(`SELECT id FROM part WHERE number = ?`, [partNumber]);
        const { job_part_id, part_id } = await addPartToJob(connection, jobId, {
            part_number: partNumber,
            description: input.title,
            quantity,
            price: input.price,
            rev: input.rev,
            material: input.material,
            finish: input.finish,
            stock_size: input.stock_size,
        });
        const file_ids = await insertPartFiles(connection, part_id, attachments);
        await connection.commit();
        return { job_part_id, part_id, part_created: existing.length === 0, file_ids };
    } catch (e) {
        await connection.rollback();
        throw e;
    } finally {
        connection.release();
    }
}

module.exports = { addDrawingPartToJob };
