import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Overview from './Overview';
import { apiFetch } from '../../api/apiFetch';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));
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
  contacts: [{ attention: 'Kim', count: 2 }, { attention: 'Lee', count: 1 }],
  jobs: [
    { id: 100, job_number: '13804', company_name: 'Acme', attention: 'Kim', po_number: 'PO1', invoice_number: null, parts: [part({ attention: 'Kim' }), part({ job_part_id: 2, number: 'CVO-1140', status: 'qa', attention: 'Kim' })] },
    { id: 101, job_number: '13805', company_name: 'Beta', attention: 'Lee', po_number: 'PO2', invoice_number: 'INV-9', parts: [part({ job_part_id: 3, number: 'NGM-5521', status: 'qa', price: undefined, attention: 'Lee' })] },
  ],
};

// Overview data with part 1 moved to the given status, as the server returns it after a change.
const withStatus = (status) => ({
  ...OVERVIEW,
  jobs: [{ ...OVERVIEW.jobs[0], parts: [{ ...OVERVIEW.jobs[0].parts[0], status }, OVERVIEW.jobs[0].parts[1]] }, OVERVIEW.jobs[1]],
});

const setup = async (data = OVERVIEW) => {
  apiFetch.mockImplementation(async (path) => {
    if (path === '/internal/job/overview') return reply(data);
    if (path.startsWith('/internal/part/getblob')) return reply([]);
    if (path === '/internal/notes/newnote') return reply({});
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

afterEach(() => { mockNavigate.mockReset(); apiFetch.mockReset(); document.body.innerHTML = ''; });

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
  window.NDEFReader = function NDEFReader() {};
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
  expect(tiles).toEqual(['Finish → Done', '+ Note', 'Pair NFC']);
  expect(first.querySelector('.stage-control')).not.toBeNull();
  delete window.NDEFReader;
});

test('clicking a stage updates the row and shows the toast, and Undo restores the previous stage', async () => {
  const { c, click, btn } = await setup();
  const calls = [];
  let current = 'running_machine_a';
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => {
    if (path === '/internal/job/overview') return reply(withStatus(current));
    if (path.includes('setstarstage')) {
      calls.push(opts.body.status);
      current = opts.body.status;
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

test('a stage change refetches the overview quietly so the strip and headline update', async () => {
  const { c, click, cell } = await setup();
  const loads = () => apiFetch.mock.calls.filter(([p]) => p === '/internal/job/overview').length;
  const moved = { ...withStatus('qa'), headline: { ...OVERVIEW.headline, active_parts: 2 } };
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => {
    if (path.includes('setstarstage')) return reply({ status: 'qa', previous: 'running_machine_a' });
    if (path === '/internal/job/overview') return reply(moved);
    return base(path, opts);
  });
  expect(cell('Inspection').textContent).toContain('2');
  await click(c.querySelector('.ov-prow .stagebar button[title="Inspection"]'));
  expect(loads()).toBe(2);
  expect(cell('Inspection').textContent).toContain('3');
  expect(cell('Machining').textContent).toContain('0');
  expect(c.querySelector('.ov-tile').textContent).toContain('2Active parts');
  expect(c.textContent).not.toContain('Loading…');
});

test('a failed stage call does not refetch the overview', async () => {
  const { c, click } = await setup();
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => (
    path.includes('setstarstage') ? reply({ error: 'nope' }, false) : base(path, opts)
  ));
  await click(c.querySelector('.ov-prow .stagebar button[title="Inspection"]'));
  expect(apiFetch.mock.calls.filter(([p]) => p === '/internal/job/overview')).toHaveLength(1);
});

test('Finish → Done calls finishpart and moves the row to Done', async () => {
  const { c, click } = await setup();
  const base = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (path, opts) => {
    if (path === '/internal/job/overview') return reply(withStatus('done'));
    return path.includes('finishpart') ? reply({ status: 'done', previous: 'running_machine_a' }) : base(path, opts);
  });
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

describe('on a phone-width screen', () => {
  const original = window.matchMedia;
  const mockNarrow = (isNarrow) => {
    window.matchMedia = jest.fn((query) => ({ matches: isNarrow && query === '(max-width: 600px)', media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  };
  afterEach(() => { window.matchMedia = original; });

  test('shows a bottom tab bar with the NFC scan button in the middle', async () => {
    mockNarrow(true);
    const { c } = await setup();
    const tabs = [...c.querySelectorAll('.ov-tabbar a')];
    expect(tabs.map((a) => a.textContent)).toEqual(['Overview', 'Jobs', 'Scan', 'Notes']);
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual(['/starred-jobs', '/joblist', '/shop-update', '/notelist']);
    expect(tabs[2].className).toContain('scan');
  });

  test('has no tab bar on a wide screen', async () => {
    mockNarrow(false);
    const { c } = await setup();
    expect(c.querySelector('.ov-tabbar')).toBeNull();
  });

  test('reloads the overview after a part note is saved', async () => {
    mockNarrow(false);
    const { c, click } = await setup();
    const loads = () => apiFetch.mock.calls.filter(([p]) => p === '/internal/job/overview').length;
    expect(loads()).toBe(1);
    await click(c.querySelector('.ov-prow .acts button:not(.fin)'));
    const textarea = c.querySelector('.ov-prow textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'check burrs');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click([...c.querySelectorAll('.ov-prow .pcompose button')].find((b) => b.textContent === 'Save'));
    expect(loads()).toBe(2);
  });
});

test('each job section carries its billing state class and chip', async () => {
  const jobs = [
    { ...OVERVIEW.jobs[0], po_number: '', invoice_number: null },
    OVERVIEW.jobs[0],
    OVERVIEW.jobs[1],
  ].map((j, i) => ({ ...j, id: 200 + i, parts: [part({ job_part_id: 50 + i })] }));
  const { c } = await setup({ ...OVERVIEW, jobs });
  const sections = [...c.querySelectorAll('section.ov-job')];
  expect(sections.map((s) => s.className)).toEqual(['ov-job bill-no_po', 'ov-job bill-po', 'ov-job bill-invoiced']);
  expect(sections.map((s) => s.querySelector('span.ov-bill').textContent)).toEqual(['No PO', 'PO · no invoice', 'Invoiced']);
});

test('clicking a job number or its header opens the job page', async () => {
  const { c, click } = await setup();
  const [first, second] = c.querySelectorAll('section.ov-job');
  await click(first.querySelector('.no'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/job/100');
  await click(second.querySelector('header'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/job/101');
});

test('the job header opens the job from the keyboard', async () => {
  const { c } = await setup();
  const header = c.querySelector('section.ov-job header');
  expect(header.getAttribute('role')).toBe('link');
  expect(header.tabIndex).toBe(0);
  await act(async () => { header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(mockNavigate).toHaveBeenLastCalledWith('/job/100');
});

test('part rows no longer render an Open job link', async () => {
  const { c } = await setup();
  expect(c.textContent).not.toContain('Open job');
});

describe('contact pills', () => {
  const pills = (c) => [...c.querySelectorAll('.ov-contacts button')];
  const pill = (c, text) => pills(c).find((b) => b.textContent.startsWith(text));
  const names = (rows) => rows().map((t) => t.replace(/\s.*/, ''));

  test('shows an All pill first, one button per contact, and marks the picked one on', async () => {
    const { c, click } = await setup();
    expect(pills(c).map((b) => b.textContent.trim())).toEqual(['All', 'Kim 2', 'Lee 1']);
    expect(pills(c).map((b) => b.className.includes('on'))).toEqual([true, false, false]);
    await click(pill(c, 'Lee'));
    expect(pills(c).map((b) => b.className.includes('on'))).toEqual([false, false, true]);
  });

  test('picking a contact keeps only their parts, hides emptied jobs, and recounts the strip', async () => {
    const { c, click, cell, rows } = await setup();
    await click(pill(c, 'Kim'));
    expect(names(rows)).toEqual(['HSX2-0870', 'CVO-1140']);
    expect(c.querySelectorAll('section.ov-job')).toHaveLength(1);
    expect(cell('Inspection').textContent).toContain('1');
    expect(c.querySelector('.ov-tile').textContent).toContain('3Active parts');
  });

  test('filters by the part attention, not the job attention', async () => {
    const data = { ...OVERVIEW, jobs: [{ ...OVERVIEW.jobs[0], parts: [OVERVIEW.jobs[0].parts[0], { ...OVERVIEW.jobs[0].parts[1], attention: 'Lee' }] }] };
    const { c, click, rows } = await setup(data);
    await click(pill(c, 'Lee'));
    expect(names(rows)).toEqual(['CVO-1140']);
  });

  test('combines with the stage filter', async () => {
    const { c, click, cell, rows } = await setup();
    await click(cell('Inspection'));
    await click(pill(c, 'Kim'));
    expect(names(rows)).toEqual(['CVO-1140']);
  });

  test('clicking the picked pill again, or All, clears the contact filter', async () => {
    const { c, click, rows } = await setup();
    await click(pill(c, 'Kim'));
    await click(pill(c, 'Kim'));
    expect(rows()).toHaveLength(3);
    await click(pill(c, 'Lee'));
    expect(rows()).toHaveLength(1);
    await click(pill(c, 'All'));
    expect(rows()).toHaveLength(3);
  });
});

describe('job print menu on job headers', () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; });
  const mockNarrow = (isNarrow) => {
    window.matchMedia = jest.fn((query) => ({ matches: isNarrow && query === '(max-width: 600px)', media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  };

  test.each([['desktop', false], ['phone', true]])('every job header has a menu button on %s', async (_, isNarrow) => {
    mockNarrow(isNarrow);
    const { c } = await setup();
    const headers = [...c.querySelectorAll('.ov-job > header')];
    expect(headers).toHaveLength(2);
    headers.forEach((h) => expect(h.querySelectorAll('button[aria-label="Job options"]')).toHaveLength(1));
  });

  test('clicking the menu button does not open the job but clicking the header does', async () => {
    mockNarrow(false);
    apiFetch.mockImplementation(async () => reply({ documents: [], drawings: 0 }));
    const { c, click } = await setup();
    const header = c.querySelector('.ov-job > header');
    await click(header.querySelector('button[aria-label="Job options"]'));
    expect(mockNavigate).not.toHaveBeenCalled();
    await click(header.querySelector('.no'));
    expect(mockNavigate).toHaveBeenCalledWith('/job/100');
  });
});
