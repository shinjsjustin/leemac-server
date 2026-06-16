// src/lib/ai/pdfParser.js
// "PDF parser" entry point for PDFs that Jarvis fetches on its own (e.g. email
// attachments). Per the temp-staging contract, the file is parked in ai_uploads
// only for the duration of processing and is always deleted afterward — even if
// parsing fails. (User-uploaded chat files staged via the /upload route are a
// separate, persistent flow because they may be promoted to uploaded_files on
// approval; those are not handled here.)

const db = require('../../db/db');
const { runPdfParser } = require('./agents');

// Stages a PDF buffer in ai_uploads, runs it through the MarkItDown-backed parser,
// then removes the staging row. Returns the parsed result (structured fields +
// Markdown) along with metadata.
async function parsePdfBuffer({ buffer, filename, mimetype = 'application/pdf', sessionId = null }) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const name = filename || 'document.pdf';

  const [ins] = await db.query(
    `INSERT INTO ai_uploads (filename, mimetype, size, content, session_id, status)
     VALUES (?, ?, ?, ?, ?, 'staged')`,
    [name, mimetype, data.length, data, sessionId]
  );
  const uploadId = ins.insertId;

  try {
    const result = await runPdfParser(data, mimetype, name);
    return { filename: name, ...result };
  } finally {
    // Temporary staging only — always clean up, success or failure.
    await db
      .query(`DELETE FROM ai_uploads WHERE id = ?`, [uploadId])
      .catch((e) => console.error('[parsePdfBuffer] staging cleanup failed:', e.message));
  }
}

module.exports = { parsePdfBuffer };
