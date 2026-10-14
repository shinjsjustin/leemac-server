const LEADING_COMMENTS = /^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)+/;

function assertSelectOnly(sql) {
    const stripped = String(sql).replace(LEADING_COMMENTS, '');
    if (!/^select\b/i.test(stripped) || stripped.includes(';')) {
        throw new Error('Bourne db is read-only: only a single SELECT is allowed.');
    }
}

function readOnly(db) {
    const guard = (method) => async (sql, params) => {
        assertSelectOnly(sql);
        return db[method](sql, params);
    };
    return { execute: guard('execute'), query: guard('query') };
}

module.exports = { readOnly };
