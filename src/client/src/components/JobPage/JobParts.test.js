import React, { act, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { render } from '../../testUtils/render';
import JobParts from './JobParts';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../Overview/PartRow', () => ({ DrawingThumb: ({ partId }) => <i className="thumb">{`thumb-${partId}`}</i> }));
jest.mock('./PartDrawingStrip', () => ({ partId }) => <i className="strip">{`strip-${partId}`}</i>);
jest.mock('../AdminComponents/AddPart', () => ({ jobId, onPartAdded }) => (
  <button type="button" onClick={() => onPartAdded({ id: 9, job_part_id: 99, number: 'NEW', quantity: 1 })}>
    mock add part {jobId}
  </button>
));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const JOB = { subtotal: 100, tax: 9.13, total_cost: 109.13 };
const PARTS = [
  { id: 11, job_part_id: 1, number: 'A-1', rev: 'B', description: 'Bracket', details: 'deburr', note: 'n1', material: '6061', finish: 'anodize', stock_size: '2x2', quantity: 4, price: 12.5 },
  { id: 12, job_part_id: 2, number: 'A-2', rev: 'A', description: 'Plate', details: '', note: '', material: '304', finish: '', stock_size: '', quantity: 2, price: 25 },
];
const STAGES = [
  { job_part_id: 1, starred: true, status: 'running_machine_a', urgent: false, waiting: false, changed_at: '2026-10-29T08:00:00.000Z' },
  { job_part_id: 2, starred: false, status: null, urgent: false, waiting: false, changed_at: null },
];

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;
let latestParts;
function Host(props) {
  const [parts, setParts] = useState(props.parts || PARTS);
  latestParts = parts;
  return (
    <>
      <Where />
      <JobParts jobId={55} job={JOB} stages={STAGES} accessLevel={3} onStagesChanged={jest.fn()} onJobChanged={jest.fn()} {...props} parts={parts} setParts={setParts} />
    </>
  );
}

const mount = async (props = {}) => {
  let view;
  await act(async () => { view = render(<Host {...props} />); });
  return view.container;
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));
const buttons = (c, text) => [...c.querySelectorAll('button')].filter((b) => b.textContent.startsWith(text));
const click = (el) => act(async () => { el.click(); });
const type = (input, value) => act(async () => {
  const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });

beforeEach(() => {
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.resetAllMocks(); jest.restoreAllMocks(); document.body.innerHTML = ''; });

const fields = (part) => Object.fromEntries(
  [...part.querySelectorAll('.jp-f')].map((f) => [f.querySelector('small').textContent, f.querySelector('span').textContent])
);

test('shows thumb, number, description and the job totals', async () => {
  const c = await mount();
  const first = c.querySelectorAll('.jp-part')[0].textContent;
  expect([...c.querySelectorAll('.thumb')].map((t) => t.textContent)).toEqual(['thumb-11', 'thumb-12']);
  ['A-1', 'Bracket'].forEach((t) => expect(first).toContain(t));
  const totals = c.querySelector('.jp-tot').textContent;
  ['$100.00', '$9.13', '$109.13'].forEach((t) => expect(totals).toContain(t));
});

test('a level 3 part is a labelled grid of rev, details, material, finish, stock size, quantity, price, line total and note', async () => {
  const c = await mount();
  expect(fields(c.querySelectorAll('.jp-part')[0])).toEqual({
    Rev: 'B', Details: 'deburr', Material: '6061', Finish: 'anodize', 'Stock size': '2x2',
    Quantity: '4', Price: '$12.50', 'Line total': '$50.00', Note: 'n1',
  });
});

test('empty values show a dash', async () => {
  const c = await mount();
  const second = fields(c.querySelectorAll('.jp-part')[1]);
  expect([second.Details, second.Finish, second['Stock size'], second.Note]).toEqual(['—', '—', '—', '—']);
  expect(second.Material).toBe('304');
});

test('wide parts show no stage control, chip or Not starred text', async () => {
  const c = await mount();
  const text = c.querySelector('.jp-part').textContent + c.querySelectorAll('.jp-part')[1].textContent;
  expect(c.querySelector('.stage-control')).toBeNull();
  ['Not starred', 'Urgent', 'Waiting', 'Machining'].forEach((t) => expect(text).not.toContain(t));
});

