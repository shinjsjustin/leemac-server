import React, { act } from 'react';
import { render } from '../../testUtils/render';
import DrawingTile from './DrawingTile';
import { enqueue } from './drawingQueue';

jest.mock('./drawingQueue', () => ({ enqueue: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;
const FILE = { id: 5, filename: 'a.pdf' };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
let cancel;
let observers;
const mount = async (ui) => { view = render(ui); await flush(); return view.container; };

beforeEach(() => {
  cancel = jest.fn();
  observers = [];
  enqueue.mockReset().mockReturnValue({ promise: Promise.resolve({ ok: true, src: 'data:img' }), cancel });
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; this.disconnect = jest.fn(); this.observe = jest.fn(); observers.push(this); }
  };
});
afterEach(() => { view && view.unmount(); delete global.IntersectionObserver; });

describe('DrawingTile', () => {
  it('shows a same-size skeleton and does not queue until in view', async () => {
    const c = await mount(<DrawingTile file={FILE} width={300} aspect={1.5} />);
    const skel = c.querySelector('[data-loading]');
    expect(skel.style.aspectRatio).toBe('1.5');
    expect(enqueue).not.toHaveBeenCalled();
    await act(async () => { observers[0].cb([{ isIntersecting: false }]); });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues once in view, then shows the image in a same-size button that calls onOpen', async () => {
    const onOpen = jest.fn();
    const c = await mount(<DrawingTile file={FILE} width={300} aspect={1.5} onOpen={onOpen} />);
    await act(async () => { observers[0].cb([{ isIntersecting: true }]); });
    await flush();
    expect(enqueue).toHaveBeenCalledWith(FILE, 300);
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(c.querySelector('[data-loading]')).toBeNull();
    expect(c.querySelector('img').getAttribute('src')).toBe('data:img');
    const btn = c.querySelector('button');
    expect(btn.style.aspectRatio).toBe('1.5');
    await act(async () => { btn.click(); });
    expect(onOpen).toHaveBeenCalledWith(FILE);
  });

  it('queues at once when IntersectionObserver is missing', async () => {
    delete global.IntersectionObserver;
    const c = await mount(<DrawingTile file={FILE} width={300} aspect={1} />);
    expect(enqueue).toHaveBeenCalledWith(FILE, 300);
    expect(c.querySelector('img')).not.toBeNull();
  });

  it.each([
    ['there is no file', null, { ok: true, src: 'x' }],
    ['the render fails', FILE, { ok: false }],
  ])('shows No drawing when %s', async (_, file, result) => {
    delete global.IntersectionObserver;
    enqueue.mockReturnValue({ promise: Promise.resolve(result), cancel });
    const c = await mount(<DrawingTile file={file} width={300} aspect={1} />);
    expect(c.textContent).toBe('No drawing');
    expect(c.querySelector('[data-loading]')).toBeNull();
    if (!file) expect(enqueue).not.toHaveBeenCalled();
  });

  it('cancels the job and disconnects on unmount', async () => {
    await mount(<DrawingTile file={FILE} width={300} aspect={1} />);
    await act(async () => { observers[0].cb([{ isIntersecting: true }]); });
    view.unmount();
    view = null;
    expect(cancel).toHaveBeenCalled();
  });
});
