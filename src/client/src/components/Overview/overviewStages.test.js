import { STAGES, stageOfStatus, chipText } from './overviewStages';

test('lists the 11 stages in order with Korean and short labels', () => {
  expect(STAGES).toHaveLength(11);
  expect(STAGES[0]).toEqual({ key: 'quoted', label: 'Quoted', ko: '견적', short: 'Quote', subs: [['quoted', 'Awaiting PO']] });
  expect(STAGES[3].subs.map(([k]) => k)).toEqual(['running_machine_a', 'running_machine_d', 'running_manual']);
  expect(STAGES[10].key).toBe('invoiced');
});

test.each([
  ['quoted', 0],
  ['waiting_material', 1],
  ['running_manual', 3],
  ['qa', 6],
  ['invoiced', 10],
  ['open', -1],
])('stageOfStatus(%s) is %i', (status, index) => {
  expect(stageOfStatus(status)).toBe(index);
});

test.each([
  ['running_machine_a', 'Machining · Machine A'],
  ['setup', 'Preparing · Setup'],
  ['qa', 'Inspection'],
  ['delivered', 'Delivered'],
  ['open', 'In the shop'],
])('chipText(%s) is %s', (status, text) => {
  expect(chipText(status)).toBe(text);
});
