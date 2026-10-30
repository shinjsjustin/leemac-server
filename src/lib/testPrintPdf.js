// Hand-built so the test page needs no PDF dependency; offsets in the xref are computed, not typed.
function escapeText(s) {
    return String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');
}

function testPrintPdf(printerName, date) {
    const lines = ['Leemac test page', `Printer: ${printerName}`, `Time: ${date.toISOString()}`];
    const stream = `BT /F1 18 Tf 72 720 Td 24 TL ${lines.map((l) => `(${escapeText(l)}) Tj T*`).join(' ')} ET`;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let out = '%PDF-1.4\n';
    const offsets = objects.map((body, i) => {
        const at = out.length;
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
        return at;
    });
    const xrefAt = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

module.exports = { testPrintPdf };
