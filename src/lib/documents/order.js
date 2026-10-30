const { LEEMAC } = require('./data');
const { usd, longDate, masthead, party, headline, facts, lines, totalsTable, preparedBy, docPage } = require('./layout');

const orderHtml = (data) => {
    const isTaxable = data.tax.flag === 'Y';
    const taxLabel = isTaxable && data.tax.percent > 0 ? `Tax ${data.tax.percent}%` : 'Tax';
    const body = `${masthead('Order', 'Ref #', data.reference)}
<section class="parties">${party('To', data.customer, data.customer.attention)}<div></div>${headline('Order total', usd(data.total), `Due ${longDate(data.dates.due)}`)}</section>
${facts([['PO date', longDate(data.dates.po)], ['Reference #', data.reference], ['PO number', data.poNumber], ['Due date', longDate(data.dates.due)],
        ['Tax code', isTaxable ? 'Y (taxable)' : 'N'], ['Leadtime', data.leadtime], ['Ship via', LEEMAC.shipVia]])}
${lines(data.parts, { prices: true })}
<section class="close"><div class="notes">${preparedBy()}</div>${totalsTable([['Subtotal', usd(data.subtotal)], [taxLabel, usd(data.tax.amount)], ['Total', usd(data.total), true]])}</section>`;
    const footer = `Order ${data.reference}${data.poNumber ? ` · PO ${data.poNumber}` : ''}`;
    return docPage(`Order ${data.reference}`, footer, body);
};

module.exports = { orderHtml };
