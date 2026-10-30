const { LEEMAC } = require('./data');
const { longDate, masthead, party, headline, facts, lines, preparedBy, docPage } = require('./layout');

const packingHtml = (data) => {
    const pieces = data.parts.reduce((sum, p) => sum + p.quantity, 0);
    const body = `${masthead('Packing List', 'Ref #', data.reference)}
<section class="parties">${party('Ship to', data.customer, data.customer.attention)}<div></div>${headline('Shipped', `${data.parts.length} lines · ${pieces} pcs`)}</section>
${facts([['Ship date', longDate(data.dates.ship)], ['Invoice #', data.invoiceNumber], ['Reference #', data.reference], ['PO number', data.poNumber], ['Ship via', LEEMAC.shipVia]])}
${lines(data.parts, { prices: false, qtyLabel: 'Qty shipped' })}
<section class="close"><div class="notes">${preparedBy()}</div></section>
<section class="signoff"><div><div class="line"></div><div class="label">Received by</div></div><div><div class="line"></div><div class="label">Date</div></div></section>`;
    return docPage(`Packing List ${data.reference}`, `Packing list ${data.reference} · Invoice ${data.invoiceNumber}`, body);
};

module.exports = { packingHtml };
