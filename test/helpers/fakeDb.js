function makeFakeDb(handlers = []) {
    const calls = [];

    async function run(sql, params) {
        calls.push({ sql, params });
        const handler = handlers.find((h) => h.match.test(sql));
        return [handler ? handler.rows : []];
    }

    return { execute: run, query: run, calls };
}

module.exports = { makeFakeDb };
