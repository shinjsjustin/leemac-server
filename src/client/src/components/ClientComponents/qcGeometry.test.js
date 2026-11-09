import { pageToView, viewToPage, markingToView, hitTest } from './qcGeometry';

// Page 1000x2000 source pixels, trimmed to x 100..600 (500 wide), y 200..1200 (1000 tall).
const trim = { box: { x: 100, y: 200, width: 500, height: 1000 }, pageWidth: 1000, pageHeight: 2000 };
const untrimmed = { box: null, pageWidth: 1000, pageHeight: 2000 };

describe('pageToView', () => {
  it('maps a page fraction to pixels on the trimmed image', () => {
    // scale 900/500 = 1.8; x: (350 - 100) * 1.8 = 450; y: (700 - 200) * 1.8 = 900
    expect(pageToView({ x: 0.35, y: 0.35 }, trim, 900)).toEqual({ x: 450, y: 900 });
  });

  it('scales with the display width', () => {
    expect(pageToView({ x: 0.35, y: 0.35 }, trim, 600)).toEqual({ x: 300, y: 600 });
  });

  it('uses the whole page when there is no trim box', () => {
    expect(pageToView({ x: 0.5, y: 0.25 }, untrimmed, 500)).toEqual({ x: 250, y: 500 / 2 });
  });

  it('clamps fractions to 0-1', () => {
    expect(pageToView({ x: -1, y: 2 }, untrimmed, 1000)).toEqual({ x: 0, y: 2000 });
  });
});

describe('viewToPage', () => {
  it('maps view pixels back to page fractions', () => {
    const p = viewToPage({ x: 450, y: 900 }, trim, 900);
    expect(p.x).toBeCloseTo(0.35, 9);
    expect(p.y).toBeCloseTo(0.35, 9);
  });

  it('clamps outside the page to 0-1', () => {
    expect(viewToPage({ x: -500, y: 99999 }, trim, 900)).toEqual({ x: 0, y: 1 });
  });
});

describe('round trip and render widths', () => {
  const trims = [trim, untrimmed, { box: { x: 0, y: 0, width: 333, height: 777 }, pageWidth: 1000, pageHeight: 2000 }];
  it.each(trims.flatMap((t) => [320, 600, 900, 1234].map((w) => [t, w])))('pageToView then viewToPage returns the fraction (%#)', (t, w) => {
    const inside = t.box
      ? { x: (t.box.x + t.box.width * 0.37) / t.pageWidth, y: (t.box.y + t.box.height * 0.61) / t.pageHeight }
      : { x: 0.37, y: 0.61 };
    const back = viewToPage(pageToView(inside, t, w), t, w);
    expect(Math.abs(back.x - inside.x)).toBeLessThan(1e-9);
    expect(Math.abs(back.y - inside.y)).toBeLessThan(1e-9);
  });

  it('a marking stored from a 900px render lands on the same page spot on a 600px render with a different trim', () => {
    const trimA = trim;
    const trimB = { box: { x: 50, y: 100, width: 800, height: 1500 }, pageWidth: 1000, pageHeight: 2000 };
    const stored = viewToPage({ x: 450, y: 900 }, trimA, 900); // 0.35, 0.35
    const onB = pageToView(stored, trimB, 600);
    // x: (350-50)/800*600 = 225; y: (700-100)*0.75 = 450
    expect(onB.x).toBeCloseTo(225, 9);
    expect(onB.y).toBeCloseTo(450, 9);
    const back = viewToPage(onB, trimB, 600);
    expect(back.x).toBeCloseTo(stored.x, 9);
    expect(back.y).toBeCloseTo(stored.y, 9);
  });
});

describe('markingToView', () => {
  it('maps a point', () => {
    expect(markingToView({ kind: 'point', x1: 0.35, y1: 0.35 }, trim, 900)).toEqual({ kind: 'point', x1: 450, y1: 900 });
  });

  it('maps both ends of a line and a box', () => {
    const m = { kind: 'box', x1: 0.35, y1: 0.35, x2: 0.6, y2: 0.45 };
    const v = markingToView(m, trim, 900);
    expect(v.kind).toBe('box');
    expect(v).toMatchObject({ x1: 450, y1: 900 });
    expect(v.x2).toBeCloseTo(900, 9);
    expect(v.y2).toBeCloseTo(1260, 9);
  });
});

