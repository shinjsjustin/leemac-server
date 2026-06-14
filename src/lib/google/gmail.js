// src/lib/google/gmail.js
// Fetches recent Gmail messages for the owner admin.

const { google } = require('googleapis');
const { getOAuth2Client } = require('./oauth');

function decodeBase64(data) {
  return Buffer.from(data, 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

function getHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

async function getRecentEmails({ adminId, since } = {}) {
  const auth = await getOAuth2Client(adminId);
  const gmail = google.gmail({ version: 'v1', auth });

  const sinceDate = since instanceof Date ? since : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const afterEpoch = Math.floor(sinceDate.getTime() / 1000);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `after:${afterEpoch}`,
    maxResults: 25,
  });

  const messages = listRes.data.messages || [];
  if (!messages.length) return [];

  const detailed = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
    )
  );

  return detailed.map(({ data }) => {
    const headers = data.payload?.headers || [];
    return {
      id: data.id,
      from: getHeader(headers, 'From'),
      subject: getHeader(headers, 'Subject'),
      snippet: data.snippet || '',
      receivedAt: new Date(parseInt(data.internalDate)).toISOString(),
      bodyText: extractBody(data.payload).slice(0, 2000),
    };
  });
}

module.exports = { getRecentEmails };
