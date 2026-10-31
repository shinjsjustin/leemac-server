const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isChargeLine } = require('../../src/lib/chargeLines');

const cases = [
    [{ details: '*Fee', part_description: 'Bracket' }, true],
    [{ details: '*Setup', part_description: null }, true],
    [{ details: '*Expedite', part_description: 'Bracket' }, true],
    [{ details: '*', part_description: null }, false],
    [{ details: '*AL6061', part_description: 'Nut Mount' }, false],
    [{ details: '*AL6061 *Clear Anodize', part_description: 'Bracket' }, false],
    [{ details: '*AL6061', part_description: 'Slot Valve Setup Sensor Gauge' }, false],
    [{ details: '*Feeder', part_description: 'Bracket' }, false],
    [{ details: null, part_description: 'Drawing Fee' }, true],
    [{ details: null, part_description: 'RUSH EXPEDITE charge' }, true],
    [{ details: '', part_description: 'expedite' }, true],
    [{ details: null, part_description: 'Coffee tray' }, false],
    [{ details: 'deburr *Fee', part_description: 'Bracket' }, false],
    [{ details: null, part_description: 'Expedited bracket' }, false],
    [{ details: null, part_description: null }, false],
    [{}, false],
];

for (const [line, expected] of cases) {
    test(`isChargeLine(${JSON.stringify(line)}) is ${expected}`, () => {
        assert.equal(isChargeLine(line), expected);
    });
}
