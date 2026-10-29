const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, clientToken: signClient } = require('../helpers/session');

const MARKER = 'SECRET-MARKER';
const FORBIDDEN_KEYS = ['total_cost', 'subtotal', 'tax', 'invoice_number', 'note', 'details', 'attention'];
const planted = Object.fromEntries(FORBIDDEN_KEYS.map((k) => [k, MARKER]));
const withPlanted = (row) => ({ ...row, ...planted });

const handlers = [
    { match: /SELECT job\.id FROM job WHERE job\.id = \? AND job\.company_id/, rows: [withPlanted({ id: 1 })] },
    { match: /SELECT jp\.part_id FROM job_part jp/, rows: [withPlanted({ part_id: 1 })] },
    { match: /COUNT\(\*\)/, rows: [withPlanted({ total: 1 })] },
    { match: /FROM job_part jp\s+JOIN part p/, rows: [withPlanted({ job_id: 1, job_part_id: 5, part_id: 7, part_number: 'P-7', rev: 'A', quantity: 2, price: '1.50', star_status: 'pending' })] },
    { match: /FROM job j\s+WHERE/, rows: [withPlanted({ id: 1, job_number: '101', po_number: 'PO1', po_date: null, due_date: null, ship_date: null })] },
    { match: /SELECT f\.id, f\.filename/, rows: [withPlanted({ id: 2, filename: 'a.pdf', mimetype: 'application/pdf', size: 3, uploaded_at: null })] },
    { match: /SELECT f\.filename, f\.mimetype/, rows: [withPlanted({ filename: 'a.pdf', mimetype: 'application/pdf', size: 3, content: Buffer.from('abc') })] },
];
const fakeDb = {
    execute: async (sql) => {
        if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
        const h = handlers.find((x) => x.match.test(sql));
        return [h ? h.rows : []];
    },
};
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const clientToken = signClient({ id: 1, username: 'u', name: 'Pat', company_id: 5 });
const PATHS = ['/jobs', '/jobs/1', '/parts/1/files', '/files/1'];

test('no portal response body contains a forbidden key or the planted marker', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const path of PATHS) {
            const res = await fetch(`${server.baseUrl}/api/portal${path}`, { headers: { Authorization: `Bearer ${clientToken}` } });
            assert.strictEqual(res.status, 200, path);
            const body = await res.text();
            assert.ok(body.length > 0, `${path} has a body`);
            assert.ok(!body.includes(MARKER), `${path} leaks marker`);
            for (const key of FORBIDDEN_KEYS) {
                assert.ok(!body.includes(`"${key}"`), `${path} leaks key ${key}`);
            }
        }
    } finally {
        await server.close();
    }
});
