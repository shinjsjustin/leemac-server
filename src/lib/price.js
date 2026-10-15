const CENTS_PER_UNIT = 100;

function normalizePrice(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'number' && typeof value !== 'string') {
        throw new Error('Invalid price');
    }
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid price');
    return Math.round(price * CENTS_PER_UNIT) / CENTS_PER_UNIT;
}

module.exports = { normalizePrice };
