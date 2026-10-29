const DEFAULT_CLIENT_URL = 'http://localhost:3000';

// Deliberately reads no price fields: this email goes out on a client's submit.
async function notifyQuoteRequest({ send, to, request, appUrl = process.env.CLIENT_URL || DEFAULT_CLIENT_URL }) {
    if (!to) return;
    await send({
        to,
        subject: `Quote request: ${request.name || `#${request.id}`} from ${request.client_name}`,
        text: [
            `Lines: ${request.lines.length}`,
            `Need by: ${request.need_by || 'none'}`,
            `${appUrl}/quote-requests/${request.id}`,
        ].join('\n'),
    });
}

module.exports = { notifyQuoteRequest };
