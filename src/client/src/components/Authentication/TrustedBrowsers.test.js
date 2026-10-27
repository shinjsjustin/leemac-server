import React, { act } from 'react';
import { render } from '../../testUtils/render';
import TrustedBrowsers from './TrustedBrowsers';
import {
  listTrustedBrowsers,
  revokeTrustedBrowser,
  revokeAllTrustedBrowsers,
} from '../../api/trustedDevices';

jest.mock('../../api/trustedDevices');

global.IS_REACT_ACT_ENVIRONMENT = true;

const CREATED = '2024-01-02T12:00:00.000Z';
const USED = '2024-03-05T12:00:00.000Z';
const device = (id, label) => ({ id, label, created_at: CREATED, last_used_at: USED });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el) => act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

let view;
const mount = async (element) => {
  view = render(element);
  await flush();
  return view.container;
};

beforeEach(() => {
  jest.resetAllMocks();
  window.confirm = jest.fn(() => true);
});
afterEach(() => view && view.unmount());

describe('TrustedBrowsers', () => {
  it('shows label, trusted date and last used date for each device', async () => {
    listTrustedBrowsers.mockResolvedValue([device(1, 'Chrome on Mac'), device(2, 'Safari on iPhone')]);
    const c = await mount(<TrustedBrowsers />);
    expect(listTrustedBrowsers).toHaveBeenCalledWith(undefined);
    expect(c.textContent).toContain('Trusted browsers');
    const rows = c.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Chrome on Mac');
    expect(rows[0].textContent).toContain(new Date(CREATED).toLocaleDateString());
    expect(rows[0].textContent).toContain(new Date(USED).toLocaleDateString());
    expect(rows[1].textContent).toContain('Safari on iPhone');
  });

  it('shows the empty message when there are no devices', async () => {
    listTrustedBrowsers.mockResolvedValue([]);
    const c = await mount(<TrustedBrowsers />);
    expect(c.textContent).toContain('No trusted browsers.');
    expect(c.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('revokes one device with the adminId after confirm and reloads', async () => {
    listTrustedBrowsers.mockResolvedValueOnce([device(7, 'A')]).mockResolvedValueOnce([]);
    revokeTrustedBrowser.mockResolvedValue();
    const c = await mount(<TrustedBrowsers adminId="42" />);
    expect(listTrustedBrowsers).toHaveBeenCalledWith('42');
    await click(button(c, 'Revoke'));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(revokeTrustedBrowser).toHaveBeenCalledWith(7, '42');
    expect(listTrustedBrowsers).toHaveBeenCalledTimes(2);
    expect(c.textContent).toContain('No trusted browsers.');
  });

  it('revokes all with the adminId after confirm and reloads', async () => {
    listTrustedBrowsers.mockResolvedValue([device(1, 'A')]);
    revokeAllTrustedBrowsers.mockResolvedValue();
    const c = await mount(<TrustedBrowsers adminId="42" />);
    await click(button(c, 'Revoke all'));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(revokeAllTrustedBrowsers).toHaveBeenCalledWith('42');
    expect(listTrustedBrowsers).toHaveBeenCalledTimes(2);
  });

  it('does nothing when confirm is declined', async () => {
    window.confirm = jest.fn(() => false);
    listTrustedBrowsers.mockResolvedValue([device(1, 'A')]);
    const c = await mount(<TrustedBrowsers />);
    await click(button(c, 'Revoke'));
    await click(button(c, 'Revoke all'));
    expect(revokeTrustedBrowser).not.toHaveBeenCalled();
    expect(revokeAllTrustedBrowsers).not.toHaveBeenCalled();
    expect(listTrustedBrowsers).toHaveBeenCalledTimes(1);
  });

  it('shows the error text when loading fails', async () => {
    listTrustedBrowsers.mockRejectedValue(new Error('Load broke'));
    const c = await mount(<TrustedBrowsers />);
    expect(c.textContent).toContain('Load broke');
  });

  it('shows the error text when a revoke fails', async () => {
    listTrustedBrowsers.mockResolvedValue([device(1, 'A')]);
    revokeTrustedBrowser.mockRejectedValue(new Error('Revoke broke'));
    const c = await mount(<TrustedBrowsers />);
    await click(button(c, 'Revoke'));
    expect(c.textContent).toContain('Revoke broke');
  });
});
