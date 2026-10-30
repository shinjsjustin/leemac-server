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

const documentPart = (part, index) => {
    const quantity = Number(part.quantity);
    const price = Number(part.price);
    return {
        item: index + 1,
        number: part.number,
        rev: part.rev || '—',
        description: part.description || '—',
        details: partDetails(part),
        quantity,
        price,
        ext: quantity * price,
    };
};

const documentData = ({ job, parts }) => {
    const docParts = parts.map(documentPart);
    const subtotal = docParts.reduce((sum, p) => sum + p.ext, 0);
    const taxPercent = Number(job.tax_percent) || 0;
    const taxFlat = Number(job.tax) || 0;
    const hasTax = job.tax_code === 1 && (taxFlat > 0 || taxPercent > 0);
    const taxAmount = !hasTax ? 0 : taxFlat > 0 ? taxFlat : (subtotal * taxPercent) / 100;

    return {
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
        tax: { flag: hasTax ? 'Y' : 'N', amount: taxAmount },
        parts: docParts,
        subtotal,
        total: subtotal + taxAmount,
    };
};

module.exports = { LEEMAC, documentData };
