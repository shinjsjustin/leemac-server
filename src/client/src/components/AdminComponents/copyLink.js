export const clientPartLink = (origin, id) => `${origin}/client-part/${id}`;

export const clientJobLink = (origin, id) => `${origin}/client-job/${id}`;

// Older browsers and non-secure contexts lack navigator.clipboard.
const copyWithTextarea = (text) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    try {
        area.select();
        return document.execCommand('copy');
    } catch (e) {
        return false;
    } finally {
        document.body.removeChild(area);
    }
};

export const copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return 'copied';
    } catch (e) {
        return copyWithTextarea(text) ? 'copied' : 'manual';
    }
};
