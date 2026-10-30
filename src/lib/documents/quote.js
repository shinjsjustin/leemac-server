const { usd, longDate, masthead, party, headline, facts, lines, totalsTable, preparedBy, docPage } = require('./layout');

const quoteHtml = (data) => {
    const pieces = data.parts.reduce((sum, p) => sum + p.quantity, 0);
    const body = `${masthead('Quote', 'Quote #', data.reference)}
<section class="parties">${party('To', data.customer, data.customer.attention)}<div></div>${headline('Quote total', usd(data.subtotal), `${data.parts.length} lines · ${pieces} pcs`)}</section>
${facts([['Date', longDate(data.dates.created)], ['Quote #', data.reference], ['Leadtime', data.leadtime]])}
${lines(data.parts, { prices: true })}
<section class="close"><div class="notes">${preparedBy()}</div>${totalsTable([['Total', usd(data.subtotal), true]])}</section>`;
    const footer = `Quote ${data.reference}`;
    return docPage(footer, footer, body);
};

module.exports = { quoteHtml };
