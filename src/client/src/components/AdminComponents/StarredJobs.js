import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const StarredJobs = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const userId = decodedToken?.id;
    const accessLevel = decodedToken?.access || 0;
    const [jobs, setJobs] = useState([]);
    const [activeFilter, setActiveFilter] = useState('All');
    const [noteJobId, setNoteJobId] = useState(null);
    const [noteText, setNoteText] = useState('');
    const navigate = useNavigate();

    const fetchStarredJobs = useCallback(async () => {
        try {
            const starredResponse = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/getstarredjobs`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const starredData = await starredResponse.json();

            if (starredResponse.status === 200) {
                const jobDetails = await Promise.all(
                    starredData.map(async ({ job_id, status: starStatus }) => {
                        const jobSummaryResponse = await fetch(
                            `${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${job_id}`,
                            {
                                method: 'GET',
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );
                        const jobSummary = await jobSummaryResponse.json();

                        const recentNoteResponse = await fetch(
                            `${process.env.REACT_APP_URL}/internal/notes/getrecentnote?jobid=${job_id}`,
                            {
                                method: 'GET',
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );
                        const recentNote = recentNoteResponse.status === 200
                            ? (await recentNoteResponse.json()).content
                            : '—';

                        return {
                            id: job_id,
                            ...jobSummary.job,
                            latestNote: recentNote,
                            parts: jobSummary.parts || [],
                            starStatus: starStatus || 'open'
                        };
                    })
                );

                setJobs(jobDetails);
            } else {
                console.error(starredData);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    useEffect(() => {
        fetchStarredJobs();
    }, [fetchStarredJobs]);

    const handleUpdateStarStatus = async (jobId, status) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/updatestarjobstatus`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId, status }),
            });
            const data = await response.json();
            if (response.status === 200) {
                fetchStarredJobs();
            } else {
                console.error(data);
                alert('Failed to update job status.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while updating job status.');
        }
    };

    const handleAddNote = async (jobId) => {
        if (!noteText.trim()) return alert('Note content cannot be empty.');
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/newnote`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: noteText, userid: userId, jobid: jobId }),
            });
            const data = await res.json();
            if (res.status === 201) {
                setNoteJobId(null);
                setNoteText('');
                fetchStarredJobs();
            } else {
                console.error(data);
                alert('Failed to add note.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while adding note.');
        }
    };

    const handleRowClick = (id) => {
        navigate(`/job/${id}`);
    };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    const handleUnstarJob = async (id) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/unstarjob`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Job unstarred successfully!');
                fetchStarredJobs();
            } else {
                console.error(data);
                alert('Failed to unstar the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while unstarring the job.');
        }
    };

    // ── Status derivation ────────────────────────────────────────────────────
    const getStatus = (job) => {
        if (job.starStatus === 'urgent') return 'Urgent';
        if (job.starStatus === 'waiting') return 'Waiting';
        const note = job.latestNote;
        if (note && /urgent/i.test(note)) return 'Urgent';
        if (note && (note.startsWith('Waiting') || note.startsWith('Need Material'))) return 'Waiting';
        return 'Open';
    };

    const getSubtotal = (parts) =>
        parts.reduce((sum, p) => sum + ((p.quantity || 0) * (p.price || 0)), 0);

    const statusStyles = {
        Urgent:  { bg: '#FDECEA', text: '#C62828', border: '#EF9A9A' },
        Waiting: { bg: '#FFF8E1', text: '#F57F17', border: '#FFE082' },
        Open:    { bg: '#E8F5E9', text: '#2E7D32', border: '#A5D6A7' },
    };

    const dotColor = { Urgent: '#E53935', Waiting: '#FFB300', Open: '#1E88E5' };

    const thStyle = {
        padding: '4px 8px',
        textAlign: 'left',
        fontWeight: '600',
        borderBottom: '1px solid #ddd',
        whiteSpace: 'nowrap',
        backgroundColor: '#f0f0f0',
    };

    const tdStyle = {
        padding: '4px 8px',
        borderBottom: '1px solid #f0f0f0',
        whiteSpace: 'nowrap',
    };

    // ── Derived filter values ─────────────────────────────────────────────────
    const clients = [...new Set(jobs.map(j => j.company_name).filter(Boolean))];

    const filteredJobs = jobs.filter(job => {
        if (activeFilter === 'All') return true;
        if (activeFilter === 'Urgent') return getStatus(job) === 'Urgent';
        if (activeFilter === 'Waiting') return getStatus(job) === 'Waiting';
        if (activeFilter === 'No Invoice') return !job.invoice_number;
        return job.company_name === activeFilter;
    });

    const openCount    = jobs.filter(j => getStatus(j) === 'Open').length;
    const urgentCount  = jobs.filter(j => getStatus(j) === 'Urgent').length;
    const waitingCount = jobs.filter(j => getStatus(j) === 'Waiting').length;
    const openValue    = jobs.reduce((sum, j) => sum + getSubtotal(j.parts || []), 0);

    // ── Summary tiles ─────────────────────────────────────────────────────────
    const renderSummaryTiles = () => (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
                { label: 'Open Jobs',  value: openCount,   color: '#2E7D32' },
                { label: 'Waiting',    value: waitingCount, color: '#F57F17' },
                { label: 'Urgent',     value: urgentCount,  color: '#C62828' },
                ...(accessLevel >= 2 ? [{ label: 'Open Value', value: `$${openValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#1565C0' }] : []),
            ].map(({ label, value, color }) => (
                <div key={label} style={{
                    flex: '1 1 80px',
                    minWidth: '80px',
                    backgroundColor: '#fff',
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '12px 8px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{label}</div>
                </div>
            ))}
        </div>
    );

    // ── Filter pills ──────────────────────────────────────────────────────────
    const renderFilterPills = () => {
        const pills = ['All', ...clients, 'Urgent', 'Waiting', 'No Invoice'];
        return (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {pills.map(pill => (
                    <button
                        key={pill}
                        onClick={() => setActiveFilter(pill)}
                        style={{
                            padding: '4px 14px',
                            borderRadius: '16px',
                            border: activeFilter === pill ? '2px solid #1565C0' : '1px solid #ccc',
                            backgroundColor: activeFilter === pill ? '#1565C0' : '#fff',
                            color: activeFilter === pill ? '#fff' : '#333',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: activeFilter === pill ? '600' : 'normal',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        {pill}
                    </button>
                ))}
            </div>
        );
    };

    // ── Job card ──────────────────────────────────────────────────────────────
    const renderJobCard = (job) => {
        const status = getStatus(job);
        const { bg, text, border } = statusStyles[status];
        const dot = dotColor[status];
        const subtotal = getSubtotal(job.parts || []);

        return (
            <div
                key={job.id}
                style={{
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    backgroundColor: '#fff',
                }}
            >
                {/* ── Header (job info) ── */}
                <div
                    style={{
                        padding: '12px 16px',
                        backgroundColor: '#f8f9fa',
                        borderBottom: '1px solid #dee2e6',
                        cursor: 'pointer',
                    }}
                    onClick={() => handleRowClick(job.id)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>#{job.job_number}</div>
                        <div style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            backgroundColor: bg,
                            color: text,
                            border: `1px solid ${border}`,
                        }}>
                            {status}
                        </div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '600' }}>{job.company_name || '—'}</div>
                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>{job.attention || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                        PO# {job.po_number || '—'} &nbsp;·&nbsp; PO Date: {formatDate(job.po_date)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                        Created: {formatDate(job.created_at)} &nbsp;·&nbsp; Invoice# {job.invoice_number || '—'}
                    </div>
                </div>

                {/* ── Parts table ── */}
                <div
                    style={{ padding: '12px 16px', overflowX: 'auto', cursor: 'pointer' }}
                    onClick={() => handleRowClick(job.id)}
                >
                    {job.parts && job.parts.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Part Number</th>
                                    <th style={thStyle}>Qty</th>
                                    {accessLevel >= 2 && <th style={thStyle}>Unit Price</th>}
                                    {accessLevel >= 2 && <th style={thStyle}>Line Total</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {job.parts.map((part, i) => (
                                    <tr key={i}>
                                        <td style={tdStyle}>{part.number}</td>
                                        <td style={tdStyle}>{part.quantity}</td>
                                        {accessLevel >= 2 && <td style={tdStyle}>${(part.price || 0).toFixed(2)}</td>}
                                        {accessLevel >= 2 && (
                                            <td style={tdStyle}>
                                                ${((part.quantity || 0) * (part.price || 0)).toFixed(2)}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <span style={{ color: '#999', fontStyle: 'italic', fontSize: '12px' }}>No parts</span>
                    )}
                </div>

                {/* ── Subtotal bar ── */}
                {accessLevel >= 2 && (
                    <div style={{
                        padding: '6px 16px',
                        backgroundColor: '#f8f9fa',
                        borderTop: '1px solid #eee',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textAlign: 'right',
                        color: '#333',
                    }}>
                        Subtotal: ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                )}

                {/* ── Notes bar ── */}
                <div
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#fdfdfd',
                        borderTop: '1px solid #dee2e6',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: dot,
                        flexShrink: 0,
                    }} />
                    <span style={{
                        flex: 1,
                        color: '#444',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {job.latestNote || '—'}
                    </span>
                </div>
                {noteJobId === job.id && (
                    <div
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#f9f9f9',
                            borderTop: '1px solid #e0e0e0',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add a note..."
                            style={{
                                width: '100%',
                                minHeight: '60px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                resize: 'vertical',
                                boxSizing: 'border-box',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setNoteJobId(null); setNoteText(''); }}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '11px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    backgroundColor: '#fff',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleAddNote(job.id)}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '11px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: '#163a16',
                                    color: '#fff',
                                    cursor: 'pointer',
                                }}
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Action buttons (horizontal row) ── */}
                <div
                    style={{
                        display: 'flex',
                        gap: '8px',
                        padding: '10px 16px',
                        borderTop: '1px solid #dee2e6',
                        backgroundColor: '#fafafa',
                        flexWrap: 'wrap',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => handleUnstarJob(job.id)}
                        style={{
                            flex: '1 1 0',
                            minWidth: '60px',
                            padding: '8px 4px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            backgroundColor: '#163a16',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                        }}
                    >
                        Finish Job
                    </button>
                    <button
                        onClick={() => handleUpdateStarStatus(job.id, 'urgent')}
                        style={{
                            flex: '1 1 0',
                            minWidth: '60px',
                            padding: '8px 4px',
                            borderRadius: '4px',
                            border: '1px solid #EF9A9A',
                            backgroundColor: '#FDECEA',
                            color: '#C62828',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                        }}
                    >
                        Urgent
                    </button>
                    <button
                        onClick={() => handleUpdateStarStatus(job.id, 'waiting')}
                        style={{
                            flex: '1 1 0',
                            minWidth: '60px',
                            padding: '8px 4px',
                            borderRadius: '4px',
                            border: '1px solid #FFE082',
                            backgroundColor: '#FFF8E1',
                            color: '#F57F17',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                        }}
                    >
                        Waiting
                    </button>
                    <button
                        onClick={() => {
                            setNoteJobId(noteJobId === job.id ? null : job.id);
                            setNoteText('');
                        }}
                        style={{
                            flex: '1 1 0',
                            minWidth: '60px',
                            padding: '8px 4px',
                            borderRadius: '4px',
                            border: '1px solid #aaa',
                            backgroundColor: '#163a16',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                        }}
                    >
                        + Note
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>In Progress 진행 중</h2>
                {renderSummaryTiles()}
                {renderFilterPills()}
                <div>
                    {filteredJobs.map(job => renderJobCard(job))}
                    {filteredJobs.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                            No jobs match the current filter.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StarredJobs;
