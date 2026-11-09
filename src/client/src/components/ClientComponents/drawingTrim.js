const DEFAULT_THRESHOLD = 245;
const DEFAULT_MARGIN = 8;
const CHANNELS = 4;

// Bounding box of pixels darker than threshold in any of r, g, b, grown by margin and clamped.
export function contentBox({ data, width, height }, { threshold = DEFAULT_THRESHOLD, margin = DEFAULT_MARGIN } = {}) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * CHANNELS;
      if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x = Math.max(0, minX - margin);
  const y = Math.max(0, minY - margin);
  return {
    x,
    y,
    width: Math.min(width, maxX + margin + 1) - x,
    height: Math.min(height, maxY + margin + 1) - y,
  };
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

// Crops src to its content. Resolves { url, box, pageWidth, pageHeight } with the crop box in
// source pixels; box is null and url is src unchanged when it can't trim. Never rejects.
export async function trimWithBox(src) {
  let pageWidth = 0;
  let pageHeight = 0;
  try {
    const img = await loadImage(src);
    pageWidth = img.naturalWidth;
    pageHeight = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return { url: src, box: null, pageWidth, pageHeight };
    ctx.drawImage(img, 0, 0);
    const box = contentBox(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!box) return { url: src, box: null, pageWidth, pageHeight };
    const out = document.createElement('canvas');
    out.width = box.width;
    out.height = box.height;
    out.getContext('2d').drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    return { url: out.toDataURL('image/png'), box, pageWidth, pageHeight };
  } catch {
    return { url: src, box: null, pageWidth, pageHeight };
  }
}

export async function trimDataUrl(src) {
  return (await trimWithBox(src)).url;
}
