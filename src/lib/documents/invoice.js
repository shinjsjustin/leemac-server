const { LEEMAC } = require('./data');
const { escapeHtml, usd, longDate, addDays, taxLabel, masthead, party, headline, facts, lines, totalsTable, note, preparedBy, docPage } = require('./layout');

const PAYMENT_TERM_DAYS = 30;

const invoiceHtml = (data) => {
    const { customer, dates } = data;
    const paymentDue = longDate(addDays(dates.invoice, PAYMENT_TERM_DAYS));
    const body = `${masthead('Invoice', 'Invoice #', data.invoiceNumber)}
<section class="parties">${party('Bill to', customer, 'Accounts Payable')}${party('Ship to', customer, customer.attention)}${headline('Amount due', usd(data.total), paymentDue && `Due ${paymentDue}`)}</section>
${facts([['Invoice date', longDate(dates.invoice)], ['Payment due', paymentDue], ['Terms', LEEMAC.terms], ['PO number', data.poNumber], ['PO date', longDate(dates.po)],
        ['Reference #', data.reference], ['Ship date', longDate(dates.ship)], ['Ship via', LEEMAC.shipVia]])}
${lines(data.parts, { prices: true })}
<section class="close"><div class="notes">
${note('Remit to', `${escapeHtml(LEEMAC.name)}, ${escapeHtml(LEEMAC.street)}, ${escapeHtml(LEEMAC.city)}<br>Checks payable to ${escapeHtml(LEEMAC.name)}`)}
${note('Payment terms', `${escapeHtml(LEEMAC.terms)} from invoice date. Please quote invoice # ${escapeHtml(data.invoiceNumber)} with payment.`)}
${preparedBy()}
</div>${totalsTable([['Subtotal', usd(data.subtotal)], [taxLabel(data.tax, data.subtotal), usd(data.tax.amount)], ['Total due', usd(data.total), true]])}</section>`;
    const footer = `Invoice ${data.invoiceNumber} · Ref ${data.reference}${data.poNumber ? ` · PO ${data.poNumber}` : ''}`;
    return docPage(`Invoice ${data.invoiceNumber}`, footer, body);
};

module.exports = { invoiceHtml };
