const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const job = fs.readFileSync(
    path.join(__dirname, '../../src/client/src/components/AdminComponents/Job.js'), 'utf8');

test('Job imports runJobExport and handleExport runs it with the job id', () => {
    assert.match(job, /import \{ runJobExport \} from '\.\.\/\.\.\/api\/jobExport';/);
    assert.match(job, /const handleExport = useCallback\(async \(types\) => \{[\s\S]*?setShowExportMenu\(false\);[\s\S]*?setIsExporting\(true\);[\s\S]*?await runJobExport\(id, types\)/);
});

test('handleExport alerts the message, refreshes files when asked and clears exporting in finally', () => {
    assert.match(job, /alert\(message\);\s*if \(refresh\) fetchJobFiles\(\);[\s\S]*?finally \{\s*setIsExporting\(false\);/);
});

test('handleExport no longer populates the sheet and triggerExport is gone', () => {
    const body = job.match(/const handleExport = useCallback[\s\S]*?\n    \}, \[[^\]]*\]\);/)[0];
    assert.doesNotMatch(body, /handlePopulateSheet/);
    assert.doesNotMatch(job, /triggerExport/);
    assert.doesNotMatch(job, /action: actionType/);
});

test('export menu passes server types', () => {
    assert.match(job, /\['Quote', 'quote'\],\s*\['Order', 'order'\],\s*\['Invoice \+ Packing \+ Shipping', \['invoice', 'packing', 'shipping'\]\]/);
});

test('note post still goes to GSCRIPT_URL', () => {
    assert.match(job, /payload = \{ note:[\s\S]*?await fetch\(\s*GSCRIPT_URL/);
});

test('Export button is disabled and relabelled while exporting', () => {
    assert.match(job, /disabled=\{isExporting\}/);
    assert.match(job, /\{isExporting \? 'Exporting…' : 'Export ▾'\}/);
});
