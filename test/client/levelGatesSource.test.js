const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/AdminComponents');
const pageDir = path.join(dir, '../JobPage');
const readPage = (f) => fs.readFileSync(path.join(pageDir, f), 'utf8');
const header = readPage('JobHeader.js');
const billing = readPage('JobBilling.js');
const expenses = readPage('JobExpenses.js');
const part = fs.readFileSync(path.join(dir, 'Part.js'), 'utf8');

test('JobExpenses fetchExpenses returns before calling the API below level 3', () => {
    assert.match(expenses, /const EXPENSE_LEVEL = 3;/);
    assert.match(expenses, /const fetchExpenses = useCallback\(async \(\) => \{\s*if \(accessLevel < EXPENSE_LEVEL\) return;[\s\S]*?\/internal\/expenses\/byjob/);
});

test('JobExpenses section renders nothing below level 3', () => {
    assert.match(expenses, /if \(accessLevel < EXPENSE_LEVEL\) return null;/);
});

test('JobHeader export menu and populate button render only at level 3', () => {
    assert.match(header, /const EXPORT_LEVEL = 3;/);
    assert.match(header, /const canExport = accessLevel >= EXPORT_LEVEL;/);
    assert.match(header, /\{canExport && \(\s*<div className="jh-menu-wrap">[\s\S]*?onClick=\{\(\) => setShowExportMenu/);
    assert.match(header, /\{canExport && <button className="jh-btn" onClick=\{handlePopulateSheetClick\}/);
});

test('JobBilling update-invoice button renders only at level 3', () => {
    assert.match(billing, /const INVOICE_LEVEL = 3;/);
    assert.match(billing, /\{accessLevel >= INVOICE_LEVEL && \(\s*<button[^>]*?onClick=\{handleUpdateInvoice\}/);
});

test('Part delete part button renders only at level 3', () => {
    assert.match(part, /\{accessLevel >= 3 && \(\s*<button[^>]*?onClick=\{handleDeletePart\}/);
});

test('Part file delete button renders only at level 3', () => {
    assert.match(part, /\{accessLevel >= 3 && \(\s*<button[^>]*?onClick=\{\(\) => handleFileDelete\(file\)\}/);
});
