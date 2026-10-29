const { STAGES, stageOf, stageIndex, stageLabel, jobStage, dueFlag } = require('./shopStages');

const PRICE_ACCESS = 2;
const INVOICE_ACCESS = 3;
const DONE_INDEX = stageIndex('done');

async function getAdminOverview(db, access, now = new Date()) {
    const [rows] = await db.execute(
        `SELECT j.id AS job_id, j.job_number, j.attention AS job_attention, j.po_number, j.due_date, j.ship_date,
                j.invoice_number, j.invoice_status, j.total_cost, c.name AS company_name,
                jp.id AS job_part_id, jp.part_id, jp.rev, jp.material, jp.finish, jp.quantity, jp.price,
                p.number, p.description,
                s.status, s.attention AS star_attention, s.urgent, s.waiting, s.nfc_tag_id
         FROM stars s
         JOIN job_part jp ON s.job_part_id = jp.id
         JOIN job j ON jp.job_id = j.id
         JOIN company c ON j.company_id = c.id
         JOIN part p ON jp.part_id = p.id
         ORDER BY j.id, jp.id`
    );
    const [history] = await db.execute(
        `SELECT h.job_part_id, MAX(h.changed_at) AS changed_at
         FROM star_status_history h
         JOIN stars s ON s.job_part_id = h.job_part_id
         WHERE h.kind = 'status'
         GROUP BY h.job_part_id`
    );
    const sinceByPart = new Map(history.map((h) => [h.job_part_id, h.changed_at]));

    const canSeePrice = access >= PRICE_ACCESS;
    const jobs = new Map();
    const contacts = new Map();
    const stageCounts = Object.fromEntries(STAGES.map((s) => [s.key, 0]));
    let activeParts = 0;
    let openValue = 0;

    for (const r of rows) {
        const stage = stageOf(r.status);
        stageCounts[stage] += 1;
        const isActive = stageIndex(stage) < DONE_INDEX;
        if (isActive) {
            activeParts += 1;
            openValue += Number(r.price || 0) * Number(r.quantity || 0);
            contacts.set(r.star_attention, (contacts.get(r.star_attention) || 0) + 1);
        }
        if (!jobs.has(r.job_id)) {
            jobs.set(r.job_id, { row: r, statuses: [], parts: [] });
        }
        const job = jobs.get(r.job_id);
        job.statuses.push(r.status);
        const part = {
            job_part_id: r.job_part_id, part_id: r.part_id, number: r.number, rev: r.rev,
            description: r.description, material: r.material, finish: r.finish, quantity: r.quantity,
            ...(canSeePrice && { price: r.price }),
            status: r.status, stage: stageLabel(stage),
            urgent: Boolean(r.urgent), waiting: Boolean(r.waiting),
            since: sinceByPart.get(r.job_part_id) ?? null, paired: r.nfc_tag_id != null,
        };
        job.parts.push(part);
    }

    let dueSoon = 0;
    let overdue = 0;
    let invoicesWaiting = { count: 0, total: 0 };
    const jobList = [...jobs.entries()].map(([id, { row, statuses, parts }]) => {
        const flag = dueFlag(row, jobStage(row, statuses), now);
        if (flag === 'due_soon') dueSoon += 1;
        if (flag === 'overdue') overdue += 1;
        if (row.invoice_number && row.invoice_status === 'waiting') {
            invoicesWaiting = { count: invoicesWaiting.count + 1, total: invoicesWaiting.total + Number(row.total_cost || 0) };
        }
        return {
            id, job_number: row.job_number, company_name: row.company_name, attention: row.job_attention,
            po_number: row.po_number, due_date: row.due_date, flag,
            invoice_number: row.invoice_number, invoice_status: row.invoice_status, parts,
        };
    });

    const headline = { active_parts: activeParts, due_soon: dueSoon, overdue };
    if (canSeePrice) headline.open_value = openValue;
    if (access >= INVOICE_ACCESS) headline.invoices_waiting = invoicesWaiting;

    return {
        headline,
        contacts: [...contacts.entries()].map(([attention, count]) => ({ attention, count })),
        stage_counts: stageCounts,
        jobs: jobList,
    };
}

module.exports = { getAdminOverview };
