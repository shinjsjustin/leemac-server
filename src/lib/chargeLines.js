const CHARGE_WORDS = /\b(fee|expedite)\b/i;

// No schema flag marks fee/setup/expedite lines, so they are told apart by content.
function isChargeLine({ details, part_description: description } = {}) {
    return String(details ?? '').startsWith('*') || CHARGE_WORDS.test(String(description ?? ''));
}

module.exports = { isChargeLine };
