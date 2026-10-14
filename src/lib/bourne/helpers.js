const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const INTEGER = /^\d+$/;

class BadQuery extends Error {}

function parseInteger(value, name) {
    if (!INTEGER.test(value)) throw new BadQuery(`${name} must be a non-negative integer.`);
    return Number(value);
}

function parsePaging({ limit, offset }) {
    const requested = limit === undefined ? DEFAULT_LIMIT : parseInteger(limit, 'limit');
    return {
        limit: Math.min(Math.max(requested, 1), MAX_LIMIT),
        offset: offset === undefined ? 0 : parseInteger(offset, 'offset'),
    };
}

const placeholders = (ids) => ids.map(() => '?').join(', ');

function groupBy(rows, key) {
    const groups = new Map();
    for (const row of rows) {
        if (!groups.has(row[key])) groups.set(row[key], []);
        groups.get(row[key]).push(row);
    }
    return groups;
}

function fileMeta({ id, filename, mimetype, size, uploaded_at }) {
    return { id, filename, mimetype, size, uploaded_at };
}

async function selectIn(db, sql, ids) {
    if (ids.length === 0) return [];
    const [rows] = await db.execute(sql.replace('(?)', `(${placeholders(ids)})`), ids);
    return rows;
}

module.exports = { BadQuery, parseInteger, parsePaging, groupBy, fileMeta, selectIn };
