import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Emails from './Emails';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMAILS = [
  { id: 1, message_id: 'abc@example.com', subject: 'Quote for brackets', from: 'buyer@example.com', date: '2026-11-03' },
  { id: 2, message_id: 'def@example.com', subject: '', from: 'other@example.com', date: '2026-11-04' },
];
const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => body });

async function mount(props) {
  let view;
  await act(async () => {
    view = render(<Emails {...props} />);
  });
  return view;
}
const rows = (view) => [...view.container.querySelectorAll('li')];
const byText = (el, tag, text) => [...el.querySelectorAll(tag)].find((e) => e.textContent.trim() === text);
const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  apiFetch.mockResolvedValue(reply({ emails: EMAILS }));
  window.confirm = jest.fn(() => true);
});

test('loads a job page emails by jobId and a part page emails by partId', async () => {
  await mount({ jobId: '100' });
  expect(apiFetch).toHaveBeenCalledWith('/internal/emails?jobId=100');
  apiFetch.mockClear();
  await mount({ partId: '9000' });
  expect(apiFetch).toHaveBeenCalledWith('/internal/emails?partId=9000');
});

test('each row shows its subject, an Open link and a Delete button', async () => {
  const view = await mount({ jobId: '100' });
  const [first, second] = rows(view);
  expect(first.textContent).toBe('Quote for brackets' + 'Open' + 'Delete');
  expect(second.textContent).toBe('(no subject)' + 'Open' + 'Delete');
  expect(byText(first, 'a', 'Open').getAttribute('href')).toBe('message://%3Cabc%40example.com%3E');
  expect(byText(first, 'button', 'Delete')).toBeTruthy();
});

test('shows no Copy button, sender, date or add form', async () => {
  const view = await mount({ partId: '9000' });
  const text = view.container.textContent;
  expect(text).not.toContain('Copy');
  expect(text).not.toContain('buyer@example.com');
  expect(text).not.toContain('2026');
  expect(view.container.querySelector('form, input')).toBeNull();
});

test('Delete posts the id after confirming, then reloads', async () => {
  const view = await mount({ jobId: '100' });
  apiFetch.mockClear();
  await click(byText(rows(view)[0], 'button', 'Delete'));
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(apiFetch).toHaveBeenNthCalledWith(1, '/internal/emails/remove', { method: 'POST', body: { id: 1 } });
  expect(apiFetch).toHaveBeenNthCalledWith(2, '/internal/emails?jobId=100');
});

test('Delete does nothing when the confirm is declined', async () => {
  window.confirm = jest.fn(() => false);
  const view = await mount({ jobId: '100' });
  apiFetch.mockClear();
  await click(byText(rows(view)[0], 'button', 'Delete'));
  expect(apiFetch).not.toHaveBeenCalled();
});

test('a refused Delete shows the server error text and keeps the list', async () => {
  const view = await mount({ jobId: '100' });
  apiFetch.mockResolvedValueOnce(reply({ error: 'Level 3 required' }, false));
  await click(byText(rows(view)[0], 'button', 'Delete'));
  expect(view.container.textContent).toContain('Level 3 required');
  expect(rows(view)).toHaveLength(2);
});
