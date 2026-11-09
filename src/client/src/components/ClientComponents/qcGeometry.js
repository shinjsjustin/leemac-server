// Markings are fractions (0-1) of the full untrimmed page. The portal shows the page cropped to
// trim.box (source pixels) and scaled to viewWidth, so view pixels = (page px - box origin) * scale.
const DEFAULT_RADIUS = 14;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

const frame = ({ box, pageWidth, pageHeight }, viewWidth) => {
  const crop = box || { x: 0, y: 0, width: pageWidth, height: pageHeight };
  return { crop, pageWidth, pageHeight, scale: viewWidth / crop.width };
};

export function pageToView(point, trim, viewWidth) {
  const { crop, pageWidth, pageHeight, scale } = frame(trim, viewWidth);
  return {
    x: (clamp01(point.x) * pageWidth - crop.x) * scale,
    y: (clamp01(point.y) * pageHeight - crop.y) * scale,
  };
}

export function viewToPage(point, trim, viewWidth) {
  const { crop, pageWidth, pageHeight, scale } = frame(trim, viewWidth);
  return {
    x: clamp01((point.x / scale + crop.x) / pageWidth),
    y: clamp01((point.y / scale + crop.y) / pageHeight),
  };
}

export function markingToView(marking, trim, viewWidth) {
  const start = pageToView({ x: marking.x1, y: marking.y1 }, trim, viewWidth);
  if (marking.kind === 'point') return { kind: 'point', x1: start.x, y1: start.y };
  const end = pageToView({ x: marking.x2, y: marking.y2 }, trim, viewWidth);
  return { kind: marking.kind, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// 0 inside the box, otherwise the distance to its nearest edge.
function boxDistance(p, v) {
  const dx = Math.max(Math.min(v.x1, v.x2) - p.x, 0, p.x - Math.max(v.x1, v.x2));
  const dy = Math.max(Math.min(v.y1, v.y2) - p.y, 0, p.y - Math.max(v.y1, v.y2));
  return Math.hypot(dx, dy);
}

function markingDistance(marking, viewPoint, trim, viewWidth) {
  const v = markingToView(marking, trim, viewWidth);
  if (v.kind === 'point') return distance(viewPoint, { x: v.x1, y: v.y1 });
  if (v.kind === 'line') return segmentDistance(viewPoint, { x: v.x1, y: v.y1 }, { x: v.x2, y: v.y2 });
  return boxDistance(viewPoint, v);
}

// Markings within radius screen pixels of viewPoint, nearest first.
export function hitTest(markings, viewPoint, trim, viewWidth, radius = DEFAULT_RADIUS) {
  return markings
    .map((marking) => ({ marking, d: markingDistance(marking, viewPoint, trim, viewWidth) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d)
    .map(({ marking }) => marking);
}
