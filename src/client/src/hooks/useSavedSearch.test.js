import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useSavedSearch from './useSavedSearch';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mountHook(key) {
  const current = {};
  const Probe = () => {
    Object.assign(current, useSavedSearch(key));
    return null;
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  return { current, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => sessionStorage.clear());

test('initial values come from sessionStorage JSON for the key', () => {
  sessionStorage.setItem('k', JSON.stringify({ number: 'A1', description: 'bolt' }));
  const h = mountHook('k');
  expect(h.current).toMatchObject({
    number: 'A1', description: 'bolt', searchNum: 'A1', searchDesc: 'bolt',
  });
  h.unmount();
});

test('bad JSON gives empty strings', () => {
  sessionStorage.setItem('k', '{nope');
  const h = mountHook('k');
  expect(h.current).toMatchObject({ number: '', description: '', searchNum: '', searchDesc: '' });
  h.unmount();
});

test('applyNumber and applyDescription copy drafts into applied values and save them', () => {
  const h = mountHook('k');
  act(() => h.current.setSearchNum('B2'));
  act(() => h.current.setSearchDesc('nut'));
  expect(h.current.number).toBe('');
  act(() => h.current.applyNumber());
  expect(h.current.number).toBe('B2');
  expect(h.current.description).toBe('');
  act(() => h.current.applyDescription());
  expect(h.current.description).toBe('nut');
  expect(JSON.parse(sessionStorage.getItem('k'))).toEqual({ number: 'B2', description: 'nut' });
  h.unmount();
});

test('clear empties draft and applied values', () => {
  sessionStorage.setItem('k', JSON.stringify({ number: 'A1', description: 'bolt' }));
  const h = mountHook('k');
  act(() => h.current.clear());
  expect(h.current).toMatchObject({ number: '', description: '', searchNum: '', searchDesc: '' });
  expect(JSON.parse(sessionStorage.getItem('k'))).toEqual({ number: '', description: '' });
  h.unmount();
});

test('two keys never share state', () => {
  const a = mountHook('a');
  const b = mountHook('b');
  act(() => a.current.setSearchNum('X'));
  act(() => a.current.applyNumber());
  expect(b.current.number).toBe('');
  expect(sessionStorage.getItem('b')).toBe(JSON.stringify({ number: '', description: '' }));
  expect(JSON.parse(sessionStorage.getItem('a')).number).toBe('X');
  a.unmount();
  b.unmount();
});