test('level 2 sees price and line total read-only and level 1 sees quantity without money', async () => {
  const one = await mount({ accessLevel: 1 });
  const oneFields = fields(one.querySelectorAll('.jp-part')[0]);
  expect(oneFields.Quantity).toBe('4');
  expect(oneFields).not.toHaveProperty('Price');
  expect(oneFields).not.toHaveProperty('Line total');
  expect(one.querySelectorAll('.jp-part')[0].textContent).not.toContain('$');
  document.body.innerHTML = '';
  const two = await mount({ accessLevel: 2 });
  const twoFields = fields(two.querySelectorAll('.jp-part')[0]);
  expect(twoFields.Price).toBe('$12.50');
  expect(twoFields['Line total']).toBe('$50.00');
  expect(two.querySelector('.jp-part input')).toBeNull();
});

test('Update all posts only edited parts and shows saved and failed results', async () => {
  apiFetch.mockResolvedValue(reply(200, { saved: [1], failed: [{ job_part_id: 2, error: 'bad rev' }] }));
  const c = await mount();
  await click(buttons(c, 'Edit part line')[0]);
  await type(c.querySelector('input[type="number"][min="1"]'), '7');
  await click(buttons(c, 'Edit part line')[1]);
  await click(button(c, 'Update all'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/updatejobparts', {
    method: 'POST', body: { jobId: 55, parts: [{ job_part_id: 1, quantity: '7' }] },
  });
  expect(c.textContent).toContain('Saved 1 part.');
  expect(latestParts[0].quantity).toBe('7');
});

test('Update all keeps failed edits and marks the failed part red', async () => {
  apiFetch.mockResolvedValue(reply(200, { saved: [], failed: [{ job_part_id: 1, error: 'bad qty' }] }));
  const c = await mount();
  await click(buttons(c, 'Edit part line')[0]);
  await type(c.querySelector('input[type="number"][min="1"]'), '0');
  await click(button(c, 'Update all'));
  expect(c.textContent).toContain('A-1: bad qty');
  expect(c.querySelectorAll('.jp-part')[0].className).toContain('failed');
  expect(button(c, 'Update all').disabled).toBe(false);
});

test.each([[0], [1], [2]])('level %i has no editing controls but can open a part', async (level) => {
  const c = await mount({ accessLevel: level });
  ['Edit part line', 'Update all', '+ Add part', 'Calculate costs'].forEach((t) => expect(button(c, t)).toBeUndefined());
  expect(buttons(c, 'Open part')).toHaveLength(2);
});

test('level 3 offers every editing control and the price field', async () => {
  const c = await mount({ accessLevel: 3 });
  ['+ Add part', 'Update all', 'Calculate costs'].forEach((t) => expect(button(c, t)).toBeDefined());
  await click(buttons(c, 'Edit part line')[0]);
  expect(c.querySelector('input[step="0.01"]')).not.toBeNull();
});

test('per-line Update posts updatejobpartjoin with edits and refreshes the job', async () => {
  const onJobChanged = jest.fn();
  apiFetch.mockResolvedValue(reply(200, {}));
  const c = await mount({ onJobChanged });
  await click(buttons(c, 'Edit part line')[0]);
  await type(c.querySelector('textarea'), 'new note');
  await click(buttons(c, 'Update').find((b) => b.textContent === 'Update'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/updatejobpartjoin', {
    method: 'POST',
    body: { jobId: 55, partId: 11, quantity: 4, price: 12.5, rev: 'B', details: 'deburr', note: 'new note', material: '6061', finish: 'anodize', stock_size: '2x2' },
  });
  expect(onJobChanged).toHaveBeenCalled();
});

test('Add part opens AddPart, appends the new part and closes', async () => {
  const onJobChanged = jest.fn();
  const c = await mount({ onJobChanged });
  await click(button(c, '+ Add part'));
  expect(document.body.textContent).toContain('mock add part 55');
  await click(button(document.body, 'mock add part'));
  expect(latestParts.map((p) => p.number)).toEqual(['A-1', 'A-2', 'NEW']);
  expect(document.body.textContent).not.toContain('mock add part');
  expect(onJobChanged).toHaveBeenCalled();
});

test('Open part navigates to /part/:id', async () => {
  const c = await mount();
  await click(buttons(c, 'Open part')[0]);
  expect(c.querySelector('[data-testid="where"]').textContent).toBe('/part/11');
});

