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

  // Open SSE connection.
  // Note: EventSource cannot send custom headers in the browser. The backend
  // /api/jarvis/events should accept req.query.token as a fallback to the
  // Authorization header. Notifications arrive only when that server-side
  // support is present; the rest of the app works regardless.
  useEffect(() => {
    if (!decoded || decoded.access < REQUIRED_ACCESS || !token) return;

    const BASE = process.env.REACT_APP_URL || 'http://localhost:3001/api';
    const url = `${BASE}/jarvis/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const notification = {
          id: Date.now() + Math.random(),
          text: data.text || data.message || JSON.stringify(data),
          raw: data,
        };
        setNotifications(prev => [...prev, notification]);
        setUnreadCount(prev => prev + 1);
      } catch (e) {
        // Ignore malformed SSE payloads
      }
    };

    es.onerror = () => {
      // Non-fatal — EventSource retries automatically.
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = useCallback((tab) => {
    setActiveApp(tab);
    if (tab === 'chat') {
      setUnreadCount(0);
    }
  }, []);

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
          </button>
          <button
            className={`jarvis-tab${activeApp === 'todo' ? ' active' : ''}`}
            onClick={() => handleTabChange('todo')}
          >
            To Do
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
