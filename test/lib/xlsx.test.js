const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { buildXlsx } = require('../../src/lib/xlsx');

// Reads the zip back by hand: central directory -> local entries.
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'end record present');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    assert.equal(buf.readUInt32LE(lho), 0x04034b50);
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    assert.equal(method, 8);
    const data = zlib.inflateRawSync(buf.subarray(start, start + csize));
    assert.equal(data.length, usize);
    assert.equal(zlib.crc32(data), crc);
    entries[name] = data.toString('utf8');
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

const sheets = [
  {
    name: 'Invoices',
    columns: ['Number', 'Note', 'Total'],
    rows: [
      ['INV-1', 'A & <B> "c"', 12.5],
      ['INV-2', null, 0],
    ],
  },
  { name: 'Second', columns: ['X'], rows: [] },
];

test('zip entries are valid with matching CRCs and the required parts', () => {
  const z = readZip(buildXlsx(sheets));
  assert.deepEqual(Object.keys(z).sort(), [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml',
  ]);
});

test('numbers are numeric cells, strings escaped inline, null empty', () => {
  const z = readZip(buildXlsx(sheets));
  const s = z['xl/worksheets/sheet1.xml'];
  assert.match(s, /<c r="A1"[^>]*t="inlineStr"[^>]*><is><t>Number<\/t><\/is><\/c>/);
  assert.match(s, /<c r="B2"[^>]*t="inlineStr"[^>]*><is><t>A &amp; &lt;B&gt; &quot;c&quot;<\/t><\/is><\/c>/);
  assert.match(s, /<c r="C2"[^>]*><v>12.5<\/v><\/c>/);
  assert.doesNotMatch(s, /<c r="C2"[^>]*t=/);
  assert.match(s, /<c r="C3"[^>]*><v>0<\/v><\/c>/);
  assert.doesNotMatch(s, /<c r="B3"[^>]*t="inlineStr"/);
  assert.doesNotMatch(s, /<c r="B3"[^>]*><v>/);
});

test('sheet names appear in order, truncated to 31 and stripped of []:*?/\\', () => {
  const long = 'a'.repeat(40);
  const z = readZip(
    buildXlsx([
      { name: 'Q3: [x]/y\\z*?', columns: ['A'], rows: [] },
      { name: long, columns: ['A'], rows: [] },
    ])
  );
  const wb = z['xl/workbook.xml'];
  const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['Q3 xyz', 'a'.repeat(31)]);
});

test('output is deterministic', () => {
  assert.deepEqual(buildXlsx(sheets), buildXlsx(sheets));
});

test('styles define a 0.00 money format and a bold header', () => {
  const z = readZip(buildXlsx(sheets));
  assert.match(z['xl/styles.xml'], /formatCode="0\.00"/);
  assert.match(z['xl/styles.xml'], /<b\/>/);
});
