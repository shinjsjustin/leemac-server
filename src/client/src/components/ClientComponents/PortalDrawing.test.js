import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PortalDrawing, { NoDrawing } from './PortalDrawing';
import { usePdfPageImages } from '../PdfImage';

jest.mock('../PdfImage', () => ({ usePdfPageImages: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const FILE = { id: 31, filename: 'brk.pdf', mimetype: 'application/pdf' };
const ok = () => ({ ok: true, status: 200, headers: { get: () => null }, blob: async () => new Blob(['x']) });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async (ui) => {
  view = render(ui);
  await flush();
  return view.container;
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(ok());
  global.URL.createObjectURL = jest.fn(() => 'blob:x');
  global.URL.revokeObjectURL = jest.fn();
  window.open = jest.fn();
  usePdfPageImages.mockReturnValue({ images: ['data:image/png;base64,AA'], failed: false });
});
afterEach(() => view && view.unmount());

describe('PortalDrawing', () => {
  it('renders a labelled button holding an image with alt text', async () => {
    const c = await mount(<PortalDrawing file={FILE} />);
    const button = c.querySelector('button.portal-drawing');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Open drawing brk.pdf full size');
    expect(button.querySelector('img').getAttribute('alt')).not.toBe('');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('opens the blob URL in a new tab on click', async () => {
    const c = await mount(<PortalDrawing file={FILE} />);
    await act(async () => { c.querySelector('button').click(); });
    expect(window.open).toHaveBeenCalledWith('blob:x', '_blank');
  });

  it('revokes the blob URL on unmount', async () => {
    await mount(<PortalDrawing file={FILE} />);
    view.unmount();
    view = null;
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('adds size classes and renders small at 300 and large at 900, first page only', async () => {
    let c = await mount(<PortalDrawing file={FILE} size="small" />);
    expect(c.querySelector('.portal-drawing--small')).not.toBeNull();
    expect(usePdfPageImages).toHaveBeenLastCalledWith('blob:x', 300, true);
    view.unmount();
    c = await mount(<PortalDrawing file={FILE} size="large" />);
    expect(c.querySelector('.portal-drawing--large')).not.toBeNull();
    expect(usePdfPageImages).toHaveBeenLastCalledWith('blob:x', 900, true);
  });

  it('adds the landscape class and renders landscape at 600', async () => {
    const c = await mount(<PortalDrawing file={FILE} size="landscape" />);
    expect(c.querySelector('button.portal-drawing.portal-drawing--landscape')).not.toBeNull();
    expect(usePdfPageImages).toHaveBeenLastCalledWith('blob:x', 600, true);
  });

  it('gives the loading box the landscape class', async () => {
    global.fetch.mockReturnValue(new Promise(() => {}));
    usePdfPageImages.mockReturnValue({ images: [], failed: false });
    const c = await mount(<PortalDrawing file={FILE} size="landscape" />);
    const box = c.querySelector('.portal-drawing-empty');
    expect(box.textContent).toBe('Loading drawing');
    expect(box.classList.contains('portal-drawing--landscape')).toBe(true);
  });

  it('gives the failure box the landscape class', async () => {
    usePdfPageImages.mockReturnValue({ images: [], failed: true });
    const c = await mount(<PortalDrawing file={FILE} size="landscape" />);
    const box = c.querySelector('.portal-drawing-empty');
    expect(box.textContent).toBe('Drawing unavailable');
    expect(box.classList.contains('portal-drawing--landscape')).toBe(true);
  });

  it('shows Loading drawing while the file loads', async () => {
    global.fetch.mockReturnValue(new Promise(() => {}));
    usePdfPageImages.mockReturnValue({ images: [], failed: false });
    const c = await mount(<PortalDrawing file={FILE} />);
    expect(c.querySelector('.portal-drawing-empty').textContent).toBe('Loading drawing');
    expect(c.querySelector('button')).toBeNull();
  });

  it('shows Drawing unavailable with no button when the fetch fails', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
    usePdfPageImages.mockReturnValue({ images: [], failed: false });
    const c = await mount(<PortalDrawing file={FILE} />);
    expect(c.querySelector('.portal-drawing-empty').textContent).toBe('Drawing unavailable');
    expect(c.querySelector('button')).toBeNull();
  });

  it('shows Drawing unavailable with no button when rendering fails', async () => {
    usePdfPageImages.mockReturnValue({ images: [], failed: true });
    const c = await mount(<PortalDrawing file={FILE} />);
    expect(c.querySelector('.portal-drawing-empty').textContent).toBe('Drawing unavailable');
    expect(c.querySelector('button')).toBeNull();
  });

  it('calls a fetchUrl prop with the file instead of fetchDrawingUrl', async () => {
    const fetchUrl = jest.fn().mockResolvedValue({ ok: true, url: 'blob:custom' });
    const c = await mount(<PortalDrawing file={FILE} fetchUrl={fetchUrl} />);
    expect(fetchUrl).toHaveBeenCalledWith(FILE);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(usePdfPageImages).toHaveBeenLastCalledWith('blob:custom', 300, true);
    expect(c.querySelector('button.portal-drawing')).not.toBeNull();
  });

  it('revokes a URL that arrives after unmount', async () => {
    let resolve;
    global.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    await mount(<PortalDrawing file={FILE} />);
    view.unmount();
    view = null;
    await act(async () => { resolve(ok()); await new Promise((r) => setTimeout(r, 0)); });
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});

describe('NoDrawing', () => {
  it('renders the empty box with the size class', async () => {
    const c = await mount(<NoDrawing size="large" />);
    const box = c.querySelector('div.portal-drawing-empty');
    expect(box.textContent).toBe('No drawing');
    expect(box.classList.contains('portal-drawing--large')).toBe(true);
  });

  it('renders the empty box with the landscape class', async () => {
    const c = await mount(<NoDrawing size="landscape" />);
    const box = c.querySelector('div.portal-drawing-empty');
    expect(box.textContent).toBe('No drawing');
    expect(box.classList.contains('portal-drawing--landscape')).toBe(true);
  });
});
