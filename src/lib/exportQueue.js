const DEFAULT_MAX_WAIT_MS = 300000;

class ExportQueueTimeout extends Error {
    constructor() {
        super('Another export is still running; try again shortly');
        this.name = 'ExportQueueTimeout';
        this.status = 503;
    }
}

// Exports share one Google sheet, so they must run strictly one at a time.
function createExportQueue({ maxWaitMs = DEFAULT_MAX_WAIT_MS } = {}) {
    let tail = Promise.resolve();
    let pending = 0;

    function run(fn) {
        const previous = tail;
        pending++;

        let timer;
        const timedOut = new Promise((resolve) => {
            timer = setTimeout(() => resolve(true), maxWaitMs);
        });
        const turn = previous.then(() => false);

        const result = Promise.race([turn, timedOut]).then((didTimeOut) => {
            clearTimeout(timer);
            if (didTimeOut) throw new ExportQueueTimeout();
            return fn();
        });

        // A timed-out job still sits behind earlier jobs, so later ones can't overlap them.
        tail = result.then(
            () => undefined,
            (err) => (err instanceof ExportQueueTimeout ? previous : undefined)
        );
        const finish = () => { pending--; };
        result.then(finish, finish);
        return result;
    }

    return { run, size: () => pending };
}

module.exports = { createExportQueue, ExportQueueTimeout };
