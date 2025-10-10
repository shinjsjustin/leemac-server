const express = require('express');
const { google } = require('googleapis');
const db = require('../db/db');
const router = express.Router();

// Helper function to get OAuth2 client for a user
async function getOAuth2Client(userId) {
    const [rows] = await db.execute(
        'SELECT google_access_token, google_refresh_token FROM admin WHERE id = ?',
        [userId]
    );
    
    if (rows.length === 0 || !rows[0].google_refresh_token) {
        throw new Error('User not authenticated with Google or missing refresh token');
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        process.env.REDIRECT_URL
    );

    oauth2Client.setCredentials({
        access_token: rows[0].google_access_token,
        refresh_token: rows[0].google_refresh_token
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            await db.execute(
                'UPDATE admin SET google_access_token = ? WHERE id = ?',
                [tokens.access_token, userId]
            );
        }
    });

    return oauth2Client;
}

// Get user's calendars
router.get('/calendars', async (req, res) => {
    try {
        const oauth2Client = await getOAuth2Client(req.user.id);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.calendarList.list();
        res.json({ calendars: response.data.items });
    } catch (error) {
        console.error('Error fetching calendars:', error);
        res.status(500).json({ error: 'Failed to fetch calendars' });
    }
});

// Create a calendar event
router.post('/events', async (req, res) => {
    try {
        const { summary, description, startDateTime, endDateTime, attendees, calendarId = 'primary', allDay = false } = req.body;

        if (!summary || (!startDateTime && !req.body.startDate) || (!endDateTime && !req.body.endDate)) {
            return res.status(400).json({ error: 'Summary and start/end time or date are required' });
        }

        const oauth2Client = await getOAuth2Client(req.user.id);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const event = {
            summary,
            description,
            attendees: attendees ? attendees.map(email => ({ email })) : [],
        };

        // Handle all-day events vs timed events
        if (allDay || req.body.startDate) {
            // All-day event - use date format (YYYY-MM-DD)
            const startDate = req.body.startDate || startDateTime.split('T')[0];
            const endDate = req.body.endDate || endDateTime.split('T')[0];
            
            event.start = { date: startDate };
            event.end = { date: endDate };
        } else {
            // Timed event - use dateTime format
            let formattedStartTime, formattedEndTime;
            
            try {
                formattedStartTime = new Date(startDateTime).toISOString();
                formattedEndTime = new Date(endDateTime).toISOString();
            } catch (dateError) {
                return res.status(400).json({ error: 'Invalid date format. Please use ISO 8601 format (YYYY-MM-DDTHH:mm:ss)' });
            }

            if (new Date(formattedEndTime) <= new Date(formattedStartTime)) {
                return res.status(400).json({ error: 'End time must be after start time' });
            }

            event.start = {
                dateTime: formattedStartTime,
                timeZone: 'America/New_York',
            };
            event.end = {
                dateTime: formattedEndTime,
                timeZone: 'America/New_York',
            };
        }

        console.log('Creating event with formatted data:', JSON.stringify(event, null, 2));

        const response = await calendar.events.insert({
            calendarId,
            resource: event,
        });

        res.json({ 
            message: 'Event created successfully',
            event: response.data 
        });
    } catch (error) {
        console.error('Error creating event:', error);
        // Provide more detailed error information
        if (error.response && error.response.data && error.response.data.error) {
            console.error('Google API Error Details:', error.response.data.error);
            res.status(400).json({ 
                error: 'Google Calendar API Error', 
                details: error.response.data.error.message || 'Bad Request'
            });
        } else {
            res.status(500).json({ error: 'Failed to create calendar event' });
        }
    }
});

// Get calendar events
router.get('/events', async (req, res) => {
    try {
        const { calendarId = 'primary', maxResults = 10, timeMin, timeMax } = req.query;
        
        const oauth2Client = await getOAuth2Client(req.user.id);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const params = {
            calendarId,
            maxResults: parseInt(maxResults),
            singleEvents: true,
            orderBy: 'startTime',
        };

        if (timeMin) params.timeMin = timeMin;
        if (timeMax) params.timeMax = timeMax;

        const response = await calendar.events.list(params);
        res.json({ events: response.data.items });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
});

// Update a calendar event
router.put('/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const { summary, description, startDateTime, endDateTime, calendarId = 'primary' } = req.body;

        const oauth2Client = await getOAuth2Client(req.user.id);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const event = {};
        if (summary) event.summary = summary;
        if (description) event.description = description;
        if (startDateTime) {
            event.start = {
                dateTime: new Date(startDateTime).toISOString(),
                timeZone: 'America/New_York',
            };
        }
        if (endDateTime) {
            event.end = {
                dateTime: new Date(endDateTime).toISOString(),
                timeZone: 'America/New_York',
            };
        }

        const response = await calendar.events.patch({
            calendarId,
            eventId,
            resource: event,
        });

        res.json({ 
            message: 'Event updated successfully',
            event: response.data 
        });
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ error: 'Failed to update calendar event' });
    }
});

// Delete a calendar event
router.delete('/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const { calendarId = 'primary' } = req.query;

        const oauth2Client = await getOAuth2Client(req.user.id);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        await calendar.events.delete({
            calendarId,
            eventId,
        });

        res.json({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ error: 'Failed to delete calendar event' });
    }
});

module.exports = router;
