// State for the client marking editor. Pure: no React, no DOM. Marking points are page fractions
// (qcGeometry.viewToPage); zoom and pan only change how the page is shown, never the markings.
export const SIZE_MIN = 1;
export const SIZE_MAX = 40;
export const SIZE_DEFAULT = 14;
export const NOTE_MAX = 255;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 1.25;

const IDLE_HINT = 'Hover a marking to read its note · click it to jump to its photos · pick a tool to mark the drawing';
const HINTS = {
  pan: () => 'Drag the drawing to pan · zoom with the buttons or pinch',
  point: () => 'Click the drawing to place a point',
  line: (state) => (state.pending ? 'Click the second point' : 'Click the first point'),
  box: (state) => (state.pending ? 'Click the opposite corner' : 'Click the first corner'),
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
// Client side edits the client's markings; leemac side edits Leemac's and never touches the client's.
const isOwnOn = (side, marking) => (side === 'leemac' ? marking.is_leemac : marking.mine && !marking.is_leemac);
const isOwn = (state, marking) => isOwnOn(state.side, marking);

export function initialState(markings = [], side = 'client') {
  return {
    side,
    markings,
    tool: 'none',
    size: SIZE_DEFAULT,
    pending: null,
    zoom: ZOOM_MIN,
    pan: { x: 0, y: 0 },
    selectedId: null,
    hoveredId: null,
    page: 1,
    dirty: false,
    tempCount: 0,
  };
}

export const hint = (state) => (HINTS[state.tool] ? HINTS[state.tool](state) : IDLE_HINT);

const edited = (state, changes) => ({ ...state, ...changes, dirty: true });

function addMarking(state, shape) {
  const marking = { id: `tmp-${state.tempCount + 1}`, note: '', is_leemac: state.side === 'leemac', mine: true, ...shape };
  return edited(state, { markings: [...state.markings, marking], tempCount: state.tempCount + 1, pending: null });
}

function click(state, { point, page }) {
  const { tool, size, pending } = state;
  if (tool === 'point') return addMarking(state, { kind: 'point', page, x1: point.x, y1: point.y, x2: null, y2: null, size });
  if (tool !== 'line' && tool !== 'box') return state;
  if (!pending || pending.page !== page) return { ...state, pending: { x: point.x, y: point.y, page } };
  return addMarking(state, { kind: tool, page, x1: pending.x, y1: pending.y, x2: point.x, y2: point.y, size: null });
}

function setNote(state, { id, note }) {
  const target = state.markings.find((m) => m.id === id);
  if (!target || !isOwn(state, target)) return state;
  const markings = state.markings.map((m) => (m === target ? { ...m, note: note.slice(0, NOTE_MAX) } : m));
  return edited(state, { markings });
}

function erase(state, { id }) {
  const target = state.markings.find((m) => m.id === id);
  if (!target || !isOwn(state, target)) return state;
  return removeOwn(state, (m) => m === target);
}

function removeOwn(state, shouldRemove) {
  const markings = state.markings.filter((m) => !shouldRemove(m));
  const gone = new Set(state.markings.filter(shouldRemove).map((m) => m.id));
  return edited(state, {
    markings,
    selectedId: gone.has(state.selectedId) ? null : state.selectedId,
    hoveredId: gone.has(state.hoveredId) ? null : state.hoveredId,
  });
}

function clear(state) {
  const ownMarking = (m) => isOwn(state, m);
  if (!state.markings.some(ownMarking)) return state;
  return removeOwn(state, ownMarking);
}

const clampPan = (pan, zoom) => ({
  x: clamp(pan.x, 0, zoom - ZOOM_MIN),
  y: clamp(pan.y, 0, zoom - ZOOM_MIN),
});

function zoom(state, { direction }) {
  const factor = direction === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
  const next = clamp(state.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  return { ...state, zoom: next, pan: clampPan(state.pan, next) };
}

function markSaved(state, { idMap, stillDirty = false }) {
  const swap = (id) => (id in idMap ? idMap[id] : id);
  return {
    ...state,
    markings: state.markings.map((m) => (m.id in idMap ? { ...m, id: idMap[m.id] } : m)),
    selectedId: swap(state.selectedId),
    hoveredId: swap(state.hoveredId),
    dirty: stillDirty,
  };
}

const handlers = {
  load: (state, { markings }) => ({ ...initialState(markings, state.side), tool: state.tool, size: state.size, zoom: state.zoom, pan: state.pan, page: state.page, tempCount: state.tempCount }),
  pickTool: (state, { tool }) => ({ ...state, tool: state.tool === tool ? 'none' : tool, pending: null }),
  setSize: (state, { size }) => ({ ...state, size: clamp(size, SIZE_MIN, SIZE_MAX) }),
  click,
  setNote,
  erase,
  clear,
  hover: (state, { id }) => ({ ...state, hoveredId: id }),
  select: (state, { id }) => ({ ...state, selectedId: id }),
  zoom,
  fit: (state) => ({ ...state, zoom: ZOOM_MIN, pan: { x: 0, y: 0 } }),
  pan: (state, { dx, dy }) => ({ ...state, pan: clampPan({ x: state.pan.x + dx, y: state.pan.y + dy }, state.zoom) }),
  setPage: (state, { page }) => ({ ...state, page, pending: null }),
  markSaved,
};

export function reduce(state, action) {
  const handler = handlers[action.type];
  return handler ? handler(state, action) : state;
}