test('Remove at level 3 deletes after confirm and drops the part; hidden below level 3', async () => {
  apiFetch.mockResolvedValue(reply(200, {}));
  const c = await mount();
  await click(buttons(c, 'Remove')[0]);
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/jobpartremove', { method: 'DELETE', body: { jobId: 55, partId: 11 } });
  expect(latestParts.map((p) => p.number)).toEqual(['A-2']);
  document.body.innerHTML = '';
  const low = await mount({ accessLevel: 2 });
  expect(button(low, 'Remove')).toBeUndefined();
});

test('Remove keeps the part when the server refuses', async () => {
  apiFetch.mockResolvedValue(reply(500, { error: 'x' }));
  const c = await mount();
  await click(buttons(c, 'Remove')[0]);
  expect(latestParts).toHaveLength(2);
  expect(window.alert).toHaveBeenCalledWith('Failed to remove part.');
});

test('Calculate costs posts calculatecost and hands subtotal and total to the page', async () => {
  const onJobChanged = jest.fn();
  apiFetch.mockResolvedValue(reply(200, { subtotal: 200, total_cost: 218.26 }));
  const c = await mount({ onJobChanged });
  await click(button(c, 'Calculate costs'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/calculatecost', { method: 'POST', body: { jobId: 55 } });
  expect(onJobChanged).toHaveBeenCalledWith({ subtotal: 200, total_cost: 218.26 });
});

test.each([[0, false], [1, false], [2, true]])('level %i: totals footer shown is %s', async (level, shown) => {
  const c = await mount({ accessLevel: level });
  expect(!!c.querySelector('.jp-tot')).toBe(shown);
});

describe('on a phone', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = jest.fn((query) => ({ matches: query === '(max-width: 600px)', media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => { window.matchMedia = original; });

  test('each part is a card with number, rev and a status chip on one line', async () => {
    const c = await mount();
    const cards = c.querySelectorAll('.jp-part.jp-pcard');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.jp-pline').textContent).toContain('A-1');
    expect(cards[0].querySelector('.jp-pline').textContent).toContain('B');
    expect(cards[0].querySelector('.jp-pline .jp-chip').textContent).toBe('Machining · Machine A');
    expect(cards[1].querySelector('.jp-pline .jp-chip').textContent).toBe('Not starred');
  });

  test('card shows description, price, strip, stage control for starred only, and one actions row; no thumb', async () => {
    const c = await mount();
    const [first, second] = c.querySelectorAll('.jp-pcard');
    expect(c.querySelector('.thumb')).toBeNull();
    expect(first.textContent).toContain('Bracket');
    expect(first.textContent).toContain('4 × $12.50');
    expect(first.querySelector('.strip').textContent).toBe('strip-11');
    expect(first.querySelector('.stage-control')).not.toBeNull();
    expect(second.querySelector('.stage-control')).toBeNull();
    expect(first.querySelectorAll('.jp-acts')).toHaveLength(1);
    expect([...first.querySelectorAll('.jp-acts button')].map((b) => b.textContent)).toEqual(['Open part', 'Edit part line', 'Remove']);
  });

  test('changing a stage posts it and tells the page', async () => {
    const onStagesChanged = jest.fn();
    apiFetch.mockResolvedValue(reply(200, { status: 'qa', previous: 'running_machine_a' }));
    const c = await mount({ onStagesChanged });
    await click(c.querySelector('.jp-pcard .stage-control .chip'));
    await click([...c.querySelectorAll('.sheet .sub')].find((b) => b.textContent === 'QA check'));
    expect(apiFetch).toHaveBeenCalledWith('/internal/job/setstarstage', { method: 'PUT', body: { jobPartId: 1, status: 'qa' } });
    expect(onStagesChanged).toHaveBeenCalled();
    expect(c.querySelector('.ov-toast').textContent).toContain('Undo');
  });

  test('shows Qty n at level 1 with no edit button', async () => {
    const c = await mount({ accessLevel: 1 });
    expect(c.querySelector('.jp-pcard').textContent).toContain('Qty 4');
    expect(button(c, 'Edit part line')).toBeUndefined();
  });
});

test('wide screens keep the thumb row and no strip', async () => {
  const c = await mount();
  expect(c.querySelector('.jp-pcard')).toBeNull();
  expect(c.querySelector('.strip')).toBeNull();
});
