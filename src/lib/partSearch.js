const PARTS_SELECT = `SELECT DISTINCT 
                p.id,
                p.number,
                p.description,
                jp.price,
                jp.quantity,
                jp.rev,
                jp.details,
                jp.material,
                jp.finish,
                j.job_number,
                j.created_at
             FROM part p
             LEFT JOIN job_part jp ON p.id = jp.part_id
             LEFT JOIN job j ON jp.job_id = j.id`;
const ORDER_BY = 'ORDER BY p.number, j.created_at DESC';

const SEARCH_PARTS_SQL = `${PARTS_SELECT}
             WHERE p.number LIKE ? OR p.description LIKE ?
             ${ORDER_BY}`;
const EXACT_PARTS_SQL = `${PARTS_SELECT}
             WHERE LOWER(REPLACE(p.number, ' ', '')) = ?
             ${ORDER_BY}`;

// Group joined rows by part, each with its job pricing history.
function groupParts(rows) {
    const groupedResults = rows.reduce((acc, row) => {
        if (!acc[row.id]) {
            acc[row.id] = {
                id: row.id,
                number: row.number,
                description: row.description,
                history: []
            };
        }

        if (row.job_number) {
            acc[row.id].history.push({
                price: row.price,
                quantity: row.quantity,
                rev: row.rev,
                details: row.details,
                material: row.material,
                finish: row.finish,
                job_number: row.job_number,
                created_at: row.created_at
            });
        }

        return acc;
    }, {});
    return Object.values(groupedResults);
}

async function searchParts(db, term) {
    const [rows] = await db.execute(SEARCH_PARTS_SQL, [`%${term}%`, `%${term}%`]);
    return groupParts(rows);
}

function numberKey(number) {
    return String(number).toLowerCase().replace(/ /g, '');
}

async function findExactParts(db, number) {
    const [rows] = await db.execute(EXACT_PARTS_SQL, [numberKey(number)]);
    return groupParts(rows);
}

// The part a line should join: the trim-and-case-equal one, else the lowest id.
function pickJoinPart(number, parts) {
    const want = String(number).trim().toLowerCase();
    const exact = parts.find((p) => String(p.number).trim().toLowerCase() === want);
    if (exact) return exact;
    return parts.reduce((low, p) => (!low || p.id < low.id ? p : low), null);
}

module.exports = { searchParts, findExactParts, numberKey, pickJoinPart, EXACT_PARTS_SQL };
