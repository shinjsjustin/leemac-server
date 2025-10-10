import React, { useState, useEffect } from 'react';

const CalendarTest = () => {
    // State for storing calendar data and UI states
    const [calendars, setCalendars] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedCalendar, setSelectedCalendar] = useState('primary');

    // Form state for creating new events
    const [eventForm, setEventForm] = useState({
        summary: '',
        description: '',
        startDateTime: '',
        endDateTime: '',
        attendees: ''
    });

    // Get the authentication token from localStorage
    const getAuthToken = () => localStorage.getItem('token');

    // Base API URL - adjust this to match your backend
    const API_BASE = process.env.REACT_APP_URL || 'http://localhost:3001';

    // Generic function to make authenticated API requests
    const makeApiRequest = async (endpoint, options = {}) => {
        const token = getAuthToken();
        
        if (!token) {
            throw new Error('No authentication token found');
        }

        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        };

        // Merge default options with provided options
        const requestOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers,
            },
        };

        const response = await fetch(`${API_BASE}/internal/calendar${endpoint}`, requestOptions);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        return response.json();
    };

    // Fetch user's Google calendars
    const fetchCalendars = async () => {
        try {
            setLoading(true);
            setError('');
            
            const data = await makeApiRequest('/calendars');
            setCalendars(data.calendars || []);
            
            console.log('Fetched calendars:', data.calendars);
        } catch (err) {
            setError(`Failed to fetch calendars: ${err.message}`);
            console.error('Calendar fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch events from selected calendar
    const fetchEvents = async () => {
        try {
            setLoading(true);
            setError('');
            
            // Get events for the next 30 days
            const timeMin = new Date().toISOString();
            const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            
            const params = new URLSearchParams({
                calendarId: selectedCalendar,
                maxResults: '20',
                timeMin,
                timeMax,
            });

            const data = await makeApiRequest(`/events?${params}`);
            setEvents(data.events || []);
            
            console.log('Fetched events:', data.events);
        } catch (err) {
            setError(`Failed to fetch events: ${err.message}`);
            console.error('Events fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Create a new calendar event
    const createEvent = async (e) => {
        e.preventDefault();
        
        try {
            setLoading(true);
            setError('');

            // Validate required fields
            if (!eventForm.summary || !eventForm.startDateTime || !eventForm.endDateTime) {
                throw new Error('Summary, start time, and end time are required');
            }

            // Ensure datetime values include seconds for proper ISO format
            const formatDateTime = (dateTimeString) => {
                const date = new Date(dateTimeString);
                if (isNaN(date.getTime())) {
                    throw new Error('Invalid date format');
                }
                return date.toISOString();
            };

            // Validate and format datetime
            const startDateTime = formatDateTime(eventForm.startDateTime);
            const endDateTime = formatDateTime(eventForm.endDateTime);

            // Validate that end time is after start time
            if (new Date(endDateTime) <= new Date(startDateTime)) {
                throw new Error('End time must be after start time');
            }

            // Prepare the event data
            const eventData = {
                summary: eventForm.summary,
                description: eventForm.description,
                startDateTime,
                endDateTime,
                calendarId: selectedCalendar,
                // Convert comma-separated emails to array
                attendees: eventForm.attendees 
                    ? eventForm.attendees.split(',').map(email => email.trim()).filter(email => email)
                    : []
            };

            console.log('Creating event with data:', eventData);

            const response = await makeApiRequest('/events', {
                method: 'POST',
                body: JSON.stringify(eventData),
            });

            console.log('Event created:', response);
            
            // Clear the form
            setEventForm({
                summary: '',
                description: '',
                startDateTime: '',
                endDateTime: '',
                attendees: ''
            });

            // Refresh events list
            await fetchEvents();
            
            alert('Event created successfully!');
        } catch (err) {
            setError(`Failed to create event: ${err.message}`);
            console.error('Event creation error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Delete an event
    const deleteEvent = async (eventId) => {
        if (!window.confirm('Are you sure you want to delete this event?')) {
            return;
        }

        try {
            setLoading(true);
            setError('');

            const params = new URLSearchParams({ calendarId: selectedCalendar });
            
            await makeApiRequest(`/events/${eventId}?${params}`, {
                method: 'DELETE',
            });

            console.log('Event deleted:', eventId);
            
            // Refresh events list
            await fetchEvents();
            
            alert('Event deleted successfully!');
        } catch (err) {
            setError(`Failed to delete event: ${err.message}`);
            console.error('Event deletion error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Handle form input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEventForm(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Load calendars when component mounts
    useEffect(() => {
        fetchCalendars();
    }, []);

    // Load events when selected calendar changes
    useEffect(() => {
        if (selectedCalendar) {
            fetchEvents();
        }
    }, [selectedCalendar]);

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1>Google Calendar Integration Test</h1>
            
            {/* Error display */}
            {error && (
                <div style={{ 
                    background: '#ffebee', 
                    color: '#c62828', 
                    padding: '10px', 
                    borderRadius: '4px', 
                    marginBottom: '20px' 
                }}>
                    {error}
                </div>
            )}

            {/* Loading indicator */}
            {loading && (
                <div style={{ 
                    background: '#e3f2fd', 
                    color: '#1976d2', 
                    padding: '10px', 
                    borderRadius: '4px', 
                    marginBottom: '20px' 
                }}>
                    Loading...
                </div>
            )}

            {/* Calendar selection */}
            <div style={{ marginBottom: '30px' }}>
                <h2>Select Calendar</h2>
                <div style={{ marginBottom: '10px' }}>
                    <button onClick={fetchCalendars} disabled={loading}>
                        Refresh Calendars
                    </button>
                </div>
                <select 
                    value={selectedCalendar} 
                    onChange={(e) => setSelectedCalendar(e.target.value)}
                    style={{ width: '300px', padding: '5px' }}
                >
                    <option value="primary">Primary Calendar</option>
                    {calendars.map(calendar => (
                        <option key={calendar.id} value={calendar.id}>
                            {calendar.summary} {calendar.primary ? '(Primary)' : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* Event creation form */}
            <div style={{ marginBottom: '30px' }}>
                <h2>Create New Event</h2>
                <form onSubmit={createEvent} style={{ display: 'grid', gap: '10px', maxWidth: '500px' }}>
                    <input
                        type="text"
                        name="summary"
                        placeholder="Event Title *"
                        value={eventForm.summary}
                        onChange={handleInputChange}
                        required
                        style={{ padding: '8px' }}
                    />
                    <textarea
                        name="description"
                        placeholder="Event Description"
                        value={eventForm.description}
                        onChange={handleInputChange}
                        rows="3"
                        style={{ padding: '8px' }}
                    />
                    <div>
                        <label>Start Date & Time *</label>
                        <input
                            type="datetime-local"
                            name="startDateTime"
                            value={eventForm.startDateTime}
                            onChange={handleInputChange}
                            required
                            style={{ padding: '8px', width: '100%' }}
                        />
                    </div>
                    <div>
                        <label>End Date & Time *</label>
                        <input
                            type="datetime-local"
                            name="endDateTime"
                            value={eventForm.endDateTime}
                            onChange={handleInputChange}
                            required
                            style={{ padding: '8px', width: '100%' }}
                        />
                    </div>
                    <input
                        type="text"
                        name="attendees"
                        placeholder="Attendee emails (comma-separated)"
                        value={eventForm.attendees}
                        onChange={handleInputChange}
                        style={{ padding: '8px' }}
                    />
                    <button type="submit" disabled={loading} style={{ padding: '10px', background: '#4285f4', color: 'white', border: 'none', borderRadius: '4px' }}>
                        Create Event
                    </button>
                </form>
            </div>

            {/* Events list */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2>Upcoming Events</h2>
                    <button onClick={fetchEvents} disabled={loading}>
                        Refresh Events
                    </button>
                </div>
                
                {events.length === 0 ? (
                    <p>No upcoming events found.</p>
                ) : (
                    <div style={{ display: 'grid', gap: '15px' }}>
                        {events.map(event => (
                            <div 
                                key={event.id} 
                                style={{ 
                                    border: '1px solid #ddd', 
                                    borderRadius: '8px', 
                                    padding: '15px',
                                    background: '#f9f9f9'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>
                                            {event.summary || 'No Title'}
                                        </h3>
                                        {event.description && (
                                            <p style={{ margin: '0 0 10px 0', color: '#666' }}>
                                                {event.description}
                                            </p>
                                        )}
                                        <div style={{ fontSize: '14px', color: '#888' }}>
                                            <div>
                                                <strong>Start:</strong> {
                                                    event.start?.dateTime 
                                                        ? new Date(event.start.dateTime).toLocaleString()
                                                        : event.start?.date || 'No start time'
                                                }
                                            </div>
                                            <div>
                                                <strong>End:</strong> {
                                                    event.end?.dateTime 
                                                        ? new Date(event.end.dateTime).toLocaleString()
                                                        : event.end?.date || 'No end time'
                                                }
                                            </div>
                                            {event.attendees && event.attendees.length > 0 && (
                                                <div>
                                                    <strong>Attendees:</strong> {
                                                        event.attendees.map(a => a.email).join(', ')
                                                    }
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => deleteEvent(event.id)}
                                        disabled={loading}
                                        style={{ 
                                            background: '#f44336', 
                                            color: 'white', 
                                            border: 'none', 
                                            padding: '5px 10px', 
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CalendarTest;
