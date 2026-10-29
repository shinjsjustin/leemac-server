import React, { act } from 'react';
import { render } from '../../testUtils/render';
import JobStageStrip from './JobStageStrip';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const parts = [
  { job_part_id: 1, number: 'A-1' },
  { job_part_id: 2, number: 'A-2' },
  { job_part_id: 3, number: 'A-3' },
];
const stages = [
  { job_part_id: 1, starred: true, status: 'running_machine_a' },
  { job_part_id: 2, starred: false, status: null },
  { job_part_id: 3, starred: true, status: 'qa' },
];

const mount = async (el) => {
  let view;
  await act(async () => { view = render(el); });
  return view.container;
};
afterEach(() => { document.body.innerHTML = ''; });

test('shows one bar per part labelled with its number and stage', async () => {
  const c = await mount(<JobStageStrip parts={parts} stages={stages} />);
  const bars = [...c.querySelectorAll('.jh-bar')];
  expect(bars.map((b) => b.textContent)).toEqual([
    'A-1 · Machining · Machine A',
    'A-2 · Not starred',
    'A-3 · Inspection',
  ]);
});

test('colours each bar by its stage and leaves unstarred bars uncoloured', async () => {
  const c = await mount(<JobStageStrip parts={parts} stages={stages} />);
  const bars = [...c.querySelectorAll('.jh-bar')];
  expect(bars[0].style.getPropertyValue('--sc')).toBe('var(--s-machining)');
  expect(bars[1].style.getPropertyValue('--sc')).toBe('');
  expect(bars[2].style.getPropertyValue('--sc')).toBe('var(--s-inspection)');
});

test('treats a part missing from stages as not starred', async () => {
  const c = await mount(<JobStageStrip parts={parts} stages={[]} />);
  expect(c.querySelectorAll('.jh-bar')[0].textContent).toBe('A-1 · Not starred');
});
