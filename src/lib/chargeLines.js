const CHARGE_WORDS = /\b(fee|expedite)\b/i;
// Most part details start with '*' (material and finish: '*AL6061 *Clear Anodize'), so only a
// '*' followed by a charge word marks a charge line ('*Fee').
const CHARGE_DETAILS = /^\*\s*(fee|expedite|setup)\b/i;

// No schema flag marks fee/setup/expedite lines, so they are told apart by content.
function isChargeLine({ details, part_description: description } = {}) {
    return CHARGE_DETAILS.test(String(details ?? '')) || CHARGE_WORDS.test(String(description ?? ''));
}

module.exports = { isChargeLine };
