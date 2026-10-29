import React, { act } from 'react';
import { render } from '../../testUtils/render';
import useStageActions from './useStageActions';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

const setup = async () => {
  const onChange = jest.fn();
  const api = {};
  const Harness = () => {
    Object.assign(api, useStageActions(onChange));
    return null;
  };
  await act(async () => { render(<Harness />); });
  return { api, onChange };
};

test('setStage PUTs the stage, updates the row and offers an Undo toast', async () => {
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, status: 'qa', previous: 'setup' }));
  const { api, onChange } = await setup();
  await act(async () => { await api.setStage(7, 'qa'); });
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/setstarstage', { method: 'PUT', body: { jobPartId: 7, status: 'qa' } });
  expect(onChange).toHaveBeenCalledWith(7, { status: 'qa' });
  expect(api.toast.message).toBe('Client portal updated');
  expect(api.toast.kind).toBe('ok');
});

test('Undo of a stage change resends the previous stage and shows no further Undo', async () => {
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, status: 'qa', previous: 'setup' }));
  const { api, onChange } = await setup();
  await act(async () => { await api.setStage(7, 'qa'); });
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, status: 'setup', previous: 'qa' }));
  await act(async () => { await api.toast.undo(); });
  expect(apiFetch).toHaveBeenLastCalledWith('/internal/job/setstarstage', { method: 'PUT', body: { jobPartId: 7, status: 'setup' } });
  expect(onChange).toHaveBeenLastCalledWith(7, { status: 'setup' });
  expect(api.toast.undo).toBeUndefined();
});

test('finish POSTs finishpart and Undo returns to the previous stage', async () => {
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, status: 'done', previous: 'packing' }));
  const { api, onChange } = await setup();
  await act(async () => { await api.finish(7); });
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/finishpart', { method: 'POST', body: { jobPartId: 7 } });
  expect(onChange).toHaveBeenCalledWith(7, { status: 'done' });
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, status: 'packing', previous: 'done' }));
  await act(async () => { await api.toast.undo(); });
  expect(apiFetch).toHaveBeenLastCalledWith('/internal/job/setstarstage', { method: 'PUT', body: { jobPartId: 7, status: 'packing' } });
});

test('setFlag PUTs the flag and Undo sends the opposite value', async () => {
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, flag: 'urgent', on: true, previous: false }));
  const { api, onChange } = await setup();
  await act(async () => { await api.setFlag(7, 'urgent', true); });
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/setstarflag', { method: 'PUT', body: { jobPartId: 7, flag: 'urgent', on: true } });
  expect(onChange).toHaveBeenCalledWith(7, { urgent: true });
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, flag: 'urgent', on: false, previous: true }));
  await act(async () => { await api.toast.undo(); });
  expect(apiFetch).toHaveBeenLastCalledWith('/internal/job/setstarflag', { method: 'PUT', body: { jobPartId: 7, flag: 'urgent', on: false } });
  expect(onChange).toHaveBeenLastCalledWith(7, { urgent: false });
});

test('a failed call shows an error toast and leaves the row alone', async () => {
  apiFetch.mockResolvedValueOnce(reply({ error: 'No starred part found' }, false));
  const { api, onChange } = await setup();
  await act(async () => { await api.setStage(7, 'qa'); });
  expect(onChange).not.toHaveBeenCalled();
  expect(api.toast.kind).toBe('error');
  expect(api.toast.message).toContain('No starred part found');
  expect(api.toast.undo).toBeUndefined();
});

test('a network error shows an error toast', async () => {
  apiFetch.mockRejectedValueOnce(new Error('offline'));
  const { api, onChange } = await setup();
  await act(async () => { await api.setFlag(7, 'waiting', true); });
  expect(onChange).not.toHaveBeenCalled();
  expect(api.toast.kind).toBe('error');
});

test('dismiss clears the toast', async () => {
  apiFetch.mockResolvedValueOnce(reply({ jobPartId: 7, status: 'qa', previous: 'setup' }));
  const { api } = await setup();
  await act(async () => { await api.setStage(7, 'qa'); });
  await act(async () => { api.dismiss(); });
  expect(api.toast).toBeNull();
});
