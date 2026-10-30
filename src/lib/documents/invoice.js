const { LEEMAC } = require('./data');
const { escapeHtml, money, page, header, partsTable } = require('./layout');

const customerLines = (c) =>
    `${escapeHtml(c.name)}<br>${escapeHtml(c.line1)}<br>${escapeHtml(c.line2)}`;

const invoiceHtml = (data) => {
    const { customer, dates } = data;
    const taxPercent = data.tax.flag === 'Y' ? `${data.tax.percent}% ` : '';
    const body = `${header()}
<table class="meta"><tr>
<td>Bill to:<br>${customerLines(customer)}<br>Attn: Account Payable</td>
<td>Ship to:<br>${customerLines(customer)}<br>Attn. ${escapeHtml(customer.attention)}</td>
<td>Invoice No. ${escapeHtml(data.invoiceNumber)}<br>
Invoice Date ${escapeHtml(dates.invoice)}<br>
Ship Date ${escapeHtml(dates.ship)}<br>
Reference # ${escapeHtml(data.reference)}<br>
Customer Order Number<br>${escapeHtml(data.poNumber)}<br>
Terms ${escapeHtml(LEEMAC.paymentTerm)}<br>
Ship via ${escapeHtml(LEEMAC.shipVia)}</td>
</tr></table>
${partsTable(data.parts)}
<div class="totals">
<div>SUBTOTAL ${money(data.subtotal)}</div>
<div>TAX ${taxPercent}${money(data.tax.amount)}</div>
<div><b>TOTAL TO REMIT ${money(data.total)}</b></div>
</div>`;
    return page(`Invoice ${data.invoiceNumber}`, body);
};

module.exports = { invoiceHtml };
