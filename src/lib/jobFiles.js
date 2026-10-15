const path = require('path');
const multer = require('multer');

const BYTES_PER_MB = 1024 * 1024;
const MAX_FILE_MB = 20;
const MAX_FILES = 10;

const UPLOAD_LIMITS = { fileSize: MAX_FILE_MB * BYTES_PER_MB, files: MAX_FILES };

const ALLOWED_EXTENSIONS = [
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.step', '.stp', '.igs', '.iges', '.dxf',
    '.dwg', '.x_t', '.sldprt', '.xlsx', '.xls', '.docx', '.doc', '.txt', '.csv',
];

const jobFileUpload = multer({
    storage: multer.memoryStorage(),
    limits: UPLOAD_LIMITS,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) return cb(null, true);
        const err = new Error(`File type ${ext || '(none)'} is not allowed`);
        err.code = 'FILE_TYPE_NOT_ALLOWED';
        cb(err, false);
    },
});

async function insertJobFiles(db, jobId, files) {
    const ids = [];
    for (const file of files) {
        const [result] = await db.execute(
            `INSERT INTO uploaded_files (filename, mimetype, size, content, job_id) VALUES (?, ?, ?, ?, ?)`,
            [file.originalname, file.mimetype, file.size, file.buffer, jobId]
        );
        ids.push(result.insertId);
    }
    return ids;
}

async function listJobFiles(db, jobId) {
    const [rows] = await db.execute(
        `SELECT id, filename, mimetype, size, uploaded_at FROM uploaded_files WHERE job_id = ?`,
        [jobId]
    );
    return rows;
}

module.exports = { UPLOAD_LIMITS, ALLOWED_EXTENSIONS, jobFileUpload, insertJobFiles, listJobFiles };
