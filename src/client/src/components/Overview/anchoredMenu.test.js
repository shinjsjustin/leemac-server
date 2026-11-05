import { placeMenu } from './anchoredMenu';

const viewport = { width: 1000, height: 800 };
const size = { width: 200, height: 150 };
const anchorAt = (top, right, side = 28) => ({ top, bottom: top + side, left: right - side, right });

test.each([
  ['opens below the anchor when it fits', anchorAt(100, 500), size, 'end', { top: 132, left: 300, maxHeight: undefined }],
  ['aligns the start edge with the anchor', anchorAt(100, 500), size, 'start', { top: 132, left: 472, maxHeight: undefined }],
  ['flips above when there is more room above', anchorAt(700, 500), size, 'end', { top: 546, left: 300, maxHeight: undefined }],
  ['stays below when it does not fit but below has more room', anchorAt(300, 500), { width: 200, height: 600 }, 'end', { top: 332, left: 300, maxHeight: 460 }],
  ['clamps to the right edge with an 8px margin', anchorAt(100, 1000), size, 'start', { top: 132, left: 792, maxHeight: undefined }],
  ['clamps to the left edge with an 8px margin', anchorAt(100, 40), size, 'end', { top: 132, left: 8, maxHeight: undefined }],
  ['limits height to the room above when neither side fits', anchorAt(500, 500), { width: 200, height: 900 }, 'end', { top: 8, left: 300, maxHeight: 488 }],
])('placeMenu %s', (_name, anchor, menuSize, align, expected) => {
  expect(placeMenu({ anchor, size: menuSize, viewport, align })).toEqual(expected);
});
