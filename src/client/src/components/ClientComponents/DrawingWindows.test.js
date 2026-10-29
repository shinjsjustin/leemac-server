import React, { act } from 'react';
import { render } from '../../testUtils/render';
import DrawingWindows, { useDrawingWindows } from './DrawingWindows';
import { fetchDrawingUrl } from '../../api/portalApi';

jest.mock('../../api/portalApi', () => ({ fetchDrawingUrl: jest.fn(), formatDate: (v) => `D:${v}` }));
jest.mock('./DrawingTile', () => ({ file, width }) => <div data-testid="tile" data-width={width}>{file && file.filename}</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

const part = (n, extra = {}) => ({
  key: `p${n}`, part_number: `PN-${n}`, rev: 'B', description: `Bracket ${n}`,
  stage: { key: 'machining', label: 'Machining' }, job_number: `J${n}`,
  material: '6061', finish: 'Anodize', quantity: 10, drawing: { id: n, filename: `d${n}.pdf` }, ...extra,
});

let api;
let view;
let mobile;
function Harness({ railed, loadPart }) {
  api = useDrawingWindows();
  return (
    <DrawingWindows
      windows={api.open}
      focusedKey={api.focusedKey}
      onFocus={api.focus}
      onClose={api.close}
      onCloseAll={api.closeAll}
      railed={railed}
      loadPart={loadPart}
    />
  );
}
const mount = (props) => { view = render(<Harness {...props} />); return view.container; };
const openParts = (...ns) => act(() => ns.forEach((n) => api.openPart(part(n))));
const windowsOpen = (c) => c.querySelectorAll('.portal-window').length;
const wins = (c) => [...c.querySelectorAll('.portal-window')];
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const touch = (el, type, x) => act(() => {
  const e = new Event(type, { bubbles: true });
  const list = [{ clientX: x }];
  e.touches = list; e.changedTouches = list;
  el.dispatchEvent(e);
});

beforeEach(() => {
  mobile = false;
  window.matchMedia = jest.fn(() => ({ matches: mobile }));
  fetchDrawingUrl.mockReset();
});
afterEach(() => view.unmount());

describe('useDrawingWindows', () => {
  test('drops the oldest part when a 7th is opened', () => {
    mount();
    openParts(1, 2, 3, 4, 5, 6, 7);
    expect(api.open.map((p) => p.key)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(api.focusedKey).toBe('p7');
  });

  test('reopening an open part only focuses it', () => {
    mount();
    openParts(1, 2, 3, 1);
    expect(api.open.map((p) => p.key)).toEqual(['p1', 'p2', 'p3']);
    expect(api.focusedKey).toBe('p1');
  });

  test('closing the focused part focuses the last remaining; closeAll empties', () => {
    mount();
    openParts(1, 2, 3);
    act(() => api.close('p3'));
    expect(api.focusedKey).toBe('p2');
    act(() => api.close('p1'));
    expect(api.focusedKey).toBe('p2');
    act(() => api.closeAll());
    expect(api.open).toEqual([]);
    expect(api.focusedKey).toBeNull();
  });
});

describe('DrawingWindows', () => {
  test('renders nothing when no window is open', () => {
    const c = mount();
    expect(c.innerHTML).toBe('');
  });

  test.each([[1, 1], [2, 2], [3, 4], [4, 4], [5, 6], [6, 6]])('%i windows use grid class --%i', (count, size) => {
    const c = mount();
    openParts(...Array.from({ length: count }, (_, i) => i + 1));
    expect(c.querySelector('.portal-windows').className).toContain(`portal-windows--${size}`);
    expect(wins(c)).toHaveLength(count);
    expect(wins(c).map((w) => w.querySelector('.portal-window-number').textContent)).toEqual(
      Array.from({ length: count }, (_, i) => String(i + 1))
    );
  });

  test('only the focused window shows header and facts; empty values are hidden', () => {
    const c = mount();
    act(() => { api.openPart(part(1, { material: '' , finish: null })); api.openPart(part(2)); });
    const [first, second] = wins(c);
    expect(second.textContent).toContain('PN-2');
    expect(second.textContent).toContain('Bracket 2');
    expect(second.textContent).toContain('Machining');
    expect(second.textContent).toContain('J2');
    expect(second.textContent).toContain('6061');
    expect(second.textContent).toContain('Anodize');
    expect(second.textContent).toContain('10');
    expect(first.textContent).not.toContain('PN-1');
    act(() => api.focus('p1'));
    const f = wins(c)[0];
    expect(f.textContent).toContain('PN-1');
    expect(f.textContent).not.toContain('Material');
    expect(f.textContent).not.toContain('Finish');
    expect(f.textContent).toContain('Qty');
    expect(f.querySelectorAll('.portal-window-fact')).toHaveLength(2);
  });

  test('clicking a window focuses it', () => {
    const c = mount();
    openParts(1, 2);
    click(wins(c)[0]);
    expect(api.focusedKey).toBe('p1');
  });

  test('x closes one window; Close all and the backdrop close every window', () => {
    const c = mount();
    openParts(1, 2);
    click(wins(c)[0].querySelector('button[aria-label="Close window"]'));
    expect(api.open.map((p) => p.key)).toEqual(['p2']);
    openParts(3);
    click(c.querySelector('.portal-windows-backdrop'));
    expect(api.open).toEqual([]);
    openParts(1, 2);
    click([...c.querySelectorAll('button')].find((b) => b.textContent === 'Close all'));
    expect(api.open).toEqual([]);
  });

  test('clicking inside a window does not close all', () => {
    const c = mount();
    openParts(1, 2);
    click(wins(c)[1]);
    expect(api.open).toHaveLength(2);
  });

  test('Esc closes only the focused window', () => {
    mount();
    openParts(1, 2);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(api.open.map((p) => p.key)).toEqual(['p1']);
  });

  test('backdrop leaves the rail lit only when railed', () => {
    const c = mount({ railed: true });
    openParts(1);
    expect(c.querySelector('.portal-windows-backdrop').className).toContain('portal-windows-backdrop--railed');
  });

  test('not railed has no railed modifier', () => {
    const c = mount();
    openParts(1);
    expect(c.querySelector('.portal-windows-backdrop').className).not.toContain('railed');
  });

  test('bar shows the open count, the hint, and no window has its own Open PDF', () => {
    const c = mount();
    openParts(1, 2);
    const bar = c.querySelector('.portal-windows-bar');
    expect(bar.textContent).toContain('2 of 6 drawings open');
    expect(bar.textContent).toContain('Click parts in the rail to add \u00b7 hover a drawing to see its details \u00b7 Esc or click the dark to close');
    expect(bar.textContent).toContain('Open focused PDF');
    expect(bar.textContent).toContain('Close all');
    expect(c.querySelectorAll('.portal-window button:not(.portal-window-x)')).toHaveLength(0);
  });

  test('focused header is one row: number, Rev chip, description, stage, job', () => {
    const c = mount();
    openParts(2);
    const head = c.querySelector('.portal-window-head');
    expect(head.textContent).toContain('PN-2');
    expect(head.querySelector('.portal-window-rev').textContent).toBe('Rev B');
    expect(head.textContent).toContain('Bracket 2');
    expect(head.textContent).toContain('Machining');
    expect(head.textContent).toMatch(/\u00b7 job J2$/);
  });

  const openPdfButton = (c) => [...c.querySelectorAll('.portal-windows-bar button')].find((b) => b.textContent === 'Open focused PDF');

  test('Open focused PDF fetches the focused drawing and opens it in a new tab', async () => {
    fetchDrawingUrl.mockResolvedValue({ ok: true, url: 'blob:x' });
    window.open = jest.fn();
    const c = mount();
    openParts(1, 2);
    await act(async () => { openPdfButton(c).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(fetchDrawingUrl).toHaveBeenCalledWith(part(2).drawing);
    expect(window.open).toHaveBeenCalledWith('blob:x', '_blank');
    expect(windowsOpen(c)).toBe(2);
  });

  test('Open focused PDF is disabled when the focused part has no drawing', () => {
    const c = mount();
    act(() => { api.openPart(part(1)); api.openPart(part(2, { drawing: null })); });
    expect(openPdfButton(c).disabled).toBe(true);
    act(() => api.focus('p1'));
    expect(openPdfButton(c).disabled).toBe(false);
  });

  test('Open focused PDF shows the error and opens nothing when the fetch fails', async () => {
    fetchDrawingUrl.mockResolvedValue({ ok: false, error: { message: 'Not found' } });
    window.open = jest.fn();
    const c = mount();
    openParts(1);
    await act(async () => { openPdfButton(c).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(window.open).not.toHaveBeenCalled();
    expect(c.querySelector('[role="alert"]').textContent).toBe('Not found');
  });

  describe('footer with past orders', () => {
    const jobs = [
      { id: 7, job_number: 'J-7', quantity: 25, po_date: '2026-09-01' },
      { id: 5, job_number: 'J-5', quantity: null, po_date: null },
    ];
    const factText = (c) => [...c.querySelectorAll('.portal-window-fact')].map((f) => f.textContent);

    test('loads once per focused key and shows labelled facts over values', async () => {
      const loadPart = jest.fn().mockResolvedValue({ ok: true, data: { jobs } });
      const c = mount({ loadPart });
      await act(async () => { api.openPart(part(1)); });
      expect(loadPart).toHaveBeenCalledTimes(1);
      expect(loadPart).toHaveBeenCalledWith('p1');
      expect(factText(c)).toEqual(['Material6061', 'FinishAnodize', 'Qty10', 'JobJ1', 'Past orders \u00b7 2' + 'J-7 \u00d725 D:2026-09-01J-5']);
      await act(async () => { api.openPart(part(2)); });
      await act(async () => { api.focus('p1'); });
      expect(loadPart).toHaveBeenCalledTimes(2);
      expect(loadPart).toHaveBeenLastCalledWith('p2');
    });

    test('each past order links to its job and hides blank quantity and date', async () => {
      const loadPart = jest.fn().mockResolvedValue({ ok: true, data: { jobs } });
      const c = mount({ loadPart });
      await act(async () => { api.openPart(part(1)); });
      const links = [...c.querySelectorAll('.portal-window-facts a')];
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['/client-job/7', '/client-job/5']);
      expect(links[0].textContent).toBe('J-7');
      expect(links[1].parentElement.textContent).toBe('J-5');
    });

    test('a failed load hides past orders', async () => {
      const loadPart = jest.fn().mockResolvedValue({ ok: false, error: { message: 'x' } });
      const c = mount({ loadPart });
      await act(async () => { api.openPart(part(1)); });
      expect(c.textContent).not.toContain('Past orders');
      expect(factText(c)).toHaveLength(4);
    });

    test('a part with no job_number shows no Job cell', async () => {
      const loadPart = jest.fn().mockResolvedValue({ ok: false, error: { message: 'x' } });
      const c = mount({ loadPart });
      await act(async () => { api.openPart(part(1, { job_number: null })); });
      expect(factText(c)).toEqual(['Material6061', 'FinishAnodize', 'Qty10']);
    });

    test('no loadPart means no past orders and no loading', () => {
      const c = mount();
      openParts(1);
      expect(c.textContent).not.toContain('Past orders');
    });
  });

  describe('under 600px', () => {
    beforeEach(() => { mobile = true; });

    test('shows one window and swipes by more than 50 px', () => {
      const c = mount();
      openParts(1, 2, 3);
      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 599px)');
      expect(wins(c)).toHaveLength(1);
      expect(wins(c)[0].textContent).toContain('PN-3');
      const area = c.querySelector('.portal-windows');
      touch(area, 'touchstart', 200);
      touch(area, 'touchend', 100);
      expect(api.focusedKey).toBe('p3'); // no next part
      touch(area, 'touchstart', 100);
      touch(area, 'touchend', 160);
      expect(api.focusedKey).toBe('p2');
      expect(wins(c)[0].textContent).toContain('PN-2');
      touch(area, 'touchstart', 100);
      touch(area, 'touchend', 130);
      expect(api.focusedKey).toBe('p2'); // under 50 px
      touch(area, 'touchstart', 200);
      touch(area, 'touchend', 100);
      expect(api.focusedKey).toBe('p3');
    });

    test('phone has no desktop windows bar; thumbs are the viewer\'s last child and focus parts; header x closes the focused part', () => {
      const c = mount();
      openParts(1, 2);
      expect(c.querySelector('.portal-windows-bar')).toBeNull();
      const viewer = c.querySelector('.portal-phone-viewer');
      const strip = viewer.lastElementChild;
      expect(strip.className).toBe('portal-phone-thumbs');
      const buttons = strip.querySelectorAll('button');
      expect(buttons).toHaveLength(2);
      click(buttons[0]);
      expect(api.focusedKey).toBe('p1');
      click(viewer.querySelector('header button[aria-label="Close window"]'));
      expect(api.open.map((p) => p.key)).toEqual(['p2']);
    });

    test('phone viewer shows header with x, drawing, hint, facts, past orders and a thumbnail strip', async () => {
      const loadPart = jest.fn().mockResolvedValue({ ok: true, data: { jobs: [{ id: 7, job_number: 'J-7', quantity: 25, po_date: '2026-09-01' }] } });
      const c = mount({ loadPart });
      await act(async () => { api.openPart(part(1)); api.openPart(part(2)); });
      const viewer = c.querySelector('.portal-phone-viewer');
      expect(viewer.querySelector('header').textContent).toContain('PN-2');
      expect(viewer.querySelector('header button[aria-label="Close window"]')).not.toBeNull();
      expect(viewer.querySelector('[data-testid="tile"]').textContent).toBe('d2.pdf');
      expect(viewer.textContent).toContain('Swipe');
      expect(viewer.textContent).toContain('Material');
      expect(viewer.textContent).toContain('Past orders \u00b7 1');
      const thumbs = [...viewer.querySelectorAll('.portal-phone-thumb')];
      expect(thumbs).toHaveLength(2);
      expect(thumbs[1].className).toContain('portal-phone-thumb--on');
      expect(thumbs[0].querySelector('[data-testid="tile"]').getAttribute('data-width')).toBe('90');
      expect(c.querySelector('.portal-windows-dot')).toBeNull();
      await act(async () => { thumbs[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(api.focusedKey).toBe('p1');
      expect(viewer.textContent).not.toContain('Add to list');
      click(viewer.querySelector('header button[aria-label="Close window"]'));
      expect(api.open.map((p) => p.key)).toEqual(['p2']);
    });
  });
});
