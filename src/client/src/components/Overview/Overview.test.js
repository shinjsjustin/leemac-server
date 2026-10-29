import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Overview from './Overview';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <>{children}</>);
jest.mock('../PdfImage', () => ({ PdfThumbnail: () => <div className="thumb" /> }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

const part = (over) => ({
  job_part_id: 1, part_id: 11, number: 'HSX2-0870', rev: 'C', description: 'Bracket', material: '6061', finish: 'Anodize',
  quantity: 10, price: 12.5, status: 'running_machine_a', urgent: false, waiting: false, since: null, paired: false, ...over,
});

const OVERVIEW = {
  headline: { active_parts: 3, open_value: 1250, due_soon: 1, overdue: 0, invoices_waiting: { count: 2, total: 900 } },
  contacts: [{ attention: 'Kim', count: 2 }],
  jobs: [
    { id: 100, job_number: '13804', company_name: 'Acme', attention: 'Kim', po_number: 'PO1', parts: [part({}), part({ job_part_id: 2, number: 'CVO-1140', status: 'qa' })] },
    { id: 101, job_number: '13805', company_name: 'Beta', attention: 'Lee', po_number: 'PO2', parts: [part({ job_part_id: 3, number: 'NGM-5521', status: 'qa', price: undefined })] },
  ],
};

const setup = async (data = OVERVIEW) => {
  apiFetch.mockImplementation(async (path) => {
    if (path === '/internal/job/overview') return reply(data);
    if (path.startsWith('/internal/part/getblob')) return reply([]);
    throw new Error(`unexpected ${path}`);
  });
  let view;
  await act(async () => { view = render(<Overview />); });
  const c = view.container;
  return {
    c,
    click: (el) => act(async () => { el.click(); }),
    btn: (text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text)),
    cell: (label) => [...c.querySelectorAll('.ov-strip button')].find((b) => b.textContent.startsWith(label)),
    rows: () => [...c.querySelectorAll('.ov-prow')].map((r) => r.querySelector('.pn').firstChild.textContent),
  };
};

afterEach(() => { apiFetch.mockReset(); document.body.innerHTML = ''; });

test('shows the headline band and hides absent fields', async () => {
  const { c } = await setup();
  const tiles = [...c.querySelectorAll('.ov-tile')].map((t) => t.textContent);
  expect(tiles).toEqual([
    expect.stringContaining('3Active parts'),
    expect.stringContaining('$1,250.00Open value'),
    expect.stringContaining('1Due this week'),
    expect.stringContaining('0Overdue'),
    expect.stringContaining('2Invoices waiting'),
  ]);
  expect(c.querySelector('.ov-tile:last-child').textContent).toContain('$900.00');
});

test('skips headline tiles the server left out', async () => {
  const { c } = await setup({ ...OVERVIEW, headline: { active_parts: 3, due_soon: 0, overdue: 0 } });
  const text = [...c.querySelectorAll('.ov-tile')].map((t) => t.textContent).join('|');
  expect(text).not.toContain('Open value');
  expect(text).not.toContain('Invoices waiting');
  expect(c.querySelectorAll('.ov-tile')).toHaveLength(3);
});

test('shows contact chips and an 11-cell strip with counts', async () => {
  const { c, cell } = await setup();
  expect(c.querySelector('.ov-contacts').textContent).toContain('Kim');
  expect(c.querySelectorAll('.ov-strip button')).toHaveLength(11);
  expect(cell('Machining').textContent).toContain('1');
  expect(cell('Inspection').textContent).toContain('2');
});

test('clicking a strip cell filters rows and clicking it again clears the filter', async () => {
  const { click, cell, rows } = await setup();
  expect(rows()).toHaveLength(3);
  await click(cell('Inspection'));
  expect(rows().map((t) => t.replace(/\s.*/, ''))).toEqual(['CVO-1140', 'NGM-5521']);
  await click(cell('Inspection'));
  expect(rows()).toHaveLength(3);
});

test('a part row shows its facts, line total, and tiles; no line when price is absent', async () => {
  const { c } = await setup();
  const [first, , third] = c.querySelectorAll('.ov-prow');
  expect(first.textContent).toContain('HSX2-0870');
  expect(first.textContent).toContain('C');
  expect(first.textContent).toContain('Bracket');
  expect(first.textContent).toContain('6061');
  expect(first.textContent).toContain('Anodize');
  expect(first.querySelector('.px').textContent).toBe('10 × $12.50 = $125.00');
  expect(third.querySelector('.px').textContent).toBe('Qty 10');
  const tiles = [...first.querySelectorAll('.acts button')].map((b) => b.textContent);
  expect(tiles).toEqual(['Finish → Done', 'Note', 'Pair NFC']);
  expect(first.querySelector('.stage-control')).not.toBeNull();
});

test('clicking a stage updates the row and shows the toast, and Undo restores the previous stage', async () => {
  const { c, click, btn } = await setup();
  const calls = [];
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => {
    if (path.includes('setstarstage')) {
      calls.push(opts.body.status);
      return reply({ status: opts.body.status, previous: opts.body.status === 'qa' ? 'running_machine_a' : 'qa' });
    }
    return base(path, opts);
  });
  const first = () => c.querySelector('.ov-prow');
  await click(first().querySelector('.stagebar button[title="Inspection"]'));
  expect(calls).toEqual(['qa']);
  expect(first().querySelector('.chip').textContent).toContain('Inspection');
  expect(c.querySelector('.ov-toast .msg').textContent).toBe('Client portal updated · Undo');
  await click(btn('Undo'));
  expect(calls).toEqual(['qa', 'running_machine_a']);
  expect(first().querySelector('.chip').textContent).toContain('Machining');
  expect(btn('Undo')).toBeUndefined();
});

test('Finish → Done calls finishpart and moves the row to Done', async () => {
  const { c, click } = await setup();
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => (
    path.includes('finishpart') ? reply({ status: 'done', previous: 'running_machine_a' }) : base(path, opts)
  ));
  await click(c.querySelector('.ov-prow .acts button'));
  expect(c.querySelector('.ov-prow .chip').textContent).toContain('Done');
});

test('a failed stage call shows an error toast and leaves the row unchanged', async () => {
  const { c, click } = await setup();
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => (
    path.includes('setstarstage') ? reply({ error: 'nope' }, false) : base(path, opts)
  ));
  await click(c.querySelector('.ov-prow .stagebar button[title="Inspection"]'));
  expect(c.querySelector('.ov-toast').textContent).toContain('nope');
  expect(c.querySelector('.ov-prow .chip').textContent).toContain('Machine A');
});

test('Unstar removes the part row', async () => {
  const { c, click, btn, rows } = await setup();
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => (
    path.includes('unstarjob') ? reply({}) : base(path, opts)
  ));
  await click(btn('Unstar'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/unstarjob', { method: 'DELETE', body: { jobPartId: 1 } });
  expect(rows()).toHaveLength(2);
});

test('a failed Unstar shows an error toast and keeps the row', async () => {
  const { c, click, btn, rows } = await setup();
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => (
    path.includes('unstarjob') ? reply({ error: 'locked' }, false) : base(path, opts)
  ));
  await click(btn('Unstar'));
  expect(c.querySelector('.ov-toast').textContent).toContain('locked');
  expect(rows()).toHaveLength(3);
});
