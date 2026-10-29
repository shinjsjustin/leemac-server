import { createDrawingQueue } from './drawingQueue';

const FILE = (id) => ({ id, filename: `f${id}.pdf` });

// A render whose promises the test resolves by hand, so concurrency is observable.
const makeHarness = (options = {}) => {
  const pending = [];
  const fetchUrl = jest.fn().mockResolvedValue({ ok: true, url: 'blob:x' });
  const render = jest.fn(() => new Promise((resolve) => pending.push(resolve)));
  global.URL.revokeObjectURL = jest.fn();
  const queue = createDrawingQueue({ fetchUrl, render, ...options });
  return { queue, fetchUrl, render, pending };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('drawingQueue', () => {
  it('runs at most 2 renders at once and starts the next when one finishes', async () => {
    const { queue, render, pending } = makeHarness();
    [1, 2, 3].forEach((id) => queue.enqueue(FILE(id), 300));
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
    pending[0](['data:1']);
    await tick();
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('renders page 1 at the width, revokes the blob URL and resolves the data URL', async () => {
    const { queue, render, pending } = makeHarness();
    const { promise } = queue.enqueue(FILE(1), 300);
    await tick();
    expect(render).toHaveBeenCalledWith('blob:x', 300, true);
    pending[0](['data:1', 'data:other']);
    await expect(promise).resolves.toEqual({ ok: true, src: 'data:1' });
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('serves a repeat file id and width from cache without rendering again', async () => {
    const { queue, render, fetchUrl, pending } = makeHarness();
    queue.enqueue(FILE(1), 300);
    await tick();
    pending[0](['data:1']);
    await tick();
    const again = await queue.enqueue(FILE(1), 300).promise;
    expect(again).toEqual({ ok: true, src: 'data:1' });
    expect(render).toHaveBeenCalledTimes(1);
    expect(fetchUrl).toHaveBeenCalledTimes(1);
    queue.enqueue(FILE(1), 600);
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('drops a cancelled job before it starts', async () => {
    const { queue, render, pending } = makeHarness();
    queue.enqueue(FILE(1), 300);
    queue.enqueue(FILE(2), 300);
    const third = queue.enqueue(FILE(3), 300);
    third.cancel();
    await tick();
    pending[0](['data:1']);
    pending[1](['data:2']);
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
    await expect(third.promise).resolves.toEqual({ ok: false, cancelled: true });
  });

  it('resolves not ok when the fetch fails, and revokes nothing', async () => {
    const { queue, fetchUrl, render } = makeHarness();
    fetchUrl.mockResolvedValue({ ok: false, error: { kind: 'not_found' } });
    await expect(queue.enqueue(FILE(1), 300).promise).resolves.toEqual({ ok: false });
    expect(render).not.toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('resolves not ok and frees the slot when a render throws', async () => {
    const { queue, render } = makeHarness({ concurrency: 1 });
    render.mockRejectedValueOnce(new Error('bad pdf')).mockResolvedValueOnce(['data:2']);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const first = queue.enqueue(FILE(1), 300).promise;
    const second = queue.enqueue(FILE(2), 300).promise;
    await expect(first).resolves.toEqual({ ok: false });
    await expect(second).resolves.toEqual({ ok: true, src: 'data:2' });
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    console.error.mockRestore();
  });

  it('evicts the oldest cache entry past the cap', async () => {
    const { queue, render } = makeHarness({ cacheSize: 2 });
    render.mockImplementation(async () => ['data:x']);
    for (const id of [1, 2, 3]) await queue.enqueue(FILE(id), 300).promise;
    expect(render).toHaveBeenCalledTimes(3);
    await queue.enqueue(FILE(3), 300).promise;
    await queue.enqueue(FILE(2), 300).promise;
    expect(render).toHaveBeenCalledTimes(3);
    await queue.enqueue(FILE(1), 300).promise;
    expect(render).toHaveBeenCalledTimes(4);
  });
});
