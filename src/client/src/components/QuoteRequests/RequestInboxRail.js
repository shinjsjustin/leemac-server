import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInbox, requestStatusLabel } from '../../api/quoteRequestsAdminApi';
import './requestInboxRail.css';

const ID_DIGITS = 4;
const TABS = ['all', 'sent', 'in_review', 'job_created'];

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-US') : '—');
const tabLabel = (tab) => (tab === 'all' ? 'All' : requestStatusLabel(tab));

const RequestInboxRail = ({ currentId }) => {
    const [rows, setRows] = useState([]);
    const [tab, setTab] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        let isCurrent = true;
        listInbox().then((result) => {
            if (!isCurrent) return;
            if (result.ok) setRows(result.data);
            else setError(result.error.message);
            setLoading(false);
        });
        return () => { isCurrent = false; };
    }, []);

    const count = (t) => (t === 'all' ? rows.length : rows.filter((r) => r.status === t).length);
    const shown = tab === 'all' ? rows : rows.filter((r) => r.status === tab);

    return (
        <section className="request-inbox">
            <header><h3>Quote requests</h3></header>
            {loading && <div className="request-inbox-msg">Loading quote requests...</div>}
            {error && <div className="request-inbox-msg">{error}</div>}
            {!loading && !error && (
                <>
                    <div className="tabs">
                        {TABS.map((t) => (
                            <button key={t} type="button" className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
                                {tabLabel(t)} {count(t)}
                            </button>
                        ))}
                    </div>
                    {shown.length === 0 && <div className="request-inbox-msg">No quote requests yet.</div>}
                    {shown.map((row) => (
                        <div
                            key={row.id}
                            className={`rq${row.id === currentId ? ' cur' : ''}${row.status === 'job_created' ? ' done' : ''}`}
                            onClick={() => navigate(`/quote-request/${row.id}`)}
                        >
                            <div>
                                <div className="top1">
                                    <b className="mono">REQ-{String(row.id).padStart(ID_DIGITS, '0')}</b>
                                    <small>{formatDate(row.submitted_at)}</small>
                                </div>
                                <b>{row.company_name}</b>
                                <small>{row.name} · {row.line_count} lines</small>
                                {row.job_number && <small>{row.job_number}</small>}
                            </div>
                        </div>
                    ))}
                </>
            )}
        </section>
    );
};

export default RequestInboxRail;
