import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientRegister from './ClientRegister';
import { listCompanies, inviteClient } from '../../api/clientInviteApi';

jest.mock('../../api/clientInviteApi');
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <div>{children}</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

const COMPANIES = [
  { id: 3, name: 'Acme' },
  { id: 7, name: 'Beta Works' },
];

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const setValue = (el, value) => act(async () => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const click = (el) => act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);
const submit = (c) => act(async () => {
  c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
});

let view;
const mount = async () => {
  view = render(<ClientRegister />);
  await flush();
  return view.container;
};
const fillPerson = async (c) => {
  await setValue(c.querySelector('input[type="email"]'), 'a@b.co');
  await setValue(c.querySelector('input[placeholder="Name"]'), 'Ann');
};
const optionIds = (c) => [...c.querySelectorAll('select option')].map((o) => o.value);

beforeEach(() => {
  jest.resetAllMocks();
  listCompanies.mockResolvedValue({ ok: true, companies: COMPANIES });
});
afterEach(() => view && view.unmount());

describe('ClientRegister', () => {
  it('invites with the chosen company id', async () => {
    inviteClient.mockResolvedValue({ ok: true, message: 'sent' });
    const c = await mount();
    await fillPerson(c);
    await setValue(c.querySelector('select'), '7');
    await submit(c);
    expect(inviteClient).toHaveBeenCalledTimes(1);
    expect(inviteClient).toHaveBeenCalledWith({ email: 'a@b.co', name: 'Ann', companyId: 7 });
    expect(c.textContent).toContain('Invite sent');
    expect(c.querySelector('select').value).toBe('');
    expect(c.querySelector('input[placeholder="Filter companies"]').value).toBe('');
  });

  it('makes no invite call and disables Send Invite when no company is chosen', async () => {
    const c = await mount();
    await fillPerson(c);
    expect(button(c, 'Send Invite').disabled).toBe(true);
    await submit(c);
    expect(inviteClient).not.toHaveBeenCalled();
  });

  it('narrows the choices as the filter is typed', async () => {
    const c = await mount();
    expect(optionIds(c)).toEqual(['', '3', '7']);
    await setValue(c.querySelector('input[placeholder="Filter companies"]'), 'beta');
    expect(optionIds(c)).toEqual(['', '7']);
  });

  it('keeps the chosen company when the filter hides it', async () => {
    inviteClient.mockResolvedValue({ ok: true });
    const c = await mount();
    await fillPerson(c);
    await setValue(c.querySelector('select'), '7');
    await setValue(c.querySelector('input[placeholder="Filter companies"]'), 'acme');
    await submit(c);
    expect(inviteClient).toHaveBeenCalledWith({ email: 'a@b.co', name: 'Ann', companyId: 7 });
  });

  it('shows the invite error and keeps the form values on failure', async () => {
    inviteClient.mockResolvedValue({ ok: false, error: 'Company not found' });
    const c = await mount();
    await fillPerson(c);
    await setValue(c.querySelector('select'), '3');
    await submit(c);
    expect(c.textContent).toContain('Company not found');
    expect(c.querySelector('select').value).toBe('3');
  });

  it('shows an error, retries loading, and blocks invites when listCompanies fails', async () => {
    listCompanies.mockResolvedValueOnce({ ok: false, error: 'boom' });
    const c = await mount();
    expect(c.textContent).toContain("Couldn't load companies");
    await fillPerson(c);
    expect(button(c, 'Send Invite').disabled).toBe(true);
    await submit(c);
    expect(inviteClient).not.toHaveBeenCalled();

    await click(button(c, 'Retry'));
    expect(listCompanies).toHaveBeenCalledTimes(2);
    expect(c.textContent).not.toContain("Couldn't load companies");
    expect(optionIds(c)).toEqual(['', '3', '7']);
  });
});
