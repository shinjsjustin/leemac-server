import { createQueue } from './drawingQueue';

test('queue runs at most 2 tasks at once and runs every task', async () => {
  const queue = createQueue();
  let active = 0;
  let peak = 0;
  let done = 0;
  const task = () => new Promise((resolve) => {
    active += 1;
    peak = Math.max(peak, active);
    setTimeout(() => { active -= 1; done += 1; resolve(done); }, 5);
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => queue.run(task)));
  expect(peak).toBe(2);
  expect(done).toBe(10);
  expect(results).toHaveLength(10);
});

test('queue keeps going after a task rejects and passes the rejection on', async () => {
  const queue = createQueue(1);
  const bad = queue.run(() => Promise.reject(new Error('x')));
  const good = queue.run(() => Promise.resolve('ok'));
  await expect(bad).rejects.toThrow('x');
  await expect(good).resolves.toBe('ok');
});
