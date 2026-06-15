// src/client/src/components/Jarvis/TestPanel.js
// TEMPORARY — manual test harness for Jarvis capabilities. Safe to delete.
// Each button exercises one integration:
//   - Calendar: direct backend call that creates a 1-hour Google Calendar event.
//   - ToDo / New job / Delete job: chat prompts that drive the orchestrator's tools.

import React, { useState } from 'react';
import { jarvisFetch } from './jarvisApi';

const BASE = process.env.REACT_APP_URL || 'http://localhost:3001/api';

// Sends a chat message and streams the assistant reply, calling onChunk with the
// accumulated text so the panel can render progress live.
async function streamChat(message, onChunk) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/jarvis/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    if (onChunk) onChunk(full);
  }
  return full;
}

const TESTS = [
  {
    key: 'calendar',
    label: 'Calendar test',
    description: 'Creates a 1-hour Google Calendar event starting now.',
  },
  {
    key: 'todo',
    label: 'ToDo test',
    description: 'Asks Jarvis to add a to-do item labeled "testing".',
  },
  {
    key: 'newjob',
    label: 'Request new job test',
    description: 'Asks Jarvis to queue a request to add job #1001 (company 11, attn Justin Shin).',
  },
  {
    key: 'deletejob',
    label: 'Request delete test job',
    description: 'Asks Jarvis to queue a request to delete test job #1001.',
  },
];

const CHAT_PROMPTS = {
  todo: 'Add a to-do item labeled "testing".',
  newjob:
    'Queue a request for approval to add a new job numbered 1001 for company code 11 ' +
    'with attention "Justin Shin".',
  deletejob:
    'Queue a request for approval to delete the test job numbered 1001.',
};

const TestPanel = () => {
  const [running, setRunning] = useState(null);
  const [results, setResults] = useState({});

  const setResult = (key, value) =>
    setResults((prev) => ({ ...prev, [key]: value }));

  const runCalendar = async () => {
    const res = await jarvisFetch('/google/calendar-test', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Calendar test failed');
    const start = data.event?.start?.dateTime || '';
    const link = data.event?.htmlLink ? `\n${data.event.htmlLink}` : '';
    return `Event created: ${data.event?.summary || 'event'}${start ? ` @ ${start}` : ''}${link}`;
  };

  const handleRun = async (test) => {
    if (running) return;
    setRunning(test.key);
    setResult(test.key, 'Running…');
    try {
      let output;
      if (test.key === 'calendar') {
        output = await runCalendar();
      } else {
        output = await streamChat(CHAT_PROMPTS[test.key], (text) =>
          setResult(test.key, text)
        );
      }
      setResult(test.key, output || 'Done.');
    } catch (err) {
      setResult(test.key, `Error: ${err.message}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      <div
        style={{
          marginBottom: 12,
          padding: '8px 12px',
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 6,
          fontSize: 13,
          color: '#856404',
        }}
      >
        Temporary test panel — safe to remove. Each button exercises one Jarvis capability.
      </div>

      {TESTS.map((test) => (
        <div
          key={test.key}
          style={{
            marginBottom: 16,
            padding: 12,
            border: '1px solid #e0e0e0',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{test.label}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{test.description}</div>
            </div>
            <button
              onClick={() => handleRun(test)}
              disabled={!!running}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: 'none',
                background: running === test.key ? '#999' : '#0d6efd',
                color: '#fff',
                cursor: running ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {running === test.key ? 'Running…' : 'Run'}
            </button>
          </div>
          {results[test.key] && (
            <pre
              style={{
                marginTop: 10,
                marginBottom: 0,
                padding: 10,
                background: '#f6f8fa',
                borderRadius: 6,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {results[test.key]}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
};

export default TestPanel;
