// Fake dbs never parse SQL, so this catches quoting errors MySQL would reject.
function assertMysqlQuotesClosed(sql) {
    let quote = null;
    let openedAt = -1;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        if (!quote) {
            if (ch === "'" || ch === '"' || ch === '`') {
                quote = ch;
                openedAt = i;
            }
            continue;
        }
        if (ch === '\\' && quote !== '`') {
            i++; // backslash escapes the next character
        } else if (ch === quote) {
            if (sql[i + 1] === quote) i++; // doubled quote is literal
            else quote = null;
        }
    }

    if (quote) {
        throw new Error(`Unclosed ${quote} quote opened at position ${openedAt} in SQL: ${sql}`);
    }
}

module.exports = { assertMysqlQuotesClosed };
