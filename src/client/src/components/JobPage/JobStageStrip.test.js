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

test('renders nothing above the phone breakpoint', async () => {
  const c = await mount(<JobStageStrip parts={parts} stages={stages} />);
  expect(c.children).toHaveLength(0);
});

describe('on a phone', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = jest.fn((q) => ({
      matches: q === '(max-width: 600px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => { window.matchMedia = original; });

  test('replaces bars with count chips in stage order, Not starred last', async () => {
    const c = await mount(<JobStageStrip parts={parts} stages={stages} />);
    expect(c.querySelector('.jh-cap').textContent).toBe('Stages');
    const chips = [...c.querySelectorAll('.jh-sums .jh-sum')];
    expect(chips.map((s) => s.textContent)).toEqual(['Machining 1', 'Inspection 1', 'Not starred 1']);
    expect(chips[0].style.getPropertyValue('--sc')).toBe('var(--s-machining)');
    expect(chips[1].style.getPropertyValue('--sc')).toBe('var(--s-inspection)');
    expect(chips[2].style.getPropertyValue('--sc')).toBe('');
  });

  test('counts unmatched status under In the shop before stage chips', async () => {
    const odd = [
      { job_part_id: 1, starred: true, status: 'qa' },
      { job_part_id: 2, starred: true, status: 'bogus' },
      { job_part_id: 3, starred: true, status: 'bogus' },
    ];
    const c = await mount(<JobStageStrip parts={parts} stages={odd} />);
    const chips = [...c.querySelectorAll('.jh-sum')];
    expect(chips.map((s) => s.textContent)).toEqual(['In the shop 2', 'Inspection 1']);
  });

  test('counts parts missing from stages as Not starred', async () => {
    const c = await mount(<JobStageStrip parts={parts} stages={[]} />);
    expect([...c.querySelectorAll('.jh-sum')].map((s) => s.textContent)).toEqual(['Not starred 3']);
  });
});
