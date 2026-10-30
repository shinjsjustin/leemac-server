const ROLES = ['letter', 'label'];
const MAX_COPIES = 20;
const QUEUE_NAME = /^[A-Za-z0-9_.-]+$/;
const LABEL_KINDS = ['shipping'];

function fail(code, message) {
    return Object.assign(new Error(message), { code });
}

function parseCopies(copies) {
    return typeof copies === 'string' ? JSON.parse(copies) : copies;
}

function validate(fields) {
    if ('name' in fields && !(typeof fields.name === 'string' && fields.name.trim())) throw fail('INVALID', 'name required');
    if ('role' in fields && !ROLES.includes(fields.role)) throw fail('INVALID', 'role must be letter or label');
    if ('cups_queue' in fields && !(typeof fields.cups_queue === 'string' && QUEUE_NAME.test(fields.cups_queue))) {
        throw fail('INVALID', 'invalid cups_queue');
    }
    if ('media' in fields && !(typeof fields.media === 'string' && fields.media.trim())) throw fail('INVALID', 'media required');
    if ('copies' in fields) {
        const values = Object.values(fields.copies || {});
        if (!values.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_COPIES)) {
            throw fail('INVALID', `copies must be integers 0-${MAX_COPIES}`);
        }
    }
}

async function listPrinters(db) {
    const [rows] = await db.execute('SELECT * FROM printer ORDER BY id');
    return rows;
}

async function createPrinter(db, fields) {
    const required = ['name', 'cups_queue', 'role', 'media', 'copies'];
    const missing = required.filter((k) => !(k in fields));
    if (missing.length) throw fail('INVALID', `missing ${missing.join(', ')}`);
    validate(fields);
    const [result] = await db.execute(
        'INSERT INTO printer (name, cups_queue, role, media, copies, enabled) VALUES (?, ?, ?, ?, ?, ?)',
        [fields.name, fields.cups_queue, fields.role, fields.media, JSON.stringify(fields.copies), fields.enabled === false ? 0 : 1]
    );
    return result.insertId;
}

const UPDATABLE = ['name', 'cups_queue', 'role', 'media', 'copies', 'enabled'];

async function updatePrinter(db, id, fields) {
    validate(fields);
    const keys = UPDATABLE.filter((k) => k in fields);
    if (!keys.length) throw fail('INVALID', 'nothing to update');
    const values = keys.map((k) => {
        if (k === 'copies') return JSON.stringify(fields.copies);
        if (k === 'enabled') return fields.enabled ? 1 : 0;
        return fields[k];
    });
    const [result] = await db.execute(
        `UPDATE printer SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...values, id]
    );
    if (!result.affectedRows) throw fail('NOT_FOUND', 'printer not found');
}

async function pickPrinter(db, kind) {
    const role = LABEL_KINDS.includes(kind) ? 'label' : 'letter';
    const [rows] = await db.execute('SELECT * FROM printer WHERE role = ? AND enabled = 1 ORDER BY id LIMIT 1', [role]);
    if (!rows.length) throw fail('NO_PRINTER', `no enabled ${role} printer`);
    return rows[0];
}

function lpOptions(printer, kind) {
    const copies = parseCopies(printer.copies)[kind] ?? 1;
    const options = printer.role === 'label' ? ['media=4x6', 'scaling=100'] : ['media=Letter', 'fit-to-page'];
    return { copies, options };
}

module.exports = { listPrinters, createPrinter, updatePrinter, pickPrinter, lpOptions };
