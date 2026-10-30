const { quoteHtml } = require('./quote');
const { orderHtml } = require('./order');
const { invoiceHtml } = require('./invoice');
const { packingHtml } = require('./packing');
const { shippingHtml } = require('./shipping');

const DOCUMENT_TYPES = {
    quote: { label: 'Quote', size: 'letter' },
    order: { label: 'Order', size: 'letter' },
    invoice: { label: 'Invoice', size: 'letter' },
    packing: { label: 'PackingList', size: 'letter' },
    shipping: { label: 'Shipping', size: '4x6' },
};

const RENDERERS = {
    quote: quoteHtml,
    order: orderHtml,
    invoice: invoiceHtml,
    packing: packingHtml,
    shipping: shippingHtml,
};

const renderDocumentHtml = (type, data) => {
    if (!Object.hasOwn(RENDERERS, type)) {
        throw Object.assign(new Error(`Unknown document type: ${type}`), { code: 'UNKNOWN_TYPE' });
    }
    return RENDERERS[type](data);
};

module.exports = { DOCUMENT_TYPES, renderDocumentHtml };
