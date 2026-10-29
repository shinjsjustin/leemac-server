import React, { act } from 'react';
import { render } from '../../testUtils/render';
import StageBoard from './StageBoard';
import Overview from './Overview';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../AdminLayout/AdminLayout', () => ({ actions, children }) => <>{actions}{children}</>);
jest.mock('../PdfImage', () => ({ PdfThumbnail: () => <div className="thumb" /> }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const part = (over) => ({ job_part_id: 1, part_id: 11, number: 'P-1', status: 'qa', urgent: false, waiting: false, ...over });

const JOBS = [
  { id: 100, job_number: '13804', company_name: 'Acme', parts: [
    part({ job_part_id: 1, number: 'A-1', status: 'running_machine_a', urgent: true }),
    part({ job_part_id: 2, number: 'A-2', status: 'qa', waiting: true }),
    part({ job_part_id: 3, number: 'A-3', status: 'quoted' }),
    part({ job_part_id: 4, number: 'A-4', status: 'open' }),
  ] },
  { id: 101, job_number: '13805', company_name: 'Beta', parts: [
    part({ job_part_id: 5, number: 'B-1', status: 'done' }),
    part({ job_part_id: 6, number: 'B-2', status: 'invoiced' }),
    part({ job_part_id: 7, number: 'B-3', status: 'packing' }),
  ] },
];

const mount = async (el) => {
  let view;
  await act(async () => { view = render(el); });
  return view.container;
};
const click = (el) => act(async () => { el.click(); });
const col = (c, label) => [...c.querySelectorAll('.sb-col')].find((x) => x.querySelector('h3 b').textContent === label);

afterEach(() => { apiFetch.mockReset(); document.body.innerHTML = ''; });

test('shows the seven working columns in order with counts', async () => {
  const c = await mount(<StageBoard jobs={JOBS} onOpenJob={() => {}} />);
  expect([...c.querySelectorAll('.sb-col h3 b')].map((b) => b.textContent)).toEqual([
    'Material', 'Preparing', 'Machining', 'Outside finishing', 'Finishing', 'Inspection', 'Packing',
  ]);
  const machining = col(c, 'Machining');
  expect(machining.querySelector('h3').textContent).toContain('가공');
  expect(machining.querySelector('h3 i').textContent).toBe('1');
  expect(col(c, 'Material').querySelector('h3 i').textContent).toBe('0');
});

test('card shows part, job, company, chip text and marks', async () => {
  const c = await mount(<StageBoard jobs={JOBS} onOpenJob={() => {}} />);
  const card = col(c, 'Machining').querySelector('.sb-card');
  expect(card.textContent).toContain('A-1');
  expect(card.textContent).toContain('13804');
  expect(card.textContent).toContain('Acme');
  expect(card.textContent).toContain('Machining · Machine A');
  expect(card.textContent).toContain('Urgent');
  expect(card.textContent).not.toContain('Waiting');
  expect(col(c, 'Inspection').querySelector('.sb-card').textContent).toContain('Waiting');
});

test('folds Quoted and open on the left, Done to Invoiced on the right', async () => {
  const c = await mount(<StageBoard jobs={JOBS} onOpenJob={() => {}} />);
  const stacks = [...c.querySelectorAll('.sb-stack')];
  expect(stacks).toHaveLength(2);
  expect(stacks[0].textContent).toContain('A-3');
  expect(stacks[0].textContent).toContain('A-4');
  expect(stacks[0].querySelector('h3 i').textContent).toBe('2');
  expect(stacks[0].textContent).not.toContain('B-1');
  expect(stacks[1].textContent).toContain('B-1');
  expect(stacks[1].textContent).toContain('B-2');
  expect(stacks[1].querySelector('h3 i').textContent).toBe('2');
});

test('clicking a card opens its job', async () => {
  const onOpenJob = jest.fn();
  const c = await mount(<StageBoard jobs={JOBS} onOpenJob={onOpenJob} />);
  await click(col(c, 'Packing').querySelector('.sb-card'));
  expect(onOpenJob).toHaveBeenCalledWith(101);
  expect(c.querySelector('[draggable="true"]')).toBeNull();
});

describe('Overview toggle', () => {
  const setup = async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/internal/job/overview') {
        return { ok: true, json: async () => ({ headline: {}, contacts: [], jobs: JOBS.map((j) => ({ ...j, attention: '', po_number: '' })) }) };
      }
      return { ok: true, json: async () => [] };
    });
    return mount(<Overview />);
  };
  const btn = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

  test('switches between list and stage board', async () => {
    const c = await setup();
    expect(c.querySelector('.ov-prow')).not.toBeNull();
    expect(c.querySelector('.sb-col')).toBeNull();
    await click(btn(c, 'Stage board'));
    expect(c.querySelector('.sb-col')).not.toBeNull();
    expect(c.querySelector('.ov-prow')).toBeNull();
    await click(btn(c, 'List'));
    expect(c.querySelector('.ov-prow')).not.toBeNull();
  });

  test('stage strip filter applies to the board', async () => {
    const c = await setup();
    await click(btn(c, 'Stage board'));
    await click([...c.querySelectorAll('.ov-strip button')].find((b) => b.textContent.startsWith('Inspection')));
    expect(c.querySelectorAll('.sb-card')).toHaveLength(1);
    expect(c.querySelector('.sb-card').textContent).toContain('A-2');
  });
});
