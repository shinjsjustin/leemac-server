const { jobFileUpload } = require('../../../lib/jobFiles');
const { ExpenseError, createSupplierExpense } = require('../../../lib/supplierExpenses');

const HTTP_CREATED = 201;
const HTTP_SERVER_ERROR = 500;

function registerExpenseRoutes(router, { db, receive }) {
    router.post('/expenses', receive(jobFileUpload.single('invoice')), async (req, res) => {
        try {
            res.status(HTTP_CREATED).json(await createSupplierExpense(db, req.body, req.file));
        } catch (e) {
            if (e instanceof ExpenseError) return res.status(e.status).json(e.body);
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to record expense' });
        }
    });
}

module.exports = { registerExpenseRoutes };
