// src/lib/google/calendar.js
// Fetches today's Google Calendar events for the owner admin.

const { google } = require('googleapis');
const { getOAuth2Client } = require('./oauth');

async function getTodaysEvents(adminId) {
  const auth = await getOAuth2Client(adminId);
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20,
  });

  return (res.data.items || []).map((event) => ({
    id: event.id,
    summary: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location || null,
    attendees: (event.attendees || []).map((a) => a.email),
  }));
}

// Creates a timed event on the owner's primary calendar.
// Requires the calendar.events scope (write) on the stored Google authorization.
async function createEvent(adminId, { summary, description, location, start, end } = {}) {
  const auth = await getOAuth2Client(adminId);
  const calendar = google.calendar({ version: 'v3', auth });

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: summary || 'Untitled event',
      description: description || undefined,
      location: location || undefined,
      start: { dateTime: new Date(start).toISOString(), timeZone: 'America/Toronto' },
      end: { dateTime: new Date(end).toISOString(), timeZone: 'America/Toronto' },
    },
  });

  return {
    id: res.data.id,
    summary: res.data.summary,
    start: res.data.start,
    end: res.data.end,
    htmlLink: res.data.htmlLink,
  };
}

module.exports = { getTodaysEvents, createEvent };
