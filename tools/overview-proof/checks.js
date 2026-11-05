const TOLERANCE_PX = 1;

function isInsideViewport(rect, viewport) {
  return rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height;
}

function rectsMatch(first, second, tolerance = TOLERANCE_PX) {
  if (first.length !== second.length) return false;
  const sides = ['left', 'top', 'right', 'bottom'];
  return first.every((rect, i) => sides.every((side) => Math.abs(rect[side] - second[i][side]) <= tolerance));
}

// Sections whose box is taller than the content painted inside them by more than slackPx.
function overTallSections(sections, slackPx) {
  return sections
    .map(({ name, height, painted }) => ({ name, extra: height - painted }))
    .filter((s) => s.extra > slackPx);
}

// True only if the toggle moved and the menu moved by the same distance.
function followsAnchor(before, after) {
  const toggleMoved = after.toggle.top - before.toggle.top;
  const menuMoved = after.menu.top - before.menu.top;
  return Math.abs(toggleMoved) > TOLERANCE_PX && Math.abs(menuMoved - toggleMoved) <= TOLERANCE_PX;
}

module.exports = { isInsideViewport, rectsMatch, overTallSections, followsAnchor };
