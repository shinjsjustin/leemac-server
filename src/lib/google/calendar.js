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

module.exports = { getTodaysEvents };
