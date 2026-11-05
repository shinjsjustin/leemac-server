const TOLERANCE_PX = 1;

function isInsideViewport(rect, viewport) {
  return rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height;
}

function rectsMatch(first, second, tolerance = TOLERANCE_PX) {
  if (first.length !== second.length) return false;
  const sides = ['left', 'top', 'right', 'bottom'];
  return first.every((rect, i) => sides.every((side) => Math.abs(rect[side] - second[i][side]) <= tolerance));
}

module.exports = { isInsideViewport, rectsMatch };
