// src/routes/jarvis/eventsTickets.js
// Short-lived, single-use tickets that authenticate the SSE /events stream.
//
// EventSource (used by the browser for SSE) cannot send an Authorization header,
// so the client first calls the header-authenticated GET /api/jarvis/events-ticket
// to obtain a ticket, then opens EventSource('/api/jarvis/events?ticket=…').
// The ticket is consumed (deleted) on first use and expires after 60s.
//
// Storage is an in-memory module-level Map. This app runs as a SINGLE Node
// process, so this is sufficient. A multi-process/cluster deployment would need
// shared storage (e.g. Redis) instead.

const crypto = require('crypto');

const TICKET_TTL_MS = 60 * 1000;

// ticket (hex string) -> { adminId, expiresAt }
const tickets = new Map();

// Drops any expired entries. Called opportunistically on issue/consume so the
// Map never grows unbounded even if some tickets are never consumed.
function sweepExpired(now = Date.now()) {
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt <= now) tickets.delete(ticket);
  }
}

// Issues a fresh single-use ticket for the given admin. Returns the ticket string.
function issueTicket(adminId) {
  const now = Date.now();
  sweepExpired(now);
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, { adminId, expiresAt: now + TICKET_TTL_MS });
  return ticket;
}

// Consumes a ticket: deletes it (single-use) and returns its entry, or null if
// the ticket is missing, unknown, or expired.
function consumeTicket(ticket) {
  const now = Date.now();
  sweepExpired(now);
  if (!ticket) return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  if (entry.expiresAt <= now) return null;
  return entry;
}

module.exports = { issueTicket, consumeTicket, TICKET_TTL_MS };
