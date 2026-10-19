import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../api/apiFetch';

const EMPTY_FORM = { message_id: '', subject: '', from: '', date: '' };
const inputStyle = { padding: '5px 8px', fontSize: '13px' };
const buttonStyle = { padding: '3px 10px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' };

const Emails = ({ jobId, partId }) => {
    const [emails, setEmails] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
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

    const handleAdd = async (e) => {
        e.preventDefault();
        const target = jobId !== undefined ? { job_id: Number(jobId) } : { part_id: Number(partId) };
        if (await post('/internal/emails/add', { ...target, ...form })) setForm(EMPTY_FORM);
    };

    const handleRemove = (email) => {
        if (!window.confirm('Remove this email link?')) return;
        post('/internal/emails/remove', { id: email.id });
    };

    const handleCopy = (email) => navigator.clipboard.writeText(
        `Subject: ${email.subject || ''}\nFrom: ${email.from || ''}\nDate: ${new Date(email.date).toLocaleString()}\nMessage-ID: <${email.message_id}>`
    );

    const setField = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));

    return (
        <div style={{ padding: '16px', backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0' }}>
            <h3 style={{ marginTop: 0 }}>Emails</h3>
            {error && <p style={{ color: '#c62828', fontSize: '13px' }}>{error}</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0', display: 'grid', gap: '8px' }}>
                {emails.map((email) => (
                    <li key={email.id} style={{ fontSize: '13px' }}>
                        <div><strong>{email.subject || '(no subject)'}</strong></div>
                        <div style={{ color: '#555' }}>{email.from} · {new Date(email.date).toLocaleString()}</div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <a href={`message://%3C${encodeURIComponent(email.message_id)}%3E`} style={buttonStyle}>Open in Mail</a>
                            <button type="button" onClick={() => handleCopy(email)} style={buttonStyle}>Copy</button>
                            <button type="button" onClick={() => handleRemove(email)} style={{ ...buttonStyle, backgroundColor: '#f44336' }}>Remove</button>
                        </div>
                    </li>
                ))}
            </ul>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Message-ID" value={form.message_id} onChange={setField('message_id')} style={inputStyle} />
                <input type="text" placeholder="Subject" value={form.subject} onChange={setField('subject')} style={inputStyle} />
                <input type="text" placeholder="From" value={form.from} onChange={setField('from')} style={inputStyle} />
                <input type="datetime-local" value={form.date} onChange={setField('date')} style={inputStyle} />
                <button type="submit" style={buttonStyle}>Add</button>
            </form>
        </div>
    );
};

export default Emails;
