const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { getJobStages } = require('../../src/lib/jobStages');

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number) VALUES (3, 10, 'J-1'), (4, 10, 'J-2');
        INSERT INTO job_part (id, job_id) VALUES (7, 3), (8, 3), (9, 4);
        INSERT INTO stars (job_part_id, status, nfc_tag_id, urgent, waiting) VALUES (8, 'qa', 'tag-8', 1, 0), (9, 'open', 'tag-9', 0, 0);
        INSERT INTO star_status_history (job_part_id, job_id, company_id, to_status, source, changed_at)
          VALUES (8, 3, 10, 'setup', 'admin', '2026-01-01 10:00:00'),
                 (8, 3, 10, 'qa', 'admin', '2026-01-02 10:00:00');
        INSERT INTO star_status_history (job_part_id, job_id, company_id, to_status, source, kind, changed_at)
          VALUES (8, 3, 10, 'urgent', 'admin', 'flag', '2026-01-05 10:00:00');
    `);
    return db;
}

test('returns one entry per job part of the job, in id order, unstarred with null status', async () => {
    const stages = await getJobStages(seed(), 3);
    assert.deepStrictEqual(stages, [
        { job_part_id: 7, starred: false, status: null, urgent: false, waiting: false, changed_at: null },
        { job_part_id: 8, starred: true, status: 'qa', urgent: true, waiting: false, changed_at: '2026-01-02 10:00:00' },
    ]);
});

test('returns an empty list for a job with no parts', async () => {
    assert.deepStrictEqual(await getJobStages(seed(), 99), []);
});
