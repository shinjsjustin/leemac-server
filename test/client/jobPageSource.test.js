const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/AdminComponents');
const addPart = fs.readFileSync(path.join(dir, 'AddPart.js'), 'utf8');
const pageDir = path.join(dir, '../JobPage');
const readPage = (f) => fs.readFileSync(path.join(pageDir, f), 'utf8');
const parts = readPage('JobParts.js');
const files = readPage('JobFiles.js');
const container = fs.readFileSync(path.join(dir, 'Job.js'), 'utf8');

const FIELDS = ['material', 'finish', 'stock_size'];
const EDIT_KEY = { material: 'newMaterial', finish: 'newFinish', stock_size: 'newStockSize' };

test('AddPart price input allows cents', () => {
    assert.match(addPart, /step="0\.01"\s+min="0"\s+placeholder='Unit Price'/);
});

for (const f of FIELDS) {
    test(`AddPart has state, input and request body for ${f}`, () => {
        assert.match(addPart, new RegExp(`const \\[${f}, set\\w+\\] = useState`));
        assert.match(addPart, new RegExp(`value=\\{${f}\\}`));
        if (f === 'stock_size') assert.match(addPart, /historyItem\.stock_size/);
        const body = addPart.match(/\/internal\/job\/jobpartjoin[\s\S]*?body: \{([\s\S]*?)\}/)[1];
        assert.match(body, new RegExp(`\\b${f}\\b`));
    });

    test(`JobParts edits ${f} per part and sends it to updatejobpartjoin`, () => {
        assert.match(parts, new RegExp(`defaultValue=\\{part\\.${f}\\}`));
        assert.match(parts, new RegExp(`part\\.${EDIT_KEY[f]} = e\\.target\\.value`));
        const body = parts.match(/\/internal\/job\/updatejobpartjoin[\s\S]*?body: \{([\s\S]*?)\}/)[1];
        assert.match(body, new RegExp(`\\b${f}\\b`));
    });
}

test('JobParts still renders part details', () => {
    assert.match(parts, /defaultValue=\{part\.details\}/);
    assert.match(parts, /\{part\.details\}/);
});

test('JobFiles lists, downloads and uploads job files', () => {
    assert.match(files, /\/internal\/job\/files\?jobId=/);
    assert.match(files, /\/internal\/part\/blob\/download\?fileID=/);
    assert.match(files, /\/internal\/job\/uploadfile\?id=/);
    assert.match(files, /formData\.append\('files'/);
});

test('Job renders the header, stage strip and both columns of the job page', () => {
    for (const c of ['JobHeader', 'JobStageStrip', 'JobParts', 'JobBilling', 'JobExpenses', 'JobNotes', 'JobFiles']) {
        assert.match(container, new RegExp(`import ${c} from '\\.\\./JobPage/${c}'`));
        assert.match(container, new RegExp(`<${c}\\b`));
    }
    assert.match(container, /<Emails jobId=\{id\} \/>/);
    const main = container.match(/className="jp-main">([\s\S]*?)<\/div>\s*<aside/)[1];
    for (const c of ['JobParts', 'JobBilling', 'JobExpenses']) assert.match(main, new RegExp(`<${c}\\b`));
    const side = container.match(/<aside[\s\S]*?<\/aside>/)[0];
    for (const c of ['JobNotes', 'JobFiles']) assert.match(side, new RegExp(`<${c}\\b`));
    assert.match(side, /<Emails jobId=\{id\} \/>/);
});

test('Job loads summary, starred flag and stages, and no longer uses Job.css', () => {
    assert.match(container, /\/internal\/job\/jobsummary\?id=/);
    assert.match(container, /\/internal\/job\/checkjobstarred\?jobId=/);
    assert.match(container, /\/internal\/job\/jobstages\?id=/);
    assert.match(container, /<AdminLayout current="jobs"/);
    assert.doesNotMatch(container, /Styling\/Job\.css/);
    assert.ok(container.split('\n').length < 300);
});
