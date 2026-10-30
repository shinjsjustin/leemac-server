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

  it('shows a non-button No drawing when there is no file', async () => {
    const c = await mount(<DrawingTile file={null} width={300} aspect={1} />);
    expect(c.textContent).toBe('No drawing');
    expect(c.querySelector('button')).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('shows a Preview unavailable button that opens the file when the render fails', async () => {
    delete global.IntersectionObserver;
    enqueue.mockReturnValue({ promise: Promise.resolve({ ok: false }), cancel });
    const onOpen = jest.fn();
    const c = await mount(<DrawingTile file={FILE} width={300} aspect={1} onOpen={onOpen} />);
    const btn = c.querySelector('button.portal-tile.portal-tile--empty');
    expect(btn.textContent).toBe('Preview unavailable');
    expect(btn.getAttribute('aria-label')).toBe('Open a.pdf');
    await act(async () => { btn.click(); });
    expect(onOpen).toHaveBeenCalledWith(FILE);
  });

  it('shows a Preview unavailable button, not the alt text, when the image fails to load', async () => {
    delete global.IntersectionObserver;
    const onOpen = jest.fn();
    const c = await mount(<DrawingTile file={FILE} width={300} aspect={1} onOpen={onOpen} />);
    await act(async () => { c.querySelector('img').dispatchEvent(new Event('error')); });
    const btn = c.querySelector('button.portal-tile--empty');
    expect(btn.textContent).toBe('Preview unavailable');
    expect(c.querySelector('img')).toBeNull();
    await act(async () => { btn.click(); });
    expect(onOpen).toHaveBeenCalledWith(FILE);
  });

  describe('refresh with a new file object of the same id', () => {
    let setFile;
    function Harness({ initial }) {
      const [file, set] = React.useState(initial);
      setFile = set;
      return <DrawingTile file={file} width={300} aspect={1} />;
    }
    beforeEach(() => {
      global.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; this.disconnect = jest.fn(); observers.push(this); }
        observe(el) { if (!(el instanceof Element)) throw new TypeError('not an Element'); }
      };
    });

    it('throws nothing and queues no new job for a loaded tile', async () => {
      const c = await mount(<Harness initial={FILE} />);
      await act(async () => { observers[0].cb([{ isIntersecting: true }]); });
      await flush();
      expect(c.querySelector('img')).not.toBeNull();
      await act(async () => { setFile({ ...FILE }); });
      await flush();
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(c.querySelector('img')).not.toBeNull();
    });

    it('throws nothing and queues no new job for an unavailable tile', async () => {
      enqueue.mockReturnValue({ promise: Promise.resolve({ ok: false }), cancel });
      const c = await mount(<Harness initial={FILE} />);
      await act(async () => { observers[0].cb([{ isIntersecting: true }]); });
      await flush();
      expect(c.textContent).toBe('Preview unavailable');
      await act(async () => { setFile({ ...FILE }); });
      await flush();
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(c.textContent).toBe('Preview unavailable');
    });

    it('throws nothing for a tile with no file', async () => {
      const c = await mount(<Harness initial={null} />);
      await act(async () => { setFile(null); });
      expect(c.textContent).toBe('No drawing');
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  it('uses a passed enqueue instead of the shared one', async () => {
    delete global.IntersectionObserver;
    const custom = jest.fn().mockReturnValue({ promise: Promise.resolve({ ok: true, src: 'data:custom' }), cancel });
    const c = await mount(<DrawingTile file={FILE} width={300} aspect={1} enqueue={custom} />);
    expect(custom).toHaveBeenCalledWith(FILE, 300);
    expect(enqueue).not.toHaveBeenCalled();
    expect(c.querySelector('img').getAttribute('src')).toBe('data:custom');
  });

  it('cancels the job and disconnects on unmount', async () => {
    await mount(<DrawingTile file={FILE} width={300} aspect={1} />);
    await act(async () => { observers[0].cb([{ isIntersecting: true }]); });
    view.unmount();
    view = null;
    expect(cancel).toHaveBeenCalled();
  });
});
