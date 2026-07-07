import React, { useState, useEffect, useRef, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { Navigate } from 'react-router-dom';
import Navbar from '../Navbar';
import ChatApp from './ChatApp';
import RequestsApp from './RequestsApp';
import TodoApp from './TodoApp';
import TestPanel from './TestPanel';
import { jarvisFetch } from './jarvisApi';
import './Jarvis.css';

const REQUIRED_ACCESS = 3;

const Jarvis = () => {
  const token = localStorage.getItem('token');

  // Decode token before any conditional returns to satisfy Rules of Hooks.
  let decoded = null;
  try {
    decoded = token ? jwtDecode(token) : null;
  } catch (e) {
    decoded = null;
  }

  const [activeApp, setActiveApp] = useState('chat');
  const [sessionId, setSessionId] = useState(null);
  const [serverTime, setServerTime] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const [todoCount, setTodoCount] = useState(0);
  const [sessionError, setSessionError] = useState(null);
  const eventSourceRef = useRef(null);

  // Fetch session on mount
  useEffect(() => {
    if (!decoded || decoded.access < REQUIRED_ACCESS) return;

    const fetchSession = async () => {
      try {
        const res = await jarvisFetch('/session');
        const data = await res.json();
        if (res.ok) {
          setSessionId(data.sessionId);
          setServerTime(data.serverTime);
        } else {
          setSessionError(data.error || 'Failed to initialize session.');
        }
      } catch (err) {
        setSessionError('Network error initializing session.');
      }
    };

    fetchSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch badge counts for pending requests and open to-dos.
  const fetchCounts = useCallback(async () => {
    try {
      const [reqRes, todoRes] = await Promise.all([
        jarvisFetch('/approvals?status=pending'),
        jarvisFetch('/todos'),
      ]);
      const [reqData, todoData] = await Promise.all([reqRes.json(), todoRes.json()]);
      if (reqRes.ok && Array.isArray(reqData)) setRequestCount(reqData.length);
      if (todoRes.ok && Array.isArray(todoData)) {
        setTodoCount(todoData.filter((t) => !t.done).length);
      }
    } catch (err) {
      // Non-fatal — badges simply won't update this cycle.
    }
  }, []);

  // Poll counts on mount and at a steady interval.
  useEffect(() => {
    if (!decoded || decoded.access < REQUIRED_ACCESS) return;
    fetchCounts();
    const interval = setInterval(fetchCounts, 20000);
    return () => clearInterval(interval);
  }, [fetchCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open SSE connection for ai_notifications.
  // EventSource cannot send an Authorization header, so we first fetch a
  // single-use, short-lived ticket (GET /events-ticket) and open the stream with
  // ?ticket=…. Because tickets are single-use, the browser's built-in EventSource
  // retry will 401; we handle onerror ourselves by closing the stream, fetching a
  // fresh ticket, and reconnecting with backoff. We give up after several
  // consecutive failures to avoid a reconnect storm when auth is genuinely broken.
  useEffect(() => {
    if (!decoded || decoded.access < REQUIRED_ACCESS || !token) return;

    const BASE = process.env.REACT_APP_URL || 'http://localhost:3001/api';
    const MAX_FAILURES = 5;
    const BASE_BACKOFF_MS = 2000;
    const MAX_BACKOFF_MS = 30000;

    let closed = false;
    let reconnectTimer = null;
    let failures = 0;

    const scheduleReconnect = () => {
      if (closed) return;
      failures += 1;
      if (failures > MAX_FAILURES) {
        console.warn('[Jarvis SSE] giving up after repeated connection failures');
        return;
      }
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (closed) return;
      let ticket;
      try {
        const res = await jarvisFetch('/events-ticket');
        ({ ticket } = await res.json());
      } catch (e) {
        scheduleReconnect();
        return;
      }
      if (closed || !ticket) return;

      const url = `${BASE}/jarvis/events?ticket=${encodeURIComponent(ticket)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => { failures = 0; };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const notification = {
            id: Date.now() + Math.random(),
            text: data.text || data.message || data.content || JSON.stringify(data),
            raw: data,
          };
          setNotifications(prev => [...prev, notification]);
          setUnreadCount(prev => prev + 1);
        } catch (e) {
          // Ignore malformed SSE payloads
        }
      };

      es.onerror = () => {
        // The ticket was single-use, so this connection can't recover on its own.
        // Close it and reconnect with a fresh ticket (unless we've unmounted).
        es.close();
        if (eventSourceRef.current === es) eventSourceRef.current = null;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = useCallback((tab) => {
    setActiveApp(tab);
    if (tab === 'chat') {
      setUnreadCount(0);
    }
    // Refresh badge counts when leaving Requests/To Do so they reflect changes.
    fetchCounts();
  }, [fetchCounts]);

  const handleNotificationRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Access guard — placed after all hooks
  if (!decoded || decoded.access < REQUIRED_ACCESS) {
    return <Navigate to="/access-denied" />;
  }

  return (
    <div>
      <Navbar />
      <div className="jarvis-container">
        {/* Tab bar */}
        <div className="jarvis-tabs">
          <button
            className={`jarvis-tab${activeApp === 'chat' ? ' active' : ''}`}
            onClick={() => handleTabChange('chat')}
          >
            Chat
            {unreadCount > 0 && activeApp !== 'chat' && (
              <span className="jarvis-badge">{unreadCount}</span>
            )}
          </button>
          <button
            className={`jarvis-tab${activeApp === 'requests' ? ' active' : ''}`}
            onClick={() => handleTabChange('requests')}
          >
            Requests
            {requestCount > 0 && (
              <span className="jarvis-badge">{requestCount}</span>
            )}
          </button>
          <button
            className={`jarvis-tab${activeApp === 'todo' ? ' active' : ''}`}
            onClick={() => handleTabChange('todo')}
          >
            To Do
            {todoCount > 0 && (
              <span className="jarvis-badge">{todoCount}</span>
            )}
          </button>
          <button
            className={`jarvis-tab${activeApp === 'tests' ? ' active' : ''}`}
            onClick={() => handleTabChange('tests')}
          >
            Tests
          </button>
        </div>

        {/* Session error banner */}
        {sessionError && (
          <div style={{
            background: '#fff3cd',
            borderBottom: '1px solid #ffc107',
            padding: '8px 16px',
            fontSize: '13px',
            color: '#856404',
            flexShrink: 0,
          }}>
            {sessionError}
          </div>
        )}

        {/* Active panel */}
        <div className="jarvis-panel">
          {activeApp === 'chat' && (
            <ChatApp
              sessionId={sessionId}
              serverTime={serverTime}
              notifications={notifications}
              onNotificationRead={handleNotificationRead}
            />
          )}
          {activeApp === 'requests' && <RequestsApp />}
          {activeApp === 'todo' && <TodoApp />}
          {activeApp === 'tests' && <TestPanel />}
        </div>
      </div>
    </div>
  );
};

export default Jarvis;
