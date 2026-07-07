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
async function getEmailAttachment({ adminId, emailId, attachmentId } = {}) {  const auth = await getOAuth2Client(adminId);
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

// Removes CR/LF from a header value so a hostile value in `to`/`cc`/`subject`
// cannot inject additional MIME headers. Body text keeps its newlines.
function stripHeaderInjection(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

// Base64url-encodes a UTF-8 string for Gmail's message.raw field.
function base64UrlEncode(str) {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Creates a DRAFT email in the owner's Gmail. This NEVER sends — the draft sits
// inert in Gmail until Justin reviews and sends it himself. There is deliberately
// no send path here (see the gmail.compose scope note in routes/jarvis/google.js):
// the no-send guarantee is enforced by the absence of any users.messages.send /
// drafts.send call, not by the OAuth scope.
async function createDraft({ adminId, to, cc, subject, bodyText, replyToEmailId } = {}) {
  const auth = await getOAuth2Client(adminId);
  const gmail = google.gmail({ version: 'v1', auth });

  let threadId;
  let inReplyTo;
  let references;
  let resolvedTo = to;
  let resolvedSubject = subject;

  if (replyToEmailId) {
    // Fetch just the headers we need to thread the reply. format=metadata keeps
    // this light and avoids pulling the full body we don't use here.
    const { data: original } = await gmail.users.messages.get({
      userId: 'me',
      id: replyToEmailId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'Subject', 'From', 'Reply-To'],
    });
    const headers = original.payload?.headers || [];
    const messageId = getHeader(headers, 'Message-ID');
    const origSubject = getHeader(headers, 'Subject');
    const origReplyTo = getHeader(headers, 'Reply-To') || getHeader(headers, 'From');

    threadId = original.threadId;
    if (messageId) {
      inReplyTo = messageId;
      references = messageId;
    }
    if (!resolvedTo) resolvedTo = origReplyTo;

    // Ensure the reply subject carries a single "Re: " prefix.
    const baseSubject = resolvedSubject || origSubject || '';
    resolvedSubject = /^\s*re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`.trim();
  }

  const safeTo = stripHeaderInjection(resolvedTo);
  const safeCc = stripHeaderInjection(cc);
  const safeSubject = stripHeaderInjection(resolvedSubject);

  const headerLines = ['MIME-Version: 1.0', `To: ${safeTo}`];
  if (safeCc) headerLines.push(`Cc: ${safeCc}`);
  headerLines.push(`Subject: ${safeSubject}`);
  headerLines.push('Content-Type: text/plain; charset=utf-8');
  if (inReplyTo) headerLines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headerLines.push(`References: ${references}`);

  const raw = `${headerLines.join('\r\n')}\r\n\r\n${bodyText ?? ''}`;
  const message = { raw: base64UrlEncode(raw) };
  if (threadId) message.threadId = threadId;

  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message },
  });

  return {
    draft_id: data.id,
    thread_id: data.message?.threadId || threadId || null,
    to: safeTo,
    subject: safeSubject,
  };
}

module.exports = { getRecentEmails, getEmailById, getEmailAttachment, createDraft };
