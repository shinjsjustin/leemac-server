const mime = require('mime');

const GENERIC_MIMETYPE = 'application/octet-stream';

// Browsers often send octet-stream for drawings; the part page only previews application/pdf.
function resolveMimetype(file) {
    if (file.mimetype && file.mimetype !== GENERIC_MIMETYPE) return file.mimetype;
    return mime.getType(file.originalname) || GENERIC_MIMETYPE;
}

async function insertPartFiles(db, partId, files) {
    const ids = [];
    for (const file of files) {
        const [result] = await db.execute(
            `INSERT INTO uploaded_files (filename, mimetype, size, content, part_id) VALUES (?, ?, ?, ?, ?)`,
            [file.originalname, resolveMimetype(file), file.size, file.buffer, partId]
        );
        ids.push(result.insertId);
    }
    return ids;
}

module.exports = { insertPartFiles };
