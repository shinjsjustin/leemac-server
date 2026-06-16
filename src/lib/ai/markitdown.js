// src/lib/ai/markitdown.js
// Thin Node wrapper around Microsoft's MarkItDown CLI (https://github.com/microsoft/markitdown).
// MarkItDown is a Python tool that converts PDFs (and many other formats) into clean
// Markdown that LLMs read well. We shell out to the CLI rather than embedding a Python
// runtime. Install it with: pip install 'markitdown[pdf]'
//
// The binary is configurable via MARKITDOWN_BIN (default: "markitdown") so it can point at
// a venv path in production.

const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MARKITDOWN_BIN = process.env.MARKITDOWN_BIN || 'markitdown';
const CONVERT_TIMEOUT_MS = Number(process.env.MARKITDOWN_TIMEOUT_MS) || 120000;

// Availability is probed once and cached for the process lifetime.
let availabilityProbe = null;

// Runs the markitdown binary with the given args. Resolves with stdout (utf-8),
// rejects on non-zero exit, spawn error (e.g. ENOENT), or timeout.
function runMarkitdown(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(MARKITDOWN_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const chunks = [];
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`markitdown timed out after ${CONVERT_TIMEOUT_MS}ms`));
    }, CONVERT_TIMEOUT_MS);

    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      } else {
        reject(new Error(`markitdown exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

// Returns true if the markitdown CLI is installed and runnable. Cached after the
// first call so we don't spawn a probe process on every conversion.
async function isMarkitdownAvailable() {
  if (availabilityProbe) return availabilityProbe;
  availabilityProbe = runMarkitdown(['--help'])
    .then(() => true)
    .catch((err) => {
      console.error('[markitdown] not available:', err.message);
      return false;
    });
  return availabilityProbe;
}

// Converts a file buffer to Markdown using MarkItDown. The buffer is written to a
// short-lived temp file (MarkItDown picks its converter from the file extension),
// converted, then the temp file is removed. Throws if conversion fails.
async function convertToMarkdown(buffer, filename = 'document.pdf') {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const ext = path.extname(filename) || '.pdf';
  const tmpPath = path.join(
    os.tmpdir(),
    `markitdown-${crypto.randomBytes(12).toString('hex')}${ext}`
  );

  await fs.writeFile(tmpPath, data);
  try {
    return await runMarkitdown([tmpPath]);
  } finally {
    await fs.unlink(tmpPath).catch(() => { /* best-effort cleanup */ });
  }
}

module.exports = { isMarkitdownAvailable, convertToMarkdown };
