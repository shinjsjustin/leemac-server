// src/lib/google/calendar.js
// Fetches today's Google Calendar events for the owner admin.

const { google } = require('googleapis');
const { getOAuth2Client } = require('./oauth');
const { torontoDayBounds } = require('../ai/time');

// Lists events on the owner's primary calendar within a time window.
// `timeMin`/`timeMax` may be Date objects or anything `new Date()` accepts.
async function getEvents(adminId, { timeMin, timeMax, maxResults = 50 } = {}) {
  const auth = await getOAuth2Client(adminId);
  const calendar = google.calendar({ version: 'v3', auth });

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults,
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

// Fetches today's events (America/Toronto day bounds) for the morning brief.
async function getTodaysEvents(adminId) {
  const { start, end } = torontoDayBounds();
  return getEvents(adminId, { timeMin: start, timeMax: end, maxResults: 20 });
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

module.exports = { getTodaysEvents, getEvents, createEvent };
