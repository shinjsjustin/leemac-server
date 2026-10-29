const { STAGES, stageOf, stageIndex } = require('./shopStages');

const INVOICE_ACCESS = 3;
const DONE_INDEX = STAGES.findIndex((s) => s.key === 'done');

const isActive = (status) => {
    const stage = stageOf(status);
    return stage !== undefined && stageIndex(stage) < DONE_INDEX;
};

async function getBadges(db, access) {
    const [stars] = await db.execute('SELECT status FROM stars');
    const [[requests]] = await db.execute("SELECT COUNT(*) AS n FROM quote_request WHERE status = 'sent'");
    const badges = {
        active_parts: stars.filter((s) => isActive(s.status)).length,
        new_requests: Number(requests.n),
    };
    if (access < INVOICE_ACCESS) return badges;
    const [[waiting]] = await db.execute(
        "SELECT COUNT(*) AS n FROM job WHERE invoice_status = 'waiting' AND invoice_number IS NOT NULL AND invoice_number <> ''"
    );
    return { ...badges, waiting_invoices: Number(waiting.n) };
}

module.exports = { getBadges };
