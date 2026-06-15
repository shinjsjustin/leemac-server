// src/lib/google/gmail.js
// Fetches Gmail messages, full bodies, and attachments for the owner admin.
// The gmail.readonly scope already grants body + attachment access — no scope upgrade needed.

const { google } = require('googleapis');
const { getOAuth2Client } = require('./oauth');

function decodeBase64(data) {
  // Gmail uses URL-safe base64; normalise to standard before decoding.
  const normalised = String(data).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalised, 'base64').toString('utf-8');
}

// Crude HTML → text fallback for emails that only ship an HTML body.
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Walks the MIME tree and returns the best-effort plain-text body.
// Prefers text/plain, falls back to a stripped text/html part.
function extractBody(payload) {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return htmlToText(decodeBase64(payload.body.data));
  }
  if (payload.body?.data && !payload.parts) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    // First pass: prefer a plain-text part anywhere in the tree.
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    // Second pass: recurse (multipart/alternative, multipart/mixed, etc.).
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

// Collects attachment metadata from the MIME tree (filename, type, size, id).
// Content is fetched lazily via getEmailAttachment so listings stay light.
function extractAttachments(payload, out = []) {
  if (!payload) return out;

  if (payload.filename && payload.body?.attachmentId) {
    out.push({
      attachment_id: payload.body.attachmentId,
      filename: payload.filename,
      mime_type: payload.mimeType || 'application/octet-stream',
      size: payload.body.size || 0,
    });
  }

  if (payload.parts) {
    for (const part of payload.parts) extractAttachments(part, out);
  }

  return out;
}

function getHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function mapHeaders(data) {
  const headers = data.payload?.headers || [];
  return {
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    cc: getHeader(headers, 'Cc'),
    subject: getHeader(headers, 'Subject'),
  };
}

// Lists recent emails with snippets and attachment metadata (no full body).
async function getRecentEmails({ adminId, since, query, maxResults = 25 } = {}) {
  const auth = await getOAuth2Client(adminId);
  const gmail = google.gmail({ version: 'v1', auth });

  let q = query || '';
  if (since) {
    const sinceDate = since instanceof Date ? since : new Date(since);
    q = `${q} after:${Math.floor(sinceDate.getTime() / 1000)}`.trim();
  } else if (!query) {
    const fallback = new Date(Date.now() - 24 * 60 * 60 * 1000);
    q = `after:${Math.floor(fallback.getTime() / 1000)}`;
  }

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: q || undefined,
    maxResults: Math.min(Math.max(maxResults, 1), 50),
  });

  const messages = listRes.data.messages || [];
  if (!messages.length) return [];

  const detailed = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
    )
  );

  return detailed.map(({ data }) => {
    const attachments = extractAttachments(data.payload);
    return {
      id: data.id,
      thread_id: data.threadId,
      ...mapHeaders(data),
      snippet: data.snippet || '',
      received_at: new Date(parseInt(data.internalDate)).toISOString(),
      body_text: extractBody(data.payload).slice(0, 2000),
      has_attachments: attachments.length > 0,
      attachments,
    };
  });
}

// Fetches a single email with its full (generously capped) body and the
// metadata for every attachment.
async function getEmailById({ adminId, emailId, maxBodyChars = 20000 } = {}) {
  const auth = await getOAuth2Client(adminId);
  const gmail = google.gmail({ version: 'v1', auth });

  const { data } = await gmail.users.messages.get({
    userId: 'me',
    id: emailId,
    format: 'full',
  });

  const attachments = extractAttachments(data.payload);
  return {
    id: data.id,
    thread_id: data.threadId,
    ...mapHeaders(data),
    snippet: data.snippet || '',
    received_at: new Date(parseInt(data.internalDate)).toISOString(),
    body_text: extractBody(data.payload).slice(0, maxBodyChars),
    has_attachments: attachments.length > 0,
    attachments,
  };
}

// Downloads a single attachment's raw bytes. Returns a Buffer plus metadata.
async function getEmailAttachment({ adminId, emailId, attachmentId } = {}) {
  const auth = await getOAuth2Client(adminId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Pull the message once to resolve filename/mimeType for the requested id.
  const { data: message } = await gmail.users.messages.get({
    userId: 'me',
    id: emailId,
    format: 'full',
  });
  const meta = extractAttachments(message.payload).find(
    (a) => a.attachment_id === attachmentId
  );

  const { data } = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: emailId,
    id: attachmentId,
  });

  const normalised = String(data.data).replace(/-/g, '+').replace(/_/g, '/');
  return {
    filename: meta?.filename || 'attachment',
    mime_type: meta?.mime_type || 'application/octet-stream',
    size: data.size || meta?.size || 0,
    buffer: Buffer.from(normalised, 'base64'),
  };
}

module.exports = { getRecentEmails, getEmailById, getEmailAttachment };
