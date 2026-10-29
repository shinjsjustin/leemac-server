const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STAGES } = require('../../src/lib/shopStages');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/shop-stages.md'), 'utf8');
const routeDocs = fs.readFileSync(path.join(__dirname, '../../src/routes/docs/documentation.txt'), 'utf8');

test('lists every stage in order', () => {
    const positions = STAGES.map((s) => doc.indexOf('`' + s.key + '`'));
    positions.forEach((p, i) => assert.ok(p >= 0, STAGES[i].key));
    assert.deepStrictEqual([...positions].sort((a, b) => a - b), positions);
});

test('maps every star status to its stage', () => {
    const map = {
        quoted: 'quoted', open: 'in_shop', urgent: 'in_shop', waiting: 'in_shop',
        checking_stock: 'material', waiting_material: 'material', programming: 'preparing', setup: 'preparing',
        running_machine_a: 'machining', running_machine_d: 'machining', running_manual: 'machining',
        at_subvendor: 'outside_finishing', waiting_finish: 'outside_finishing', deburr_clean: 'finishing',
        qa: 'inspection', packing: 'packing', done: 'done', delivered: 'delivered', invoiced: 'invoiced',
    };
    for (const [status, stage] of Object.entries(map)) {
        assert.ok(doc.includes('| `' + status + '` | `' + stage + '` |'), status);
    }
});

test('documents the schedule, ticker, overview headline and wall', () => {
    assert.ok(doc.includes('GET /api/portal/schedule'));
    assert.ok(doc.includes('GET /api/portal/ticker'));
    assert.match(doc, /headline/);
    assert.match(doc, /wall/);
    assert.match(doc, /7 days or less/);
    assert.match(doc, /overdue/);
});

test('documents history logging, the 410 and the migration order', () => {
    assert.match(doc, /star_status_history/);
    assert.match(doc, /PUT \/api\/client\/portal\/status[^\n]*410/);
    const deploy = doc.slice(doc.indexOf('## Deploy'));
    assert.ok(doc.includes('## Deploy'));
    const backup = deploy.search(/back up the database/i);
    const migration = deploy.search(/015_star_status_history\.sql/);
    const server = deploy.search(/deploy the server/i);
    assert.ok(backup >= 0 && backup < migration && migration < server);
});

test('route docs say the client status route answers 410', () => {
    assert.match(routeDocs, /PUT\s+\/api\/client\/portal\/status[^\n]*\n[^\n]*410/);
});

test('documents stage as {key,label} for schedule timeline, board and ticker', () => {
    const schedule = doc.slice(doc.indexOf('## GET /api/portal/schedule'), doc.indexOf('## GET /api/portal/ticker'));
    const ticker = doc.slice(doc.indexOf('## GET /api/portal/ticker'), doc.indexOf('## Overview headline'));
    assert.ok((schedule.match(/`stage` as `\{ key, label \}`|`stage` is `\{ key, label \}`/g) || []).length >= 3);
    assert.ok((ticker.match(/`stage` as `\{ key, label \}`/g) || []).length >= 2);
    assert.match(doc, /`shipped` \(label Shipped\)/);
});
