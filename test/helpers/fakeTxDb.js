const { makeFakeDb } = require('./fakeDb');

// makeFakeDb plus getConnection(). A handler's rows may be a function of the
// params; a handler with an error field throws it.
function makeFakeTxDb(handlers = []) {
    const base = makeFakeDb();
    const { calls } = base;

    async function run(sql, params) {
        calls.push({ sql, params });
        const handler = handlers.find((h) => h.match.test(sql));
        if (handler && handler.error) throw handler.error;
        if (!handler) return [[]];
        return [typeof handler.rows === 'function' ? handler.rows(params) : handler.rows];
    }

    const connection = {
        execute: run,
        query: run,
        beginTransaction: async () => { calls.push({ tx: 'beginTransaction' }); },
        commit: async () => { calls.push({ tx: 'commit' }); },
        rollback: async () => { calls.push({ tx: 'rollback' }); },
        release: () => { calls.push({ tx: 'release' }); },
    };

    return {
        ...base,
        execute: run,
        query: run,
        getConnection: async () => connection,
    };
}

module.exports = { makeFakeTxDb };
