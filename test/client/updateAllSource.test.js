const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const clientDir = path.join(__dirname, '../../src/client/src/components');
const job = fs.readFileSync(path.join(clientDir, 'AdminComponents/Job.js'), 'utf8');

const INPUTS = [
    ['newRev', 'rev', 'e.target.value'],
    ['newDetails', 'details', 'e.target.value'],
    ['newMaterial', 'material', 'e.target.value'],
    ['newFinish', 'finish', 'e.target.value'],
    ['newStockSize', 'stock_size', 'e.target.value'],
    ['newQuantity', 'quantity', 'parseInt\\(e\\.target\\.value, 10\\)'],
    ['newPrice', 'price', 'parseFloat\\(e\\.target\\.value\\)'],
    ['newNote', 'note', 'e.target.value'],
];

test('Job keeps a partEdits state map', () => {
    assert.match(job, /const \[partEdits, setPartEdits\] = useState\(\{\}\)/);
});

for (const [prop, field] of INPUTS) {
    test(`${field} input keeps part.${prop} and records into partEdits`, () => {
        const line = job.split('\n').find((l) => l.includes(`part.${prop} =`));
        assert.ok(line, `part.${prop} assignment missing`);
        assert.match(line, new RegExp(`recordEdit\\(part, '${field}'`));
    });
}

test('recordEdit keys edits by job_part_id and records price only for level 2+', () => {
    const fn = job.match(/const recordEdit = [\s\S]*?\n    \};/)[0];
    assert.match(fn, /part\.job_part_id/);
    assert.match(fn, /field === 'price' && accessLevel < 2/);
});

test('Update all button sits beside Parts ( in an accessLevel >= 1 guard', () => {
    const header = job.match(/Parts \(\{parts\.length\}\)[\s\S]{0,1500}?Update all/);
    assert.ok(header, 'Update all not near Parts header');
    assert.match(header[0], /accessLevel >= 1/);
    assert.match(job, /e\.stopPropagation\(\);\s*handleUpdateAll\(\)/);
    assert.match(job, /disabled=\{isSavingAll \|\| Object\.keys\(partEdits\)\.length === 0\}/);
});

test('handleUpdateAll posts edited parts to updatejobparts', () => {
    const fn = job.match(/const handleUpdateAll = [\s\S]*?\n    \};/)[0];
    assert.match(fn, /\/internal\/job\/updatejobparts/);
    assert.match(fn, /jobId: id/);
    assert.match(fn, /job_part_id/);
    assert.match(fn, /\.\.\.edits/);
});

test('Update all never sends price below level 2', () => {
    const fn = job.match(/const handleUpdateAll = [\s\S]*?\n    \};/)[0];
    assert.match(fn, /accessLevel < 2/);
    assert.match(fn, /delete fields\.price/);
});

test('Update all does not refetch and keeps failed edits', () => {
    const fn = job.match(/const handleUpdateAll = [\s\S]*?\n    \};/)[0];
    assert.doesNotMatch(fn, /fetchJobDetails/);
    assert.match(fn, /setParts\(/);
    assert.match(fn, /setPartEdits\(/);
    assert.match(fn, /data\.saved/);
    assert.match(fn, /data\.failed/);
});

test('Job shows saved count, failed part numbers with errors, and red border', () => {
    assert.match(job, /Saved \{updateAllResult\.saved\} part/);
    assert.match(job, /updateAllResult\.failed\.map/);
    assert.match(job, /\{f\.error\}/);
    assert.match(job, /border: failedIds\.has\(part\.job_part_id\) \? '1px solid #c62828'/);
});

test('per-card Update clears that part edit on success', () => {
    const fn = job.match(/const handleUpdateJobPartJoin = [\s\S]*?\n    \};/)[0];
    assert.match(fn, /setPartEdits\(/);
});

test('ClientComponents never mention Update all or updatejobparts', () => {
    const dir = path.join(clientDir, 'ClientComponents');
    for (const f of fs.readdirSync(dir)) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.doesNotMatch(src, /Update all|updatejobparts/, f);
    }
});
