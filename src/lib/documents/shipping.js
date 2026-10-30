const { LEEMAC } = require('./data');
const { escapeHtml, page } = require('./layout');

const partBlock = (p) =>
    `<div class="label-part"><b>${escapeHtml(p.number)}</b> ${escapeHtml(p.description)}<br>${escapeHtml(p.details)}<br>Qty ${escapeHtml(p.quantity)}</div>`;

const shippingHtml = (data) => {
    const { customer } = data;
    const body = `<div><b>From</b><br>${escapeHtml(LEEMAC.name)}<br>${escapeHtml(LEEMAC.address)}</div>
<div><b>To</b><br>${escapeHtml(customer.name)}<br>${escapeHtml(customer.line1)}<br>${escapeHtml(customer.line2)}<br>Attn. ${escapeHtml(customer.attention)}</div>
<div>Quote: ${escapeHtml(data.reference)}<br>PO: ${escapeHtml(data.poNumber)}<br>Invoice: ${escapeHtml(data.invoiceNumber)}</div>
${data.parts.map(partBlock).join('\n')}`;
    return page(`Shipping ${data.reference}`, body, { size: '4in 6in', margin: '0.15in' });
};

module.exports = { shippingHtml };
