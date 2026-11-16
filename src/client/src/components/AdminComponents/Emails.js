import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../api/apiFetch';
import '../JobPage/jobSide.css';
import './emails.css';

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
        <section className="js-card em-card">
            <div className="js-head"><h3>Emails</h3></div>
            {error && <p className="em-error">{error}</p>}
            <ul className="em-list">
                {emails.map((email) => (
                    <li key={email.id}>
                        <div><strong>{email.subject || '(no subject)'}</strong></div>
                        <div className="em-actions">
                            <a href={`message://%3C${encodeURIComponent(email.message_id)}%3E`}>Open</a>
                            <button type="button" className="danger" onClick={() => handleRemove(email)}>Delete</button>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default Emails;
