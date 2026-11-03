import React, { act } from 'react';
import { render } from '../../testUtils/render';
import useSimpleList from './useSimpleList';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setup = async (loader) => {
  const api = {};
  const Harness = () => {
    Object.assign(api, useSimpleList(loader));
    return null;
  };
  await act(async () => { render(<Harness />); });
  return api;
};

const reply = (page) => ({
  ok: true,
  data: { jobs: [{ id: page * 10 }], page, pages: 3, no_bid: [{ id: 99 }] },
});

test('loads page 1 and exposes jobs, page, pages and the extra data', async () => {
  const loader = jest.fn(async (page) => reply(page));
  const api = await setup(loader);
  expect(loader).toHaveBeenCalledWith(1);
  expect(api.jobs).toEqual([{ id: 10 }]);
  expect(api.page).toBe(1);
  expect(api.pages).toBe(3);
  expect(api.extra).toEqual({ no_bid: [{ id: 99 }] });
  expect(api.error).toBeNull();
});

test('setPage loads the chosen page', async () => {
  const loader = jest.fn(async (page) => reply(page));
  const api = await setup(loader);
  await act(async () => { api.setPage(2); });
  expect(loader).toHaveBeenLastCalledWith(2);
  expect(api.jobs).toEqual([{ id: 20 }]);
  expect(api.page).toBe(2);
});

test('reload fetches the same page again', async () => {
  const loader = jest.fn(async (page) => reply(page));
  const api = await setup(loader);
  await act(async () => { api.setPage(3); });
  await act(async () => { api.reload(); });
  expect(loader).toHaveBeenCalledTimes(3);
  expect(loader).toHaveBeenLastCalledWith(3);
});

test('exposes the error message when the loader fails', async () => {
  const loader = jest.fn(async () => ({ ok: false, error: { kind: 'error', message: 'nope' } }));
  const api = await setup(loader);
  expect(api.error).toBe('nope');
  expect(api.jobs).toEqual([]);
});
