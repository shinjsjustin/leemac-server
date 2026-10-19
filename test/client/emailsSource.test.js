const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/AdminComponents');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('Emails loads links for a job or a part', () => {
    const emails = read('Emails.js');
    assert.match(emails, /export default Emails/);
    assert.match(emails, /\/internal\/emails\?jobId=/);
    assert.match(emails, /\/internal\/emails\?partId=/);
    assert.match(emails, /\(no subject\)/);
    assert.match(emails, /toLocaleString\(/);
});

test('Emails builds an Apple Mail link and copies headers', () => {
    const emails = read('Emails.js');
    assert.match(emails, /message:\/\/%3C\$\{encodeURIComponent\(\w+\.message_id\)\}%3E/);
    assert.match(emails, /Open in Mail/);
    assert.match(emails, /navigator\.clipboard\.writeText/);
    for (const h of ['Subject', 'From', 'Date', 'Message-ID']) assert.match(emails, new RegExp(`${h}:`));
    assert.doesNotMatch(emails, /mail\.google/);
});

test('Emails adds and removes links, then reloads', () => {
    const emails = read('Emails.js');
    assert.match(emails, /post\('\/internal\/emails\/add'/);
    assert.match(emails, /post\('\/internal\/emails\/remove'/);
    assert.match(emails, /const post = [\s\S]*?apiFetch\(path[\s\S]*?await load\(\)/);
    assert.match(emails, /window\.confirm/);
    assert.match(emails, /emails\/remove', \{ id: email\.id \}/);
    assert.match(emails, /job_id/);
    assert.match(emails, /part_id/);
});

test('Job and Part render Emails', () => {
    const job = read('Job.js');
    const part = read('Part.js');
    assert.match(job, /import Emails from '\.\/Emails'/);
    assert.match(job, /<Emails jobId=\{id\} \/>/);
    assert.match(part, /import Emails from '\.\/Emails'/);
    assert.match(part, /<Emails partId=\{id\} \/>/);
});
