const { QuoteRequestError } = require('../../../lib/quoteRequests');
const { saveSuggestion } = require('../../../lib/quoteRequestReview');

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

const isNumericId = (value) => /^\d+$/.test(value);

function registerQuoteRequestRoutes(router, { db }) {
    router.post('/quote-requests/:id/lines/:lineId/suggest', async (req, res) => {
        const { id, lineId } = req.params;
        if (!isNumericId(id) || !isNumericId(lineId)) {
            return res.status(HTTP_BAD_REQUEST).json({ error: 'Ids must be numbers.' });
        }
        try {
            const result = await saveSuggestion(db, Number(id), Number(lineId), req.body);
            if (!result) return res.status(HTTP_NOT_FOUND).json({ error: 'Line not found' });
            res.json(result);
        } catch (e) {
            if (e instanceof QuoteRequestError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to save suggestion' });
        }
    });
}

module.exports = { registerQuoteRequestRoutes };
