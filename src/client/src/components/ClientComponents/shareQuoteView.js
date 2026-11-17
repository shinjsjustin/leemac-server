const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Mirrors the server's dataFromForm so the page agrees with the PDF.
export function quoteView({ fields, parts, company_name: company }) {
  const lines = parts.map((part) => {
    const quantity = Number(part.quantity);
    const price = Number(part.price);
    return { part, quantity, price, ext: quantity * price };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.ext, 0);
  const flat = Number(fields.tax.amount);
  const tax = fields.tax.flag !== 'Y' ? 0 : flat > 0 ? flat : (subtotal * Number(fields.tax.percent)) / 100;
  return {
    reference: fields.reference,
    date: fields.dates.created,
    leadTime: fields.leadtime,
    company,
    items: lines.map(({ part, quantity, price, ext }) => ({
      number: part.number,
      rev: part.rev,
      description: part.description,
      details: part.details,
      quantity,
      price: dollars.format(price),
      ext: dollars.format(ext),
    })),
    subtotal: dollars.format(subtotal),
    tax: dollars.format(tax),
    total: dollars.format(subtotal + tax),
  };
}
