import React, { act } from 'react';
import { useLocation } from 'react-router-dom';
import { render } from '../../testUtils/render';
import CommandSearch from './CommandSearch';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch');

global.IS_REACT_ACT_ENVIRONMENT = true;

const RESULTS = {
  parts: [{ part_id: 7, number: 'HSX2-0871', description: 'Ramp cover' }],
  jobs: [{ id: 12, job_number: '13804', company_name: 'Halvorsen Storage', attention: 'Priya', po_number: 'P1' }],
  invoices: [{ job_id: 15, invoice_number: '10842', job_number: '13798', company_name: 'Kestrel Vacuum' }],
};

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

const mount = () => render(<><CommandSearch /><Where /></>);
const where = (view) => view.container.querySelector('[data-testid="where"]').textContent;
const flush = () => act(async () => { jest.advanceTimersByTime(300); });
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};
const key = (target, init) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });

beforeEach(() => {
  jest.useFakeTimers();
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true, json: async () => RESULTS });
});
afterEach(() => jest.useRealTimers());

describe('CommandSearch', () => {
  it('focuses the input on Ctrl-K and Cmd-K', async () => {
    const view = mount();
    const input = view.container.querySelector('input');
    await key(document, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(input);
    input.blur();
    await key(document, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(input);
    view.unmount();
  });

  it('does not call the API for one character', async () => {
    const view = mount();
    await type(view.container.querySelector('input'), 'H');
    expect(apiFetch).not.toHaveBeenCalled();
    view.unmount();
  });

  it('searches from 2 characters and groups Parts, Jobs and Invoices', async () => {
    const view = mount();
    await type(view.container.querySelector('input'), '08');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/internal/search?q=08');
    const c = view.container;
    expect([...c.querySelectorAll('.admin-search-results h6')].map((h) => h.textContent)).toEqual(['Parts', 'Jobs', 'Invoices']);
    expect(c.querySelectorAll('.admin-search-res')).toHaveLength(3);
    expect(c.textContent).toContain('HSX2-0871');
    expect(c.textContent).toContain('13804');
    expect(c.textContent).toContain('10842');
    view.unmount();
  });

  it('url-encodes the query', async () => {
    const view = mount();
    await type(view.container.querySelector('input'), 'a&b');
    expect(apiFetch).toHaveBeenCalledWith('/internal/search?q=a%26b');
    view.unmount();
  });

  it('opens the part on click and the job from an invoice', async () => {
    const view = mount();
    await type(view.container.querySelector('input'), '08');
    await act(async () => { view.container.querySelectorAll('.admin-search-res')[0].click(); });
    expect(where(view)).toBe('/part/7');
    await type(view.container.querySelector('input'), '09');
    await act(async () => { view.container.querySelectorAll('.admin-search-res')[2].click(); });
    expect(where(view)).toBe('/job/15');
    view.unmount();
  });

  it('moves with arrows and opens the highlighted job with Enter', async () => {
    const view = mount();
    const input = view.container.querySelector('input');
    await type(input, '08');
    await key(input, { key: 'ArrowDown' });
    await key(input, { key: 'ArrowDown' });
    await key(input, { key: 'ArrowUp' });
    await key(input, { key: 'Enter' });
    expect(where(view)).toBe('/job/12');
    view.unmount();
  });

  it('opens the first result with Enter before any arrow', async () => {
    const view = mount();
    const input = view.container.querySelector('input');
    await type(input, '08');
    await key(input, { key: 'Enter' });
    expect(where(view)).toBe('/part/7');
    view.unmount();
  });

  it('still renders and shows no results when the search fails', async () => {
    apiFetch.mockRejectedValue(new Error('down'));
    const view = mount();
    await type(view.container.querySelector('input'), '08');
    expect(view.container.querySelector('input')).not.toBeNull();
    expect(view.container.querySelectorAll('.admin-search-res')).toHaveLength(0);
    view.unmount();
  });
});
