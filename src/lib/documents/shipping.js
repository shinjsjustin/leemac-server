const { LEEMAC } = require('./data');
const { escapeHtml, longDate, docPage } = require('./layout');

const LABEL_MAX_LINES = 8; // parts that fit on the 4x6 label before "+N more"

const ref = (k, v) => (v ? `<div><div class="tag">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>` : '');

const partRow = (p) => `<div class="prow"><span class="pn">${escapeHtml(p.number)}${p.rev ? ` rev ${escapeHtml(p.rev)}` : ''}</span><span class="pd">${escapeHtml(p.description)}</span><span class="pq">Qty ${escapeHtml(p.quantity)}</span></div>`;

const shippingHtml = (data) => {
    const { customer, parts } = data;
    const pieces = parts.reduce((sum, p) => sum + p.quantity, 0);
    const isOverflow = parts.length > LABEL_MAX_LINES;
    const shown = isOverflow ? parts.slice(0, LABEL_MAX_LINES - 1) : parts;
    const body = `<div class="lbl">
<div class="from"><div><span class="tag">From</span><br><b>${escapeHtml(LEEMAC.name)}</b><br>${escapeHtml(LEEMAC.street)}, ${escapeHtml(LEEMAC.city)} &middot; ${escapeHtml(LEEMAC.phone)}</div></div>
<div class="shipto"><div class="tag">Ship to</div><div class="co">${escapeHtml(customer.name)}</div>
<div class="addr">${[customer.line1, customer.line2].filter(Boolean).map(escapeHtml).join('<br>')}</div>
${customer.attention ? `<div class="attn">Attn: ${escapeHtml(customer.attention)}</div>` : ''}</div>
<div class="refs">${ref('PO', data.poNumber)}${ref('Invoice', data.invoiceNumber)}${ref('Ref', data.reference)}</div>
<div class="parts">${shown.map(partRow).join('')}
${isOverflow ? `<div class="more">+${parts.length - shown.length} more, see packing list</div>` : ''}</div>
<div class="foot"><span>Ship date ${escapeHtml(longDate(data.dates.ship))}</span><span>${parts.length} lines &middot; ${pieces} pcs</span></div>
</div>`;
    return docPage(`Shipping ${data.reference}`, '', body, 'label-doc');
};

module.exports = { shippingHtml };
