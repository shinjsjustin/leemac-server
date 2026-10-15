const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/AdminComponents');
const addPart = fs.readFileSync(path.join(dir, 'AddPart.js'), 'utf8');
const job = fs.readFileSync(path.join(dir, 'Job.js'), 'utf8');

const FIELDS = ['material', 'finish', 'stock_size'];
const EDIT_KEY = { material: 'newMaterial', finish: 'newFinish', stock_size: 'newStockSize' };

test('AddPart price input allows cents', () => {
    assert.match(addPart, /step="0\.01"\s+min="0"\s+placeholder='Unit Price'/);
});

for (const f of FIELDS) {
    test(`AddPart has state, input and request body for ${f}`, () => {
        assert.match(addPart, new RegExp(`const \\[${f}, set\\w+\\] = useState`));
        assert.match(addPart, new RegExp(`value=\\{${f}\\}`));
        assert.match(addPart, new RegExp(`historyItem\\.${f}`));
        const body = addPart.match(/\/internal\/job\/jobpartjoin[\s\S]*?body: \{([\s\S]*?)\}/)[1];
        assert.match(body, new RegExp(`\\b${f}\\b`));
    });

    test(`Job edits ${f} per part and sends it to updatejobpartjoin`, () => {
        assert.match(job, new RegExp(`defaultValue=\\{part\\.${f}\\}`));
        assert.match(job, new RegExp(`part\\.${EDIT_KEY[f]} = e\\.target\\.value`));
        const body = job.match(/\/internal\/job\/updatejobpartjoin[\s\S]*?body: \{([\s\S]*?)\}/)[1];
        assert.match(body, new RegExp(`\\b${f}\\b`));
    });
}

test('Job still renders part details', () => {
    assert.match(job, /defaultValue=\{part\.details\}/);
    assert.match(job, /\{part\.details\}/);
});

test('Job lists, downloads and uploads job files', () => {
    assert.match(job, /\/internal\/job\/files\?jobId=/);
    assert.match(job, /\/internal\/part\/blob\/download\?fileID=/);
    assert.match(job, /\/internal\/job\/uploadfile\?id=/);
    assert.match(job, /formData\.append\('files'/);
});
