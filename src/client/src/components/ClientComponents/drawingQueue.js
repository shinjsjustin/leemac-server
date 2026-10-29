import { renderPdfPagesToImages } from '../PdfImage';
import { fetchDrawingUrl } from '../../api/portalApi';

const MAX_CONCURRENT_RENDERS = 2;
const MAX_CACHE_ENTRIES = 80;

export const createDrawingQueue = ({
  fetchUrl = fetchDrawingUrl,
  render = renderPdfPagesToImages,
  concurrency = MAX_CONCURRENT_RENDERS,
  cacheSize = MAX_CACHE_ENTRIES,
} = {}) => {
  const cache = new Map();
  const waiting = [];
  let running = 0;

  const store = (key, src) => {
    cache.set(key, src);
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
  };

  const renderFirstPage = async (file, width) => {
    const fetched = await fetchUrl(file);
    if (!fetched.ok) return { ok: false };
    try {
      const [src] = await render(fetched.url, width, true);
      return { ok: true, src };
    } catch (error) {
      console.error('Error rendering drawing:', error);
      return { ok: false };
    } finally {
      URL.revokeObjectURL(fetched.url);
    }
  };

  const pump = () => {
    while (running < concurrency && waiting.length) {
      const job = waiting.shift();
      running += 1;
      renderFirstPage(job.file, job.width)
        .catch(() => ({ ok: false }))
        .then((result) => {
          if (result.ok) store(job.key, result.src);
          running -= 1;
          job.resolve(result);
          pump();
        });
    }
  };

  const enqueue = (file, width) => {
    const key = `${file.id}:${width}`;
    if (cache.has(key)) {
      return { promise: Promise.resolve({ ok: true, src: cache.get(key) }), cancel: () => {} };
    }
    let job;
    const promise = new Promise((resolve) => { job = { file, width, key, resolve }; });
    waiting.push(job);
    pump();
    const cancel = () => {
      const index = waiting.indexOf(job);
      if (index === -1) return;
      waiting.splice(index, 1);
      job.resolve({ ok: false, cancelled: true });
    };
    return { promise, cancel };
  };

  return { enqueue };
};

export const { enqueue } = createDrawingQueue();
