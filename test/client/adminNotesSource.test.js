const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/AdminComponents');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
const files = { 'JobNotes.js': fs.readFileSync(path.join(dir, '../JobPage/JobNotes.js'), 'utf8'), 'NoteList.js': read('NoteList.js'), 'NotesSection.js': read('NotesSection.js') };

for (const [name, src] of Object.entries(files)) {
    test(`${name} has no note status UI or updatestatus call`, () => {
        assert.doesNotMatch(src, /Status:|Status 상태|>Status</);
        assert.doesNotMatch(src, /Acknowledge|Mark as Done/);
        assert.doesNotMatch(src, /handleUpdateNoteStatus|updatestatus/);
    });
}

for (const name of ['JobNotes.js', 'NoteList.js']) {
    const src = files[name];

    test(`${name} shows the author with a client marker`, () => {
        assert.match(src, /note\.author/);
        assert.match(src, /note\.is_client[\s\S]{0,80}\(client\)/);
    });

    test(`${name} toggles sharing for admin notes only, then refetches`, () => {
        assert.match(src, /!note\.is_client/);
        assert.match(src, /Unshare/);
        assert.match(src, /Share with client/);
        assert.match(src, /apiFetch\('\/internal\/notes\/share', \{\s*method: 'PUT',\s*body: \{ id: note\.id, shared: !note\.shared \}/);
        assert.match(src, /Shared/);
        assert.match(src, /Private/);
        const handler = src.match(/(?:handleToggleShare|toggleShare) = async[\s\S]*?\n {2,4}\};/)[0];
        assert.match(handler, /fetchNotes\(\)/);
    });
}

test('NoteList sorts by author, has no Status column, shows part number', () => {
    const src = files['NoteList.js'];
    assert.match(src, /handleSort\('author'\)/);
    assert.doesNotMatch(src, /admin_name|Admin Name|handleSort\('status'\)/);
    assert.match(src, /note\.job_number \?\? note\.part_number/);
});

test('NoteList only navigates on row click when jobid is set', () => {
    const src = files['NoteList.js'];
    assert.match(src, /if \(jobId\) navigate/);
    assert.match(src, /e\.stopPropagation\(\)/);
});
