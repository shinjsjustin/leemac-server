export function createQueue(limit = 2) {
  let active = 0;
  const waiting = [];

  const next = () => {
    if (active >= limit || waiting.length === 0) return;
    const { task, resolve, reject } = waiting.shift();
    active += 1;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        waiting.push({ task, resolve, reject });
        next();
      });
    },
  };
}
