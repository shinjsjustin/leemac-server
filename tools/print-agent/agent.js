#!/usr/bin/env node
// Shop Mac print agent: long-polls the server for print jobs and hands them to CUPS via lp.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const childProcess = require('node:child_process');

const SAFE_VALUE = /^[A-Za-z0-9_.=-]+$/;
const LP_ID = /request id is (\S+)/;
const POLL_WAIT_SECONDS = 25;
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;

async function runOnce({ fetch, execFile, baseUrl, token, wait }) {
    const headers = { Authorization: `Bearer ${token}` };
    const res = await fetch(`${baseUrl}/api/print-agent/next?wait=${wait}`, { headers });
    if (res.status === 204) return;
    if (!res.ok) throw new Error(`next failed: ${res.status}`);
    const { job } = await res.json();

    let tempDir = null;
    let result;
    try {
        const values = [job.cups_queue, ...job.options];
        if (!values.every((v) => SAFE_VALUE.test(v))) throw new Error('Refused unsafe queue or option');
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printagent-'));
        const file = path.join(tempDir, `job-${job.id}.pdf`);
        const fileRes = await fetch(`${baseUrl}${job.file_url}`, { headers });
        if (!fileRes.ok) throw new Error(`file download failed: ${fileRes.status}`);
        fs.writeFileSync(file, Buffer.from(await fileRes.arrayBuffer()));
        const args = ['-d', job.cups_queue, '-n', String(job.copies), ...job.options.flatMap((o) => ['-o', o]), file];
        const { stdout } = await execFile('lp', args);
        const match = LP_ID.exec(stdout);
        result = { status: 'printed', lp_job_id: match ? match[1] : null };
    } catch (err) {
        result = { status: 'failed', error: err.message };
    } finally {
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    }

    await fetch(`${baseUrl}/api/print-agent/jobs/${job.id}/result`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
    });
}

async function main() {
    const baseUrl = process.env.PRINT_AGENT_URL;
    const token = process.env.PRINT_AGENT_TOKEN;
    if (!baseUrl || !token) {
        console.error('Set PRINT_AGENT_URL and PRINT_AGENT_TOKEN');
        process.exit(1);
    }
    const deps = { fetch, execFile: promisify(childProcess.execFile), baseUrl, token, wait: POLL_WAIT_SECONDS };
    let backoff = MIN_BACKOFF_MS;
    for (;;) {
        try {
            await runOnce(deps);
            backoff = MIN_BACKOFF_MS;
        } catch (err) {
            console.error(`${new Date().toISOString()} ${err.message}; retrying in ${backoff / 1000}s`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
            backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
    }
}

if (require.main === module) main();

module.exports = { runOnce };
