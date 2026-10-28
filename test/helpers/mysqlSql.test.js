const test = require('node:test');
const assert = require('node:assert');
const { assertMysqlQuotesClosed } = require('./mysqlSql');

const passing = [
    ['ESCAPE with bang', "p.number LIKE ? ESCAPE '!'"],
    ['ESCAPE with escaped backslash (SQL text \\\\)', "p.number LIKE ? ESCAPE '\\\\'"],
    ['doubled single quote', "SELECT 'it''s'"],
    ['double-quoted string', 'SELECT "a\'b"'],
    ['backtick identifier', 'SELECT `my``col` FROM t'],
    ['LIKE pdf pattern', "d.name LIKE '%.pdf'"],
    ['escaped quote inside string', "SELECT 'a\\'b'"],
    ['no quotes', 'SELECT 1'],
];

const failing = [
    ['old ESCAPE code (SQL text ESCAPE \'\\\')', "p.number LIKE ? ESCAPE '\\'"],
    ['unclosed single', "SELECT 'abc"],
    ['unclosed double', 'SELECT "abc'],
    ['unclosed backtick', 'SELECT `abc'],
    ['trailing backslash in string', "SELECT 'abc\\"],
];

for (const [name, sql] of passing) {
    test(`passes for ${name}`, () => {
        assert.doesNotThrow(() => assertMysqlQuotesClosed(sql));
    });
}

for (const [name, sql] of failing) {
    test(`throws for ${name}`, () => {
        assert.throws(() => assertMysqlQuotesClosed(sql), /unclosed/i);
    });
}

test('error names the position where the quote opened', () => {
    assert.throws(() => assertMysqlQuotesClosed("SELECT 'abc"), /position 7/);
});
