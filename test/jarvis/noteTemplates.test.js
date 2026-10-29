const { test } = require('node:test');
const assert = require('node:assert');
const templates = require('../../src/lib/ai/requestTemplates');

const { buildRequestFromTemplate, getTemplateKeys } = templates;

test('template keys include share_note and not update_note_status', () => {
    const keys = getTemplateKeys();
    assert.ok(keys.includes('share_note'));
    assert.ok(!keys.includes('update_note_status'));
});

test('share_note builds a PUT to the share endpoint with id and shared', () => {
    assert.deepStrictEqual(buildRequestFromTemplate('share_note', { id: 5, shared: 1 }), {
        endpoint: '/api/internal/notes/share',
        method: 'PUT',
        body: { id: 5, shared: 1 },
    });
});

test('share_note accepts shared 0', () => {
    assert.deepStrictEqual(buildRequestFromTemplate('share_note', { id: 5, shared: 0 }).body, { id: 5, shared: 0 });
});

for (const shared of [2, -1, 'yes']) {
    test(`share_note rejects shared value ${JSON.stringify(shared)}`, () => {
        assert.throws(() => buildRequestFromTemplate('share_note', { id: 5, shared }), /invalid value for "shared"/);
    });
}

test('VALID_NOTE_STATUSES is no longer exported', () => {
    assert.strictEqual(templates.VALID_NOTE_STATUSES, undefined);
});

test('stakes loads and tiers share_note as mid', () => {
    const stakes = require('../../src/lib/ai/agents/stakes');
    const tier = stakes.STAKES ? stakes.STAKES.share_note : undefined;
    assert.strictEqual(tier, 'mid');
});
