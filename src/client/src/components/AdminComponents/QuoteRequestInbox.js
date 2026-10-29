import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import { listInbox, requestStatusLabel } from '../../api/quoteRequestsAdminApi';

const STATUS_FILTERS = ['sent', 'in_review', 'job_created'];

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-US') : '—');

const QuoteRequestInbox = () => {
    const [status, setStatus] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        let isCurrent = true;
        setLoading(true);
        setError('');
        listInbox(status || undefined).then((result) => {
            if (!isCurrent) return;
            if (result.ok) setRows(result.data);
            else setError(result.error.message);
            setLoading(false);
        });
        return () => { isCurrent = false; };
    }, [status]);

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>Quote Requests</h2>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value=''>All</option>
                    {STATUS_FILTERS.map((s) => (
                        <option key={s} value={s}>{requestStatusLabel(s)}</option>
                    ))}
                </select>
                {loading && <div>Loading quote requests...</div>}
                {error && <div>{error}</div>}
                {!loading && !error && rows.length === 0 && <div>No quote requests yet.</div>}
                {!loading && !error && rows.length > 0 && (
                    <table className='requests-table'>
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Request</th>
                                <th>Lines</th>
                                <th>Need by</th>
                                <th>Submitted</th>
                                <th>Status</th>
                                <th>Job</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className='table-row' onClick={() => navigate(`/quote-request/${row.id}`)}>
                                    <td>{row.company_name}</td>
                                    <td>{row.name || `Request #${row.id}`}</td>
                                    <td>{row.line_count}</td>
                                    <td>{formatDate(row.need_by)}</td>
                                    <td>{formatDate(row.submitted_at)}</td>
                                    <td>{requestStatusLabel(row.status)}</td>
                                    <td>{row.job_number || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default QuoteRequestInbox;
