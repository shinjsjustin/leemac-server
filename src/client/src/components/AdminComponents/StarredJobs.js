import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const StarredJobs = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const userId = decodedToken?.id;
    const accessLevel = decodedToken?.access || 0;

    const [jobGroups, setJobGroups] = useState({});
    const [partFiles, setPartFiles] = useState({});
    const [activeFilter, setActiveFilter] = useState('All');
    const [openJobs, setOpenJobs] = useState(new Set());
    const [notePartId, setNotePartId] = useState(null);
    const [noteText, setNoteText] = useState('');
    const navigate = useNavigate();

    const fetchStarredJobs = useCallback(async () => {
        try {
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/getstarredjobsfull`,
                { method: 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
            const data = await response.json();
            if (response.status !== 200) { console.error(data); return; }
            if (!data.length) { setJobGroups({}); return; }

            // Group rows by job_id
            const groups = {};
            data.forEach(row => {
                const {
                    job_id, job_part_id, part_id, part_number, part_description,
                    quantity, price, rev, details, part_note, status,
                    job_number, attention, po_number, po_date, due_date,
                    invoice_number, created_at, company_name
                } = row;

                if (!groups[job_id]) {
                    groups[job_id] = {
                        job_id, job_number, company_name, attention,
                        po_number, po_date, due_date, invoice_number, created_at,
                        parts: [],
                    };
                }
                groups[job_id].parts.push({
                    job_part_id, part_id, part_number, part_description,
                    quantity, price, rev, details, part_note,
                    starStatus: status || 'open',
                });
            });

            setJobGroups(groups);
            // Clear cached files so stale previews don't persist after a refresh
            setPartFiles({});
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    useEffect(() => { fetchStarredJobs(); }, [fetchStarredJobs]);

    const handleUpdateStarStatus = async (jobPartId, status) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/updatestarjobstatus`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobPartId, status }),
            });
            if (response.status === 200) {
                fetchStarredJobs();
            } else {
                const d = await response.json();
                console.error(d);
                alert('Failed to update status.');
            }
        } catch (e) {
            console.error(e);
            alert('Error updating status.');
        }
    };

    const handleUnstarPart = async (jobPartId) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/unstarjob`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobPartId }),
            });
            if (response.status === 200) {
                fetchStarredJobs();
            } else {
                const d = await response.json();
                console.error(d);
                alert('Failed to finish part.');
            }
        } catch (e) {
            console.error(e);
            alert('Error finishing part.');
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
            if (res.status === 201) {
                setNotePartId(null);
                setNoteText('');
                fetchStarredJobs();
            } else {
                const d = await res.json();
                console.error(d);
                alert('Failed to add note.');
            }
        } catch (e) {
            console.error(e);
            alert('Error adding note.');
        }
    };

    const fetchPartFilesForJob = useCallback(async (group) => {
        const partIds = [...new Set(group.parts.map(p => p.part_id).filter(Boolean))];
        const uncached = partIds.filter(pid => !(pid in partFiles));
        if (!uncached.length) return;

        const entries = await Promise.all(
            uncached.map(async (pid) => {
                try {
                    const res = await fetch(`${process.env.REACT_APP_URL}/internal/part/getblob?partID=${pid}`, {
                        method: 'GET',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    });
                    if (!res.ok) return [pid, []];
                    const fileDetails = await res.json();
                    const mapped = fileDetails.map(file => {
                        let previewUrl = null;
                        if (file.mimetype === 'application/pdf' && file.content) {
                            try {
                                const binary = window.atob(file.content);
                                const bytes = new Uint8Array(binary.length);
                                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                                previewUrl = URL.createObjectURL(new Blob([bytes], { type: file.mimetype }));
                            } catch (_) {}
                        }
                        return { ...file, fileID: file.id, previewUrl };
                    });
                    return [pid, mapped];
                } catch (_) {
                    return [pid, []];
                }
            })
        );
        setPartFiles(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    }, [token, partFiles]);

    const toggleJob = (jobId) => {
        setOpenJobs(prev => {
            const next = new Set(prev);
            const opening = !next.has(jobId);
            opening ? next.add(jobId) : next.delete(jobId);
            if (opening && jobGroups[jobId]) {
                fetchPartFilesForJob(jobGroups[jobId]);
            }
            return next;
        });
    };

    const expandAll = () => {
        const allIds = Object.keys(jobGroups).map(Number);
        setOpenJobs(new Set(allIds));
        Object.values(jobGroups).forEach(group => fetchPartFilesForJob(group));
    };

    const collapseAll = () => {
        setOpenJobs(new Set());
    };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };

    const getPartStatus = (part) => {
        if (part.starStatus === 'urgent') return 'Urgent';
        if (part.starStatus === 'waiting') return 'Waiting';
        return 'Open';
    };

    const statusStyles = {
        Urgent:  { bg: '#FDECEA', text: '#C62828', border: '#EF9A9A' },
        Waiting: { bg: '#FFF8E1', text: '#F57F17', border: '#FFE082' },
        Open:    { bg: '#E8F5E9', text: '#2E7D32', border: '#A5D6A7' },
    };

    // ── Derived data ──────────────────────────────────────────────────────────
    const allGroups = Object.values(jobGroups);
    const allParts = allGroups.flatMap(g => g.parts);
    const jobNumbers = [...new Set(allGroups.map(g => g.job_number))];

    const openCount    = allParts.filter(p => getPartStatus(p) === 'Open').length;
    const urgentCount  = allParts.filter(p => getPartStatus(p) === 'Urgent').length;
    const waitingCount = allParts.filter(p => getPartStatus(p) === 'Waiting').length;
    const openValue    = allParts.reduce((sum, p) => sum + ((p.quantity || 0) * (p.price || 0)), 0);

    const filteredGroups = allGroups.filter(group => {
        if (activeFilter === 'All') return true;
        if (activeFilter === 'Urgent') return group.parts.some(p => getPartStatus(p) === 'Urgent');
        if (activeFilter === 'Waiting') return group.parts.some(p => getPartStatus(p) === 'Waiting');
        return group.job_number === activeFilter;
    });

    // ── Summary tiles ─────────────────────────────────────────────────────────
    const renderSummaryTiles = () => (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
                { label: 'Open Parts',  value: openCount,    color: '#2E7D32' },
                { label: 'Waiting',     value: waitingCount, color: '#F57F17' },
                { label: 'Urgent',      value: urgentCount,  color: '#C62828' },
                ...(accessLevel >= 2 ? [{ label: 'Open Value', value: `$${openValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#1565C0' }] : []),
            ].map(({ label, value, color }) => (
                <div key={label} style={{
                    flex: '1 1 80px', minWidth: '80px', backgroundColor: '#fff',
                    border: '1px solid #dee2e6', borderRadius: '8px', padding: '12px 8px',
                    textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{label}</div>
                </div>
            ))}
        </div>
    );

    // ── Filter pills (by job number) ──────────────────────────────────────────
    const renderFilterPills = () => {
        const pills = ['All', ...jobNumbers, 'Urgent', 'Waiting'];
        return (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {pills.map(pill => (
                    <button
                        key={pill}
                        onClick={() => setActiveFilter(pill)}
                        style={{
                            padding: '4px 14px', borderRadius: '16px',
                            border: activeFilter === pill ? '2px solid #1565C0' : '1px solid #ccc',
                            backgroundColor: activeFilter === pill ? '#1565C0' : '#fff',
                            color: activeFilter === pill ? '#fff' : '#333',
                            cursor: 'pointer', fontSize: '13px',
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

    // ── Part card ─────────────────────────────────────────────────────────────
    const renderPartCard = (part, group) => {
        const status = getPartStatus(part);
        const { bg, text, border } = statusStyles[status];
        const isNoteOpen = notePartId === part.job_part_id;

        return (
            <div
                key={part.job_part_id}
                style={{ border: '1px solid #ddd', borderRadius: '8px', marginBottom: '12px', backgroundColor: '#fff', overflow: 'hidden' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Part header */}
                <div style={{
                    padding: '10px 14px', backgroundColor: '#f8f9fa',
                    borderBottom: '1px solid #eee', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div>
                        <div
                            style={{ fontWeight: '700', fontSize: '14px', cursor: 'pointer', color: '#1a3a8f' }}
                            onClick={() => navigate(`/job/${group.job_id}`)}
                        >
                            {part.part_number}
                        </div>
                        {part.part_description && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{part.part_description}</div>
                        )}
                    </div>
                    <div style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px',
                        fontWeight: 'bold', backgroundColor: bg, color: text, border: `1px solid ${border}`,
                    }}>
                        {status}
                    </div>
                </div>

                {/* Part details */}
                <div style={{ padding: '10px 14px', fontSize: '12px', color: '#444', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {part.rev && <span><strong>Rev:</strong> {part.rev}</span>}
                    {part.details && <span><strong>Details:</strong> {part.details}</span>}
                    <span><strong>Qty:</strong> {part.quantity || 1}</span>
                    {accessLevel >= 2 && part.price != null && (
                        <span><strong>Price:</strong> ${Number(part.price).toFixed(2)}</span>
                    )}
                    {accessLevel >= 2 && part.price != null && (
                        <span><strong>Line:</strong> ${((part.quantity || 1) * Number(part.price)).toFixed(2)}</span>
                    )}
                    {part.part_note && (
                        <span style={{ color: '#666', fontStyle: 'italic' }}><strong style={{ fontStyle: 'normal' }}>Note:</strong> {part.part_note}</span>
                    )}
                </div>

                {/* Note input */}
                {isNoteOpen && (
                    <div style={{ padding: '8px 14px', backgroundColor: '#f9f9f9', borderTop: '1px solid #e0e0e0' }}>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add a note to job..."
                            style={{
                                width: '100%', minHeight: '60px', padding: '6px 8px',
                                fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc',
                                resize: 'vertical', boxSizing: 'border-box',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setNotePartId(null); setNoteText(''); }}
                                style={{ padding: '4px 12px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleAddNote(group.job_id)}
                                style={{ padding: '4px 12px', fontSize: '11px', borderRadius: '4px', border: 'none', backgroundColor: '#163a16', color: '#fff', cursor: 'pointer' }}
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div style={{
                    display: 'flex', gap: '8px', padding: '10px 14px',
                    borderTop: '1px solid #dee2e6', backgroundColor: '#fafafa', flexWrap: 'wrap',
                }}>
                    <button
                        onClick={() => handleUnstarPart(part.job_part_id)}
                        style={{ flex: '1 1 0', minWidth: '60px', padding: '7px 4px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#163a16', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                        Finish Part
                    </button>
                    <button
                        onClick={() => handleUpdateStarStatus(part.job_part_id, 'urgent')}
                        style={{ flex: '1 1 0', minWidth: '60px', padding: '7px 4px', borderRadius: '4px', border: '1px solid #EF9A9A', backgroundColor: '#FDECEA', color: '#C62828', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                        Urgent
                    </button>
                    <button
                        onClick={() => handleUpdateStarStatus(part.job_part_id, 'waiting')}
                        style={{ flex: '1 1 0', minWidth: '60px', padding: '7px 4px', borderRadius: '4px', border: '1px solid #FFE082', backgroundColor: '#FFF8E1', color: '#F57F17', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                        Waiting
                    </button>
                    <button
                        onClick={() => {
                            if (isNoteOpen) { setNotePartId(null); setNoteText(''); }
                            else { setNotePartId(part.job_part_id); setNoteText(''); }
                        }}
                        style={{ flex: '1 1 0', minWidth: '60px', padding: '7px 4px', borderRadius: '4px', border: '1px solid #aaa', backgroundColor: '#163a16', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                        + Note
                    </button>
                    {partFiles[part.part_id] && partFiles[part.part_id]
                        .filter(f => f.mimetype === 'application/pdf' && f.previewUrl)
                        .map((file, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    const tab = window.open(file.previewUrl, '_blank');
                                    if (tab) tab.focus();
                                }}
                                style={{ flex: '1 1 0', minWidth: '60px', padding: '7px 4px', borderRadius: '4px', border: 'none', backgroundColor: '#FF6D00', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                            >
                                Preview
                            </button>
                        ))
                    }
                </div>
            </div>
        );
    };

    // ── Job accordion ─────────────────────────────────────────────────────────
    const renderJobAccordion = (group) => {
        const isOpen = openJobs.has(group.job_id);

        return (
            <div
                key={group.job_id}
                style={{ border: '1px solid #dee2e6', borderRadius: '8px', marginBottom: '16px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', backgroundColor: '#fff' }}
            >
                {/* Accordion header */}
                <div
                    onClick={() => toggleJob(group.job_id)}
                    style={{ padding: '12px 16px', backgroundColor: '#f8f9fa', cursor: 'pointer', borderBottom: isOpen ? '1px solid #dee2e6' : 'none' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                                style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a3a8f', cursor: 'pointer' }}
                                onClick={(e) => { e.stopPropagation(); navigate(`/job/${group.job_id}`); }}
                            >
                                #{group.job_number}
                            </span>
                            <span style={{ fontSize: '13px', color: '#555' }}>{group.company_name}</span>
                        </div>
                        <span style={{ color: '#888', fontSize: '12px' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                        {group.attention && <span>{group.attention} · </span>}
                        <span>{group.parts.length} part{group.parts.length !== 1 ? 's' : ''}</span>
                        {!isOpen && (
                            <span style={{ color: '#999', marginLeft: '8px' }}>
                                {group.parts.map(p => p.part_number).join(', ')}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                        PO# {group.po_number || '—'} · Due: {formatDate(group.due_date)}
                    </div>
                </div>

                {/* Accordion body — part cards */}
                {isOpen && (
                    <div style={{ padding: '12px 16px' }}>
                        {group.parts.map(part => renderPartCard(part, group))}
                    </div>
                )}
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
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <button
                        onClick={expandAll}
                        style={{ padding: '5px 14px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px' }}
                    >
                        Expand All
                    </button>
                    <button
                        onClick={collapseAll}
                        style={{ padding: '5px 14px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px' }}
                    >
                        Collapse All
                    </button>
                </div>
                <div>
                    {filteredGroups.map(group => renderJobAccordion(group))}
                    {filteredGroups.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                            No starred parts match the current filter.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StarredJobs;
