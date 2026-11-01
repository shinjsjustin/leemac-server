const { listVendors } = require('../../lib/supplierExpenses');

function vendorsHandler(db) {
    return async (req, res) => {
        try {
            res.json({ vendors: await listVendors(db) });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch vendors.' });
        }
    };
}

module.exports = { vendorsHandler };
