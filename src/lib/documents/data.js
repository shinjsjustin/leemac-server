const LEEMAC = {
    name: 'Leemac Manufacturing Inc.',
    address: '1980 Hartog Drive, San Jose CA 95131',
    phone: '(408)573-0130',
    fax: '(408)573-0131',
    preparedBy: 'Justin Shin',
    tel: '408-717-6241',
    cell: '669-369-8895',
    paymentTerm: 'NET 30 DAYS',
    shipVia: 'LEEMAC',
};

const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}-${d.getFullYear()}`;
};

const partDetails = (part) => {
    if (part.details) return part.details;
    return [part.material, part.finish].filter(Boolean).map((v) => `*${v}`).join(' ');
};

const formPart = (part) => ({
    number: part.number,
    rev: part.rev || '—',
    description: part.description || '—',
    details: partDetails(part),
    quantity: part.quantity,
    price: part.price,
});

const formFromSummary = ({ job, parts }) => {
    const percent = Number(job.tax_percent) || 0;
    const amount = Number(job.tax) || 0;
    const hasTax = job.tax_code === 1 && (amount > 0 || percent > 0);
    return {
        fields: {
            customer: {
                name: job.company_name,
                line1: job.address_line1,
                line2: job.address_line2,
                attention: job.attention,
            },
            reference: `${job.job_number}${job.company_code}`,
            dates: {
                created: formatDate(job.created_at),
                po: formatDate(job.po_date),
                due: formatDate(job.due_date),
                invoice: formatDate(job.invoice_date),
                ship: formatDate(job.ship_date),
            },
            poNumber: job.po_number || '',
            invoiceNumber: job.invoice_number || '',
            tax: { flag: hasTax ? 'Y' : 'N', percent, amount },
        },
        parts: parts.map(formPart),
    };
};

const dataFromForm = ({ fields, parts }) => {
    const docParts = parts.map((part, index) => {
        const quantity = Number(part.quantity);
        const price = Number(part.price);
        return { item: index + 1, ...part, quantity, price, ext: quantity * price };
    });
    const subtotal = docParts.reduce((sum, p) => sum + p.ext, 0);
    const percent = Number(fields.tax.percent);
    const flat = Number(fields.tax.amount);
    const taxAmount = fields.tax.flag !== 'Y' ? 0 : flat > 0 ? flat : (subtotal * percent) / 100;
    return {
        ...fields,
        tax: { flag: fields.tax.flag, amount: taxAmount, percent },
        parts: docParts,
        subtotal,
        total: subtotal + taxAmount,
    };
};

const documentData = (summary) => dataFromForm(formFromSummary(summary));

module.exports = { LEEMAC, documentData, formFromSummary, dataFromForm, formatDate };
