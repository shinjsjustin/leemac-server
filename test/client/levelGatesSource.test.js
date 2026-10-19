const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/AdminComponents');
const job = fs.readFileSync(path.join(dir, 'Job.js'), 'utf8');
const part = fs.readFileSync(path.join(dir, 'Part.js'), 'utf8');

test('Job fetchExpenses returns before calling the API below level 3', () => {
    assert.match(job, /const fetchExpenses = useCallback\(async \(\) => \{\s*if \(accessLevel < 3\) return;[\s\S]*?\/internal\/expenses\/byjob/);
});

test('Job expenses section renders only at level 3', () => {
    assert.match(job, /\{\/\* ── Expenses ── \*\/\}\s*\{accessLevel >= 3 && <div/);
});

test('Job export menu and populate button render only at level 3', () => {
    assert.match(job, /Footer Action Bar[\s\S]*?\{accessLevel >= 3 && \(\s*<div style=\{\{ position: 'relative' \}\}>[\s\S]*?onClick=\{\(\) => setShowExportMenu/);
    assert.match(job, /\{accessLevel >= 3 && \(\s*<button\s+onClick=\{handlePopulateSheetClick\}/);
});

test('Job invoice-and-increment button renders only at level 3', () => {
    assert.match(job, /\{accessLevel >= 3 && \(\s*<button\s+onClick=\{handleUpdateInvoiceAndIncrement\}/);
});

test('Part delete part button renders only at level 3', () => {
    assert.match(part, /\{accessLevel >= 3 && \(\s*<button[^>]*?onClick=\{handleDeletePart\}/);
});

test('Part file delete button renders only at level 3', () => {
    assert.match(part, /\{accessLevel >= 3 && \(\s*<button[^>]*?onClick=\{\(\) => handleFileDelete\(file\)\}/);
});
