const express = require('express');
const router = express.Router();
const db = require('../db/db');

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SERVICE_PRIVATE_KEY.replace(/\\n/g, '\n');

const serviceAccountAuth = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth: serviceAccountAuth });

// Helper function to sanitize input by removing leading tick
const sanitizeValue = (value) => {
    if (typeof value === 'string' && value.startsWith("'")) {
        return value.slice(1);
    }
    return value;
};

// Helper function to format dates for Google Calendar
const formatDateTime = (date, time = '09:00') => {
    if (!date) return null;
    const d = new Date(date);
    const [hours, minutes] = time.split(':');
    d.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return d.toISOString();
};

// GET route to list calendar events
// router.get('/', async (req, res) => {
//     const { maxResults = 10, timeMin, timeMax } = req.query;
//     console.log('Fetching calendar events with params:', { maxResults, timeMin, timeMax });
    
//     try {
//         const response = await calendar.events.list({
//             calendarId: CALENDAR_ID,
//             timeMin: timeMin || new Date().toISOString(),
//             timeMax: timeMax,
//             maxResults: parseInt(maxResults),
//             singleEvents: true,
//             orderBy: 'startTime',
//         });

//         res.status(200).json({ events: response.data.items });
//     } catch (e) {
//         console.error('Error fetching calendar events:', e.message);
//         res.status(500).json({ error: e.message });
//     }
// });

// POST route to create a calendar event
router.post('/create', async (req, res) => {
    const { summary, description, startDate, startTime, endDate, endTime, location, attendees } = req.body;
    console.log('Creating calendar event:', { summary, startDate, startTime, endDate, endTime });

    if (!summary || !startDate) {
        return res.status(400).json({ error: 'Missing required fields: summary and startDate' });
    }

    try {
        const event = {
            summary: sanitizeValue(summary),
            description: sanitizeValue(description || ''),
            location: sanitizeValue(location || ''),
            start: {
                dateTime: formatDateTime(startDate, startTime || '09:00'),
                timeZone: 'America/New_York',
            },
            end: {
                dateTime: formatDateTime(endDate || startDate, endTime || '10:00'),
                timeZone: 'America/New_York',
            },
        };

        if (attendees && Array.isArray(attendees)) {
            event.attendees = attendees.map(email => ({ email: sanitizeValue(email) }));
        }

        const response = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
        });

        res.status(200).json({ 
            message: 'Event created successfully',
            event: response.data 
        });
    } catch (e) {
        console.error('Error creating calendar event:', e.message);
        res.status(500).json({ error: 'Failed to create calendar event' });
    }
});

// POST route to create event from job data (similar to sheet populate)
router.post('/create-from-job', async (req, res) => {
    const { job } = req.body;

    if (!job) {
        return res.status(400).json({ error: 'Missing job data' });
    }

    const formatDate = (date) => {
        if (!date) return null;
        return new Date(date).toISOString().split('T')[0];
    };

    try {
        const events = [];

        // Create event for job creation
        if (job.created_at) {
            const createdEvent = {
                summary: `Job Created: ${job.job_number}`,
                description: `Job ${job.job_number} for ${job.company_name}\nPO: ${job.po_number || 'N/A'}`,
                start: {
                    dateTime: formatDateTime(job.created_at, '09:00'),
                    timeZone: 'America/New_York',
                },
                end: {
                    dateTime: formatDateTime(job.created_at, '09:30'),
                    timeZone: 'America/New_York',
                },
            };

            const createdResponse = await calendar.events.insert({
                calendarId: CALENDAR_ID,
                resource: createdEvent,
            });
            events.push(createdResponse.data);
        }

        // Create event for due date
        if (job.due_date) {
            const dueEvent = {
                summary: `Job Due: ${job.job_number}`,
                description: `Job ${job.job_number} for ${job.company_name} is due\nPO: ${job.po_number || 'N/A'}`,
                start: {
                    dateTime: formatDateTime(job.due_date, '08:00'),
                    timeZone: 'America/New_York',
                },
                end: {
                    dateTime: formatDateTime(job.due_date, '08:30'),
                    timeZone: 'America/New_York',
                },
            };

            const dueResponse = await calendar.events.insert({
                calendarId: CALENDAR_ID,
                resource: dueEvent,
            });
            events.push(dueResponse.data);
        }

        // Create event for invoice date
        if (job.invoice_date) {
            const invoiceEvent = {
                summary: `Invoice Sent: ${job.job_number}`,
                description: `Invoice ${job.invoice_number || 'TBD'} sent for job ${job.job_number}\nCompany: ${job.company_name}`,
                start: {
                    dateTime: formatDateTime(job.invoice_date, '10:00'),
                    timeZone: 'America/New_York',
                },
                end: {
                    dateTime: formatDateTime(job.invoice_date, '10:30'),
                    timeZone: 'America/New_York',
                },
            };

            const invoiceResponse = await calendar.events.insert({
                calendarId: CALENDAR_ID,
                resource: invoiceEvent,
            });
            events.push(invoiceResponse.data);
        }

        res.status(200).json({ 
            message: 'Calendar events created successfully',
            events: events 
        });
    } catch (e) {
        console.error('Error creating calendar events from job:', e.message);
        res.status(500).json({ error: 'Failed to create calendar events' });
    }
});

// DELETE route to delete a calendar event
router.delete('/:eventId', async (req, res) => {
    const { eventId } = req.params;
    console.log('Deleting calendar event:', eventId);

    try {
        await calendar.events.delete({
            calendarId: CALENDAR_ID,
            eventId: eventId,
        });

        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (e) {
        console.error('Error deleting calendar event:', e.message);
        res.status(500).json({ error: 'Failed to delete calendar event' });
    }
});

module.exports = router;
