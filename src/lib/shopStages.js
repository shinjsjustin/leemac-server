const STAGES = [
    { key: 'quoted', label: 'Quoted' },
    { key: 'in_shop', label: 'In the shop' },
    { key: 'material', label: 'Material' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'machining', label: 'Machining' },
    { key: 'outside_finishing', label: 'Outside finishing' },
    { key: 'finishing', label: 'Finishing' },
    { key: 'inspection', label: 'Inspection' },
    { key: 'packing', label: 'Packing' },
    { key: 'done', label: 'Done' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'invoiced', label: 'Invoiced' },
];

// Job stages with no star behind them; kept out of STAGES so they have no place in shop order.
const FALLBACK_STAGES = [
    { key: 'open', label: 'Open' },
    { key: 'shipped', label: 'Shipped' },
];

const STAGE_BY_STATUS = {
    quoted: 'quoted',
    open: 'in_shop',
    urgent: 'in_shop',
    waiting: 'in_shop',
    checking_stock: 'material',
    waiting_material: 'material',
    programming: 'preparing',
    setup: 'preparing',
    running_machine_a: 'machining',
    running_machine_d: 'machining',
    running_manual: 'machining',
    at_subvendor: 'outside_finishing',
    waiting_finish: 'outside_finishing',
    deburr_clean: 'finishing',
    qa: 'inspection',
    packing: 'packing',
    done: 'done',
    delivered: 'delivered',
    invoiced: 'invoiced',
};

const DUE_SOON_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DONE_INDEX = STAGES.findIndex((s) => s.key === 'done');

const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

const stageLabel = (key) => [...STAGES, ...FALLBACK_STAGES].find((s) => s.key === key);

const stageOf = (starStatus) => STAGE_BY_STATUS[starStatus];

// Calendar-day number; mysql2 gives Date (local midnight), sqlite gives 'YYYY-MM-DD'.
const dayNumber = (value) => {
    if (value instanceof Date) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / MS_PER_DAY;
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d) / MS_PER_DAY;
};

const jobStage = (job, starStatuses) => {
    if (starStatuses.length) {
        return starStatuses.map(stageOf).reduce((a, b) => (stageIndex(b) < stageIndex(a) ? b : a));
    }
    if (job.invoice_date) return 'invoiced';
    if (job.ship_date) return 'shipped';
    return 'open';
};

const dueFlag = (job, stage, now) => {
    if (job.ship_date || !job.due_date || stageIndex(stage) >= DONE_INDEX) return null;
    const daysAhead = dayNumber(job.due_date) - dayNumber(now);
    if (daysAhead < 0) return 'overdue';
    return daysAhead <= DUE_SOON_DAYS ? 'due_soon' : null;
};

module.exports = { STAGES, stageOf, stageIndex, stageLabel, dayNumber, jobStage, dueFlag };
