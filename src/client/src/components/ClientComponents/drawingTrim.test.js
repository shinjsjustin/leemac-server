import { contentBox } from './drawingTrim';

// Builds a white RGBA image with the given [x, y, [r, g, b]] pixels painted.
const image = (width, height, painted = []) => {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  painted.forEach(([x, y, rgb]) => {
    const i = (y * width + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  });
  return { data, width, height };
};

describe('contentBox', () => {
  it('returns the bounding box of dark pixels grown by the margin', () => {
    const img = image(20, 20, [[5, 6, [0, 0, 0]], [8, 9, [10, 10, 10]]]);
    expect(contentBox(img, { margin: 2 })).toEqual({ x: 3, y: 4, width: 8, height: 8 });
  });

  it('clamps the grown box to the image', () => {
    const img = image(10, 10, [[1, 1, [0, 0, 0]], [9, 9, [0, 0, 0]]]);
    expect(contentBox(img, { margin: 5 })).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('defaults the margin to 8px', () => {
    const img = image(40, 40, [[20, 20, [0, 0, 0]]]);
    expect(contentBox(img)).toEqual({ x: 12, y: 12, width: 17, height: 17 });
  });

  it('counts a pixel as content when any one channel is below the threshold', () => {
    const img = image(10, 10, [[4, 5, [255, 255, 200]]]);
    expect(contentBox(img, { margin: 0 })).toEqual({ x: 4, y: 5, width: 1, height: 1 });
  });

  it('ignores near-white pixels at or above the default threshold of 245', () => {
    const img = image(10, 10, [[2, 2, [245, 250, 255]], [6, 7, [244, 255, 255]]]);
    expect(contentBox(img, { margin: 0 })).toEqual({ x: 6, y: 7, width: 1, height: 1 });
  });

  it('honours a custom threshold', () => {
    const img = image(10, 10, [[3, 3, [200, 200, 200]]]);
    expect(contentBox(img, { threshold: 128, margin: 0 })).toBeNull();
    expect(contentBox(img, { threshold: 210, margin: 0 })).toEqual({ x: 3, y: 3, width: 1, height: 1 });
  });

  it('returns null for an all-white image', () => {
    expect(contentBox(image(10, 10))).toBeNull();
  });
});
