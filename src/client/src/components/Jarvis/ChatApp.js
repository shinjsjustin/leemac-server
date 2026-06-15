import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jarvisFetch } from './jarvisApi';

const BASE = process.env.REACT_APP_URL || 'http://localhost:3001/api';

/**
 * Streams a POST response body and calls onChunk with each decoded text piece.
 * Returns the full accumulated text.
 */
async function streamPost(path, body, onChunk) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/jarvis${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login-admin';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onChunk(fullText);
  }

  return fullText;
}

const formatServerTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return iso;
  }
};

let nextMsgId = 0;
const makeId = () => { nextMsgId += 1; return nextMsgId; };

const makeMsg = (role, text, extras = {}) => ({
  id: makeId(),
  role,
  text,
  ...extras,
});

// Renders message text as Markdown, mirroring Claude's chat formatting.
const MarkdownMessage = ({ text }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      a: ({ node, ...props }) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
      ),
    }}
  >
    {text}
  </ReactMarkdown>
);

const ChatApp = ({ sessionId, serverTime, notifications, onNotificationRead }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hasMorningBrief, setHasMorningBrief] = useState(false);
  const [isStartingDay, setIsStartingDay] = useState(false);
  const [isEndingDay, setIsEndingDay] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const prevNotificationsRef = useRef([]);
  const hasLoadedRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load today's persisted messages once the session is known.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await jarvisFetch('/messages');
        const data = await res.json();
        if (cancelled || !res.ok || !Array.isArray(data.messages)) return;
        setMessages(data.messages.map((m) => makeMsg(m.role, m.content, {
          messageType: m.message_type,
        })));
        if (data.messages.some((m) => m.message_type === 'morning_brief')) {
          setHasMorningBrief(true);
        }
      } catch (e) {
        // Non-fatal — start with an empty conversation.
      } finally {
        if (!cancelled) hasLoadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Persist the conversation whenever it settles (not mid-stream / mid-action).
  useEffect(() => {
    if (!sessionId || !hasLoadedRef.current) return;
    if (isSending || isStartingDay || isEndingDay) return;
    if (messages.length === 0) return;

    jarvisFetch('/messages', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        messages: messages
          .filter((m) => !m.ephemeral)
          .map((m) => ({
            role: m.role,
            content: m.text,
            messageType: m.messageType || 'chat',
          })),
      }),
    }).catch(() => { /* Non-fatal — will retry on next change. */ });
  }, [messages, isSending, isStartingDay, isEndingDay, sessionId]);

  // Inject incoming notifications as system messages
  useEffect(() => {
    const prev = prevNotificationsRef.current;
    const newOnes = notifications.filter(n => !prev.find(p => p.id === n.id));
    if (newOnes.length > 0) {
      setMessages(existing => [
        ...existing,
        ...newOnes.map(n => makeMsg('system', n.text || JSON.stringify(n))),
      ]);
      prevNotificationsRef.current = notifications;
      if (onNotificationRead) onNotificationRead();
    }
  }, [notifications, onNotificationRead]);

  const appendAssistantPlaceholder = (extras = {}) => {
    const msg = makeMsg('assistant', '', extras);
    setMessages(prev => [...prev, msg]);
    return msg.id;
  };

  const updateMessageById = useCallback((id, text) => {
    setMessages(prev =>
      prev.map(m => m.id === id ? { ...m, text } : m)
    );
  }, []);

  const handleStartDay = async () => {
    if (isStartingDay) return;
    setIsStartingDay(true);
    const placeholderId = appendAssistantPlaceholder({ messageType: 'morning_brief' });
    try {
      await streamPost('/start-day', { sessionId }, (text) => {
        updateMessageById(placeholderId, text);
      });
      setHasMorningBrief(true);
    } catch (err) {
      updateMessageById(placeholderId, `Error: ${err.message}`);
    } finally {
      setIsStartingDay(false);
    }
  };

  const handleSend = async () => {
    const message = inputValue.trim();
    if (!message || isSending) return;

    setInputValue('');
    setMessages(prev => [...prev, makeMsg('user', message)]);
    setIsSending(true);
    const placeholderId = appendAssistantPlaceholder();

    try {
      await streamPost('/chat', { message, sessionId }, (text) => {
        updateMessageById(placeholderId, text);
      });
    } catch (err) {
      updateMessageById(placeholderId, `Error: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    setMessages(prev => [
      ...prev,
      makeMsg('user', `Uploading: ${file.name}`, { fileName: file.name }),
    ]);

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      if (sessionId) formData.append('sessionId', sessionId);

      const res = await fetch(`${BASE}/jarvis/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login-admin';
        return;
      }

      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [
          ...prev,
          makeMsg('system', `File uploaded: ${file.name}`, {
            fileName: file.name,
            parsed: data.parsed || null,
          }),
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          makeMsg('system', `Upload failed: ${data.error || res.statusText}`),
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        makeMsg('system', `Upload error: ${err.message}`),
      ]);
    }
  };

  const handleEndDay = async () => {
    if (isEndingDay) return;
    setIsEndingDay(true);
    try {
      const res = await jarvisFetch('/end-day', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      const text = data.message || data.summary || 'Day ended.';
      // Messages were consolidated into memory and wiped server-side; reset UI.
      setMessages([makeMsg('system', text, { ephemeral: true })]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        makeMsg('system', `Error ending day: ${err.message}`),
      ]);
    } finally {
      setIsEndingDay(false);
    }
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <h3>Jarvis</h3>
        <span className="chat-server-time">
          {serverTime ? formatServerTime(serverTime) : ''}
        </span>
        <div className="chat-actions">
          {!hasMorningBrief && (
            <button
              className="chat-btn secondary"
              onClick={handleStartDay}
              disabled={isStartingDay}
            >
              {isStartingDay ? 'Loading...' : 'Start My Day'}
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#aaa', fontSize: '14px', marginTop: '40px' }}>
            Say hello or click "Start My Day" to begin.
          </p>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            {msg.role !== 'system' && (
              <span className="chat-message-label">
                {msg.role === 'user' ? 'You' : 'Jarvis'}
              </span>
            )}
            <div className="chat-bubble markdown-body">
              {msg.text
                ? <MarkdownMessage text={msg.text} />
                : (msg.role === 'assistant' ? '...' : '')}
            </div>
            {msg.parsed && (
              <details className="chat-attachment">
                <summary>Parsed content</summary>
                <pre>{JSON.stringify(msg.parsed, null, 2)}</pre>
              </details>
            )}
            {msg.fileName && !msg.parsed && (
              <div className="chat-attachment">
                Attachment: {msg.fileName}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div className="chat-input-row">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="chat-btn icon"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
        >
          📎
        </button>
        <input
          type="text"
          placeholder="Type a message..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
        />
        <button
          className="chat-btn primary"
          onClick={handleSend}
          disabled={isSending || !inputValue.trim()}
        >
          {isSending ? '...' : 'Send'}
        </button>
      </div>

      {/* Bottom bar */}
      <div className="chat-bottom-bar">
        <button
          className="chat-btn danger"
          onClick={handleEndDay}
          disabled={isEndingDay}
        >
          {isEndingDay ? 'Ending...' : 'End Day'}
        </button>
      </div>
    </div>
  );
};

export default ChatApp;
