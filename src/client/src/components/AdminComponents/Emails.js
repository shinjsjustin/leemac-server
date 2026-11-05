import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../api/apiFetch';

const buttonStyle = { padding: '3px 10px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' };

const Emails = ({ jobId, partId }) => {
    const [emails, setEmails] = useState([]);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(jobId !== undefined ? `/internal/emails?jobId=${jobId}` : `/internal/emails?partId=${partId}`);
            const data = await res.json();
            if (!res.ok) return setError(data.error || 'Failed to load emails.');
            setEmails(data.emails);
        } catch (e) {
            console.error(e);
            setError('Failed to load emails.');
        }
    }, [jobId, partId]);

    useEffect(() => {
        load();
    }, [load]);

    // POSTs and reloads; shows the server's error text when the request is rejected.
    const post = async (path, body) => {
        try {
            const res = await apiFetch(path, { method: 'POST', body });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Request failed.');
                return false;
            }
            setError('');
            await load();
            return true;
        } catch (e) {
            console.error(e);
            setError('Request failed.');
            return false;
        }
    };

    const handleRemove = (email) => {
        if (!window.confirm('Remove this email link?')) return;
        post('/internal/emails/remove', { id: email.id });
    };

    return (
        <div style={{ padding: '16px', backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0' }}>
            <h3 style={{ marginTop: 0 }}>Emails</h3>
            {error && <p style={{ color: '#c62828', fontSize: '13px' }}>{error}</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px' }}>
                {emails.map((email) => (
                    <li key={email.id} style={{ fontSize: '13px', minWidth: 0 }}>
                        <div style={{ overflowWrap: 'anywhere' }}><strong>{email.subject || '(no subject)'}</strong></div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <a href={`message://%3C${encodeURIComponent(email.message_id)}%3E`} style={buttonStyle}>Open</a>
                            <button type="button" onClick={() => handleRemove(email)} style={{ ...buttonStyle, backgroundColor: '#f44336' }}>Delete</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Emails;
