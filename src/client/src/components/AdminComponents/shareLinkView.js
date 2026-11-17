const READ_LEVEL = 2;
const WRITE_LEVEL = 3;

const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const shareUrl = (origin, type, token) => `${origin}/share/${type}/${token}`;

export const expiryText = (link) => `Expires ${formatDate(link.expires_at)}`;

export function opensText(link) {
    if (!link.open_count) return 'Not opened yet';
    const times = link.open_count === 1 ? 'time' : 'times';
    return `Opened ${link.open_count} ${times}, last ${formatDate(link.last_opened_at)}`;
}

function copyAction({ link, ready, accessLevel }) {
    if (!ready) return { show: false, reason: 'Save the quote first' };
    if (accessLevel >= WRITE_LEVEL || (accessLevel >= READ_LEVEL && link)) return { show: true, reason: '' };
    return { show: false, reason: 'No share link yet. A level 3 admin can create one.' };
}

export const panelActions = ({ link, ready, accessLevel }) => ({
    copy: copyAction({ link, ready, accessLevel }),
    turnOff: { show: Boolean(link) && accessLevel >= WRITE_LEVEL },
});
