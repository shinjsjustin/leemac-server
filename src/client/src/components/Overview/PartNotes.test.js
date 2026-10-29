import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartNotes from './PartNotes';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('jwt-decode', () => ({ jwtDecode: () => ({ id: 7 }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOTES = [
  { id: 1, content: 'Deburr edges', author: 'Sam', is_client: false, shared: false, created_at: '2026-10-28T14:05:00Z' },
  { id: 2, content: 'Please rush', author: 'Kim', is_client: true, shared: true, created_at: '2026-10-28T15:05:00Z' },
  { id: 3, content: 'Ships Friday', author: 'Sam', is_client: false, shared: true, created_at: '2026-10-28T16:05:00Z' },
];

const setup = async (notes = NOTES, onChanged = jest.fn()) => {
  apiFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
  localStorage.setItem('token', 'tok');
  let view;
  await act(async () => { view = render(<PartNotes jobId={100} partId={11} notes={notes} onChanged={onChanged} />); });
  const c = view.container;
  return {
    c,
    onChanged,
    click: (el) => act(async () => { el.click(); }),
    btn: (text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === text),
  };
};

afterEach(() => { apiFetch.mockReset(); localStorage.clear(); document.body.innerHTML = ''; });

test('lists notes with tag, author and from client', async () => {
  const { c } = await setup();
  const items = [...c.querySelectorAll('.pnote')];
  expect(items).toHaveLength(3);
  expect(items[0].textContent).toContain('PRIVATE');
  expect(items[0].textContent).toContain('Sam');
  expect(items[0].textContent).not.toContain('from client');
  expect(items[1].textContent).toContain('SHARED');
  expect(items[1].textContent).toContain('from client');
  expect(items[2].textContent).toContain('SHARED');
});

test('admin notes get Share/Unshare, client notes get none', async () => {
  const { c } = await setup();
  const items = [...c.querySelectorAll('.pnote')];
  expect(items[0].querySelector('button').textContent).toBe('Share with client');
  expect(items[1].querySelector('button')).toBeNull();
  expect(items[2].querySelector('button').textContent).toBe('Unshare');
});

test('Share with client calls PUT share with the flipped flag and onChanged', async () => {
  const { c, click, onChanged } = await setup();
  await click(c.querySelector('.pnote button'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/notes/share', { method: 'PUT', body: { id: 1, shared: true } });
  expect(onChanged).toHaveBeenCalledTimes(1);
});

test('+ Note composer defaults to Private and posts the note', async () => {
  const { c, click, btn, onChanged } = await setup([]);
  await click(btn('+ Note'));
  const area = c.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, 'Check bore');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(btn('Save'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/notes/newnote', {
    method: 'POST', body: { content: 'Check bore', userid: 7, jobid: 100, partid: 11, shared: false },
  });
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(c.querySelector('textarea')).toBeNull();
});

test('Shared switch posts shared true', async () => {
  const { c, click, btn } = await setup([]);
  await click(btn('+ Note'));
  const area = c.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, 'x');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(btn('Shared'));
  await click(btn('Save'));
  expect(apiFetch.mock.calls[0][1].body.shared).toBe(true);
});

test('Save does nothing for an empty note', async () => {
  const { click, btn } = await setup([]);
  await click(btn('+ Note'));
  await click(btn('Save'));
  expect(apiFetch).not.toHaveBeenCalled();
});
