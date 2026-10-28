import React, { act } from 'react';
import { render } from '../testUtils/render';
import PartPdfPreview from './PartPdfPreview';
import { usePdfPageImages } from './PdfImage';

jest.mock('./PdfImage', () => ({ usePdfPageImages: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const FILE = { id: 31, filename: 'brk.pdf', mimetype: 'application/pdf' };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
let fetchUrl;
const mount = async (ui) => {
  view = render(ui);
  await flush();
  return view.container;
};
const toggle = (c) => c.querySelector('button.part-preview-toggle');
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };

beforeEach(() => {
  fetchUrl = jest.fn().mockResolvedValue({ ok: true, url: 'blob:x' });
  global.URL.revokeObjectURL = jest.fn();
  window.open = jest.fn();
  usePdfPageImages.mockReturnValue({ images: ['data:image/png;base64,AA'], failed: false });
});
afterEach(() => view && view.unmount());

describe('PartPdfPreview', () => {
  it.each([
    ['drawingCount is 0', FILE, 0],
    ['file is null', null, 2],
  ])('renders nothing when %s', async (_, file, count) => {
    const c = await mount(<PartPdfPreview file={file} drawingCount={count} fetchUrl={fetchUrl} />);
    expect(c.innerHTML).toBe('');
  });

  it('renders a collapsed toggle button and loads nothing before the click', async () => {
    const c = await mount(<PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} />);
    expect(toggle(c).getAttribute('type')).toBe('button');
    expect(toggle(c).textContent).toBe('Click to show preview');
    expect(toggle(c).getAttribute('aria-expanded')).toBe('false');
    expect(fetchUrl).not.toHaveBeenCalled();
    expect(c.querySelector('.portal-drawing')).toBeNull();
  });

  it('shows the drawing on click and unmounts it on the second click', async () => {
    const c = await mount(<PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} />);
    await click(toggle(c));
    expect(fetchUrl).toHaveBeenCalledWith(FILE);
    expect(c.querySelector('.portal-drawing--landscape')).not.toBeNull();
    expect(toggle(c).textContent).toBe('Hide preview');
    expect(toggle(c).getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(toggle(c).getAttribute('aria-controls'));
    expect(region.querySelector('.portal-drawing')).not.toBeNull();
    await click(toggle(c));
    expect(c.querySelector('.portal-drawing')).toBeNull();
    expect(toggle(c).textContent).toBe('Click to show preview');
  });

  it('shows the 1 of N drawings note only when several drawings exist', async () => {
    let c = await mount(<PartPdfPreview file={FILE} drawingCount={3} fetchUrl={fetchUrl} />);
    expect(c.textContent).not.toContain('1 of 3 drawings');
    await click(toggle(c));
    expect(c.textContent).toContain('1 of 3 drawings');
    view.unmount();
    c = await mount(<PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} />);
    await click(toggle(c));
    expect(c.textContent).not.toContain('drawings');
  });

  it('does not propagate clicks to a parent onClick', async () => {
    const onParent = jest.fn();
    const c = await mount(
      <div onClick={onParent}><PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} /></div>
    );
    await click(toggle(c));
    await click(c.querySelector('.portal-drawing'));
    expect(onParent).not.toHaveBeenCalled();
  });

  it('toggles each instance on its own', async () => {
    const c = await mount(
      <>
        <PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} />
        <PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} />
      </>
    );
    const [a, b] = c.querySelectorAll('button.part-preview-toggle');
    await click(a);
    expect(a.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(a.getAttribute('aria-controls')).not.toBe(b.getAttribute('aria-controls'));
  });

  it('adds toggleClassName after part-preview-toggle, and only that class without it', async () => {
    let c = await mount(
      <PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} toggleClassName="a b" />
    );
    expect([...toggle(c).classList]).toEqual(['part-preview-toggle', 'a', 'b']);
    view.unmount();
    c = await mount(<PartPdfPreview file={FILE} drawingCount={1} fetchUrl={fetchUrl} />);
    expect([...toggle(c).classList]).toEqual(['part-preview-toggle']);
  });
});
