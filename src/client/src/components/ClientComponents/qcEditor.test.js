import { initialState, reduce, hint, ZOOM_MIN, ZOOM_MAX, NOTE_MAX } from './qcEditor';

const own = { id: 7, kind: 'point', page: 1, x1: 0.1, y1: 0.2, x2: null, y2: null, size: 14, note: 'mine', is_leemac: false, mine: true };
const leemac = { id: 8, kind: 'box', page: 1, x1: 0.3, y1: 0.3, x2: 0.5, y2: 0.5, size: null, note: 'theirs', is_leemac: true, mine: false };

const loaded = () => reduce(initialState(), { type: 'load', markings: [own, leemac] });
const run = (state, ...actions) => actions.reduce(reduce, state);
const idsOf = (state) => state.markings.map((m) => m.id);

describe('qcEditor', () => {
  test('starts clean with no tool and the default point size', () => {
    const state = initialState();
    expect(state).toMatchObject({ markings: [], tool: 'none', size: 14, pending: null, zoom: 1, page: 1, dirty: false });
  });

  test('load replaces markings and clears dirty, pending and selection', () => {
    const dirty = run(loaded(), { type: 'pickTool', tool: 'line' }, { type: 'click', point: { x: 0.5, y: 0.5 }, page: 1 }, { type: 'select', id: 7 });
    const state = reduce(dirty, { type: 'load', markings: [leemac] });
    expect(idsOf(state)).toEqual([8]);
    expect(state).toMatchObject({ dirty: false, pending: null, selectedId: null });
  });

  test('pickTool sets the tool, drops a pending click, and picking it again turns it off', () => {
    let state = run(loaded(), { type: 'pickTool', tool: 'box' }, { type: 'click', point: { x: 0.1, y: 0.1 }, page: 1 });
    expect(state.pending).not.toBeNull();
    state = reduce(state, { type: 'pickTool', tool: 'line' });
    expect(state).toMatchObject({ tool: 'line', pending: null });
    expect(reduce(state, { type: 'pickTool', tool: 'line' }).tool).toBe('none');
  });

  test('setSize keeps the size within 1-40', () => {
    expect(reduce(initialState(), { type: 'setSize', size: 25 }).size).toBe(25);
    expect(reduce(initialState(), { type: 'setSize', size: 0 }).size).toBe(1);
    expect(reduce(initialState(), { type: 'setSize', size: 99 }).size).toBe(40);
  });

  test('a point click places a point at once with the slider size, a temp id and an empty note', () => {
    const state = run(initialState(), { type: 'setSize', size: 22 }, { type: 'pickTool', tool: 'point' }, { type: 'click', point: { x: 0.25, y: 0.75 }, page: 3 });
    expect(state.markings).toHaveLength(1);
    expect(state.markings[0]).toMatchObject({ kind: 'point', page: 3, x1: 0.25, y1: 0.75, size: 22, note: '', is_leemac: false, mine: true });
    expect(typeof state.markings[0].id).toBe('string');
    expect(state.pending).toBeNull();
    expect(state.dirty).toBe(true);
  });

  test.each([
    ['line', 'Click the second point'],
    ['box', 'Click the opposite corner'],
  ])('a %s needs two clicks and hints between them', (kind, secondHint) => {
    let state = run(initialState(), { type: 'pickTool', tool: kind });
    state = reduce(state, { type: 'click', point: { x: 0.1, y: 0.2 }, page: 2 });
    expect(state.markings).toHaveLength(0);
    expect(state.dirty).toBe(false);
    expect(hint(state)).toBe(secondHint);
    state = reduce(state, { type: 'click', point: { x: 0.6, y: 0.8 }, page: 2 });
    expect(state.markings[0]).toMatchObject({ kind, page: 2, x1: 0.1, y1: 0.2, x2: 0.6, y2: 0.8, size: null, note: '' });
    expect(state.pending).toBeNull();
    expect(state.dirty).toBe(true);
  });

  test('a second click on another page starts a new first click instead', () => {
    const state = run(initialState(), { type: 'pickTool', tool: 'line' },
      { type: 'click', point: { x: 0.1, y: 0.1 }, page: 1 }, { type: 'click', point: { x: 0.9, y: 0.9 }, page: 2 });
    expect(state.markings).toHaveLength(0);
    expect(state.pending).toMatchObject({ x: 0.9, y: 0.9, page: 2 });
  });

  test('clicks place nothing with no tool or the pan tool', () => {
    const click = { type: 'click', point: { x: 0.5, y: 0.5 }, page: 1 };
    expect(run(initialState(), click).markings).toHaveLength(0);
    expect(run(initialState(), { type: 'pickTool', tool: 'pan' }, click).markings).toHaveLength(0);
  });

  test('temporary ids are unique', () => {
    const state = run(initialState(), { type: 'pickTool', tool: 'point' },
      { type: 'click', point: { x: 0.1, y: 0.1 }, page: 1 }, { type: 'click', point: { x: 0.2, y: 0.2 }, page: 1 });
    expect(new Set(idsOf(state)).size).toBe(2);
  });

  test('hint covers each tool and the idle state', () => {
    const withTool = (tool) => reduce(initialState(), { type: 'pickTool', tool });
    expect(hint(initialState())).toMatch(/pick a tool/i);
    expect(hint(withTool('point'))).toBe('Click the drawing to place a point');
    expect(hint(withTool('line'))).toBe('Click the first point');
    expect(hint(withTool('box'))).toBe('Click the first corner');
    expect(hint(withTool('pan'))).toMatch(/pan/i);
  });

  test('setNote edits the client\'s own marking and marks dirty', () => {
    const state = reduce(loaded(), { type: 'setNote', id: 7, note: 'new' });
    expect(state.markings.find((m) => m.id === 7).note).toBe('new');
    expect(state.dirty).toBe(true);
  });

  test('setNote cuts the note at 255 characters', () => {
    const state = reduce(loaded(), { type: 'setNote', id: 7, note: 'x'.repeat(300) });
    expect(state.markings.find((m) => m.id === 7).note).toHaveLength(NOTE_MAX);
    expect(NOTE_MAX).toBe(255);
  });

  test('setNote refuses a Leemac marking', () => {
    const before = loaded();
    const state = reduce(before, { type: 'setNote', id: 8, note: 'hacked' });
    expect(state).toBe(before);
    expect(state.markings.find((m) => m.id === 8).note).toBe('theirs');
  });

  test('erase removes an own marking, clears its selection and marks dirty', () => {
    const state = run(loaded(), { type: 'select', id: 7 }, { type: 'hover', id: 7 }, { type: 'erase', id: 7 });
    expect(idsOf(state)).toEqual([8]);
    expect(state).toMatchObject({ selectedId: null, hoveredId: null, dirty: true });
  });

  test('erase refuses a Leemac marking and an unknown id', () => {
    const before = loaded();
    expect(reduce(before, { type: 'erase', id: 8 })).toBe(before);
    expect(reduce(before, { type: 'erase', id: 999 })).toBe(before);
  });

  test('clear removes only own markings', () => {
    const state = reduce(loaded(), { type: 'clear' });
    expect(idsOf(state)).toEqual([8]);
    expect(state.dirty).toBe(true);
  });

  test('clear with no own markings changes nothing', () => {
    const before = reduce(initialState(), { type: 'load', markings: [leemac] });
    expect(reduce(before, { type: 'clear' })).toBe(before);
  });

  test('hover and select set ids without marking dirty', () => {
    const state = run(loaded(), { type: 'hover', id: 8 }, { type: 'select', id: 8 });
    expect(state).toMatchObject({ hoveredId: 8, selectedId: 8, dirty: false });
  });

  test('setPage changes the page and drops a pending click', () => {
    const state = run(initialState(), { type: 'pickTool', tool: 'box' },
      { type: 'click', point: { x: 0.1, y: 0.1 }, page: 1 }, { type: 'setPage', page: 2 });
    expect(state).toMatchObject({ page: 2, pending: null, dirty: false });
  });

  test('zoom steps in and out and stays within bounds', () => {
    let state = reduce(initialState(), { type: 'zoom', direction: 'in' });
    expect(state.zoom).toBeCloseTo(1.25);
    expect(reduce(state, { type: 'zoom', direction: 'out' }).zoom).toBe(ZOOM_MIN);
    for (let i = 0; i < 20; i += 1) state = reduce(state, { type: 'zoom', direction: 'in' });
    expect(state.zoom).toBe(ZOOM_MAX);
    expect(reduce(initialState(), { type: 'zoom', direction: 'out' }).zoom).toBe(ZOOM_MIN);
  });

  test('pan stays inside the zoomed drawing, and zooming out pulls it back', () => {
    let state = run(initialState(), { type: 'zoom', direction: 'in' }, { type: 'pan', dx: 5, dy: 5 });
    expect(state.pan).toEqual({ x: 0.25, y: 0.25 });
    state = reduce(state, { type: 'pan', dx: -9, dy: -9 });
    expect(state.pan).toEqual({ x: 0, y: 0 });
    state = run(state, { type: 'pan', dx: 5, dy: 5 }, { type: 'zoom', direction: 'out' });
    expect(state.pan).toEqual({ x: 0, y: 0 });
  });

  test('zoom and pan never change marking fractions or dirty', () => {
    const before = loaded();
    const state = run(before, { type: 'zoom', direction: 'in' }, { type: 'pan', dx: 0.1, dy: 0.1 });
    expect(state.markings).toBe(before.markings);
    expect(state.dirty).toBe(false);
  });

  test('markSaved swaps temporary ids for server ids and clears dirty', () => {
    let state = run(loaded(), { type: 'pickTool', tool: 'point' }, { type: 'click', point: { x: 0.4, y: 0.4 }, page: 1 });
    const tempId = state.markings[2].id;
    state = run(state, { type: 'select', id: tempId }, { type: 'markSaved', idMap: { [tempId]: 55 } });
    expect(idsOf(state)).toEqual([7, 8, 55]);
    expect(state).toMatchObject({ dirty: false, selectedId: 55 });
  });
});
