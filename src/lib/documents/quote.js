const { LEEMAC } = require('./data');
const { escapeHtml, money, page, header, partsTable } = require('./layout');

const quoteHtml = (data) => {
    const { customer } = data;
    const body = `${header()}
<table class="meta"><tr>
<td>To:<br>${escapeHtml(customer.name)}<br>${escapeHtml(customer.line1)}<br>${escapeHtml(customer.line2)}<br>Attn. ${escapeHtml(customer.attention)}</td>
<td>Quote # ${escapeHtml(data.reference)}<br>Date ${escapeHtml(data.dates.created)}</td>
</tr></table>
${partsTable(data.parts)}
<div class="totals">Subtotal ${money(data.subtotal)}</div>
<p>Prepared by ${escapeHtml(LEEMAC.preparedBy)} Tel. ${escapeHtml(LEEMAC.tel)} Cell ${escapeHtml(LEEMAC.cell)}</p>`;
    return page(`Quote ${data.reference}`, body);
};

module.exports = { quoteHtml };