describe('hitTest', () => {
  const w = 1000;
  const flat = { box: null, pageWidth: 1000, pageHeight: 1000 }; // view px == page * 1000
  const point = { id: 'p', kind: 'point', x1: 0.5, y1: 0.5 };
  const line = { id: 'l', kind: 'line', x1: 0.1, y1: 0.8, x2: 0.9, y2: 0.8 };
  const box = { id: 'b', kind: 'box', x1: 0.2, y1: 0.2, x2: 0.4, y2: 0.4 };
  const ids = (hits) => hits.map((m) => m.id);

  it('hits a point within 14px and misses it beyond', () => {
    expect(ids(hitTest([point], { x: 510, y: 510 }, flat, w))).toEqual([]); // 14.14 px
    expect(ids(hitTest([point], { x: 509, y: 509 }, flat, w))).toEqual(['p']); // 12.7 px
    expect(ids(hitTest([point], { x: 511, y: 511 }, flat, w))).toEqual([]); // 15.5 px
  });

  it('hits a line by segment distance, including past the ends only within the radius', () => {
    expect(ids(hitTest([line], { x: 500, y: 790 }, flat, w))).toEqual(['l']);
    expect(ids(hitTest([line], { x: 500, y: 780 }, flat, w))).toEqual([]);
    expect(ids(hitTest([line], { x: 90, y: 800 }, flat, w))).toEqual(['l']);
    expect(ids(hitTest([line], { x: 80, y: 800 }, flat, w))).toEqual([]);
  });

  it('hits a box inside, by its edge, and misses beyond the radius', () => {
    expect(ids(hitTest([box], { x: 300, y: 300 }, flat, w))).toEqual(['b']);
    expect(ids(hitTest([box], { x: 190, y: 300 }, flat, w))).toEqual(['b']);
    expect(ids(hitTest([box], { x: 180, y: 300 }, flat, w))).toEqual([]);
  });

  it('handles a box whose corners are given in reverse order', () => {
    const rev = { ...box, x1: 0.4, y1: 0.4, x2: 0.2, y2: 0.2 };
    expect(ids(hitTest([rev], { x: 300, y: 300 }, flat, w))).toEqual(['b']);
  });

  it('returns matches nearest first', () => {
    const near = { id: 'near', kind: 'point', x1: 0.302, y1: 0.3 };
    const far = { id: 'far', kind: 'point', x1: 0.31, y1: 0.3 };
    expect(ids(hitTest([far, near, box], { x: 300, y: 300 }, flat, w))).toEqual(['b', 'near', 'far']);
  });

  it('keeps the radius in screen pixels at any zoom', () => {
    const p = { id: 'p', kind: 'point', x1: 0.5, y1: 0.5 };
    // at 200px wide the point is at (100,100); 13px away hits, 15px away misses
    expect(ids(hitTest([p], { x: 113, y: 100 }, flat, 200))).toEqual(['p']);
    expect(ids(hitTest([p], { x: 115, y: 100 }, flat, 200))).toEqual([]);
    expect(ids(hitTest([p], { x: 1013, y: 1000 }, flat, 2000))).toEqual(['p']);
    expect(ids(hitTest([p], { x: 1015, y: 1000 }, flat, 2000))).toEqual([]);
  });

  it('accepts a custom radius and applies the trim', () => {
    expect(ids(hitTest([point], { x: 520, y: 500 }, flat, w, 25))).toEqual(['p']);
    const t = { box: { x: 400, y: 400, width: 200, height: 200 }, pageWidth: 1000, pageHeight: 1000 };
    // point at page (0.5,0.5) is the centre of the 200px trim: view (100,100) at width 200
    expect(ids(hitTest([point], { x: 100, y: 100 }, t, 200))).toEqual(['p']);
  });
});
