const LEADING_COMMENTS = /^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)+/;

// Clauses that make a SELECT write to disk/session state or take locks.
const FORBIDDEN_CLAUSES = /\b(into\s+(outfile|dumpfile)\b|into\s+@|for\s+(update|share)\b|lock\s+in\s+share\s+mode\b)/i;

function assertSelectOnly(sql) {
    const stripped = String(sql).replace(LEADING_COMMENTS, '');
    if (!/^select\b/i.test(stripped) || stripped.includes(';') || FORBIDDEN_CLAUSES.test(stripped)) {
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
