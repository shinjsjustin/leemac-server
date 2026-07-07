import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';
import { SHOP_STATUSES } from '../AdminComponents/ShopUpdate';
import { apiFetch } from '../../api/apiFetch';

const STATUS_MAP = Object.fromEntries(SHOP_STATUSES.map(s => [s.key, s]));
const LEGACY_STATUSES = {
    open:    { key: 'open',    label: 'Open',    color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
    urgent:  { key: 'urgent',  label: 'Urgent',  color: '#C62828', bg: '#FDECEA', border: '#EF9A9A' },
    waiting: { key: 'waiting', label: 'Waiting', color: '#F57F17', bg: '#FFF8E1', border: '#FFE082' },
    done:    { key: 'done',    label: 'Done',    color: '#424242', bg: '#F5F5F5', border: '#BDBDBD' },
};
const FULL_STATUS_MAP = { ...LEGACY_STATUSES, ...STATUS_MAP };

const ClientHome = () => {
    const token = localStorage.getItem('token');
    const tokenPayload = JSON.parse(atob(token.split('.')[1]));
    const companyId = tokenPayload.company_id;
    const userId = tokenPayload.id;

    // In Progress section state
    const [jobGroups, setJobGroups] = useState({});
    const [partFiles, setPartFiles] = useState({});
    const [activeFilter, setActiveFilter] = useState('All');
    const [openJobs, setOpenJobs] = useState(new Set());
    const [notePartId, setNotePartId] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [statusPickerPartId, setStatusPickerPartId] = useState(null);

    // Archive section state
    const [archiveJobs, setArchiveJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const observerRef = useRef();
    const lastJobElementRef = useRef();

    const navigate = useNavigate();
    const LIMIT = 35;

    const fetchStarredJobs = useCallback(async () => {
        try {
            const response = await apiFetch(
                `/internal/job/getstarredjobsfullbycompany?companyId=${encodeURIComponent(companyId)}`
            );
            const data = await response.json();
            if (response.status !== 200) { console.error(data); return; }
            if (!data.length) { setJobGroups({}); return; }

            const groups = {};
            data.forEach(row => {
                const {
                    job_id, job_part_id, part_id, part_number, part_description,
                    quantity, price, rev, details, part_note, status, nfc_tag_id,
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
                    nfc_tag_id: nfc_tag_id || null,
                });
            });

            setJobGroups(groups);
            setPartFiles({});
        } catch (e) {
            console.error(e);
        }
    }, [companyId]);

    const fetchArchiveJobs = useCallback(async (reset = false) => {
        if (loading) return;
        setLoading(true);
        const currentOffset = reset ? 0 : offset;

        try {
            const response = await apiFetch(
                `/internal/job/getjobsbycompany?companyId=${encodeURIComponent(companyId)}&limit=${LIMIT}&offset=${currentOffset}`
            );
            const data = await response.json();
            if (response.status === 200) {
                if (reset) {
                    setArchiveJobs(data.jobs);
                    setOffset(LIMIT);
                } else {
                    setArchiveJobs(prev => [...prev, ...data.jobs]);
                    setOffset(prev => prev + LIMIT);
                }
                setHasMore(data.pagination.hasMore);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [companyId, offset, loading]);

    const handleAddNote = async (jobId) => {
        if (!noteText.trim()) return alert('Note content cannot be empty.');
        try {
            const res = await apiFetch('/internal/notes/newnote', {
                method: 'POST',
                body: { content: noteText, userid: userId, jobid: jobId },
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

    const handleUpdateStarStatus = async (jobPartId, status) => {
        try {
            const response = await apiFetch('/internal/job/updatestarjobstatus', {
                method: 'PUT',
                body: { jobPartId, status },
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

    const fetchPartFilesForJob = useCallback(async (group) => {
        const partIds = [...new Set(group.parts.map(p => p.part_id).filter(Boolean))];
        const uncached = partIds.filter(pid => !(pid in partFiles));
        if (!uncached.length) return;

        const entries = await Promise.all(
            uncached.map(async (pid) => {
                try {
                    const res = await apiFetch(`/internal/part/getblob?partID=${pid}`);
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
    }, [partFiles]);

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

    const collapseAll = () => setOpenJobs(new Set());

    useEffect(() => {
        fetchStarredJobs();
        setArchiveJobs([]);
        setOffset(0);
        setHasMore(true);
        fetchArchiveJobs(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchStarredJobs]);

    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    fetchArchiveJobs();
                }
            },
            { threshold: 1.0 }
        );

        if (lastJobElementRef.current) {
            observerRef.current.observe(lastJobElementRef.current);
        }

        return () => { if (observerRef.current) observerRef.current.disconnect(); };
    }, [hasMore, loading, fetchArchiveJobs]);

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };

    const getStatusInfo = (part) => {
        const raw = part.starStatus || 'open';
        return FULL_STATUS_MAP[raw] || LEGACY_STATUSES.open;
    };

    // ── Derived data ──────────────────────────────────────────────────────────
    const allGroups = Object.values(jobGroups);
    const allParts = allGroups.flatMap(g => g.parts);
    const activeStatusKeys = [...new Set(allParts.map(p => p.starStatus || 'open'))];
    const activeCount = allParts.filter(p => !['done', 'invoiced'].includes(p.starStatus || 'open')).length;
    const attentionValues = [...new Set(allGroups.map(g => g.attention).filter(Boolean))];

    const filteredGroups = allGroups.filter(group => {
        if (activeFilter === 'All') return true;
        if (attentionValues.includes(activeFilter)) return group.attention === activeFilter;
        return group.parts.some(p => (p.starStatus || 'open') === activeFilter);
    });

    // ── Top layer: Active Parts tile ──────────────────────────────────────────
    const renderTopLayer = () => (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{
                flex: '0 0 auto', backgroundColor: '#fff',
                border: '1px solid #dee2e6', borderRadius: '8px', padding: '12px 20px',
                textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2E7D32' }}>{activeCount}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Active Parts</div>
            </div>
        </div>
    );

    // ── Middle layer: status pills + expand/collapse ───────────────────────────
    const renderMiddleLayer = () => {
        const statusPills = activeStatusKeys
            .filter(k => k !== 'open' || allParts.some(p => (p.starStatus || 'open') === 'open'))
            .map(k => ({ key: k, label: (FULL_STATUS_MAP[k] || LEGACY_STATUSES.open).label }));

        return (
            <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <button
                        onClick={() => setActiveFilter('All')}
                        style={{
                            padding: '4px 14px', borderRadius: '16px',
                            border: activeFilter === 'All' ? '2px solid #1565C0' : '1px solid #ccc',
                            backgroundColor: activeFilter === 'All' ? '#1565C0' : '#fff',
                            color: activeFilter === 'All' ? '#fff' : '#333',
                            cursor: 'pointer', fontSize: '13px',
                            fontWeight: activeFilter === 'All' ? '600' : 'normal',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        All
                    </button>
                    {attentionValues.map(name => (
                        <button
                            key={name}
                            onClick={() => setActiveFilter(activeFilter === name ? 'All' : name)}
                            style={{
                                padding: '4px 14px', borderRadius: '16px',
                                border: activeFilter === name ? '2px solid #1565C0' : '1px solid #ccc',
                                backgroundColor: activeFilter === name ? '#1565C0' : '#fff',
                                color: activeFilter === name ? '#fff' : '#333',
                                cursor: 'pointer', fontSize: '13px',
                                fontWeight: activeFilter === name ? '600' : 'normal',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {name}
                        </button>
                    ))}
                    {statusPills.map(({ key, label }) => {
                        const info = FULL_STATUS_MAP[key] || LEGACY_STATUSES.open;
                        const isActive = activeFilter === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveFilter(isActive ? 'All' : key)}
                                style={{
                                    padding: '4px 14px', borderRadius: '16px',
                                    border: isActive ? `2px solid ${info.color}` : `1px solid ${info.border}`,
                                    backgroundColor: isActive ? info.color : info.bg,
                                    color: isActive ? '#fff' : info.color,
                                    cursor: 'pointer', fontSize: '13px',
                                    fontWeight: isActive ? '600' : 'normal',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
            </div>
        );
    };

    // ── Part card (+Note and Preview only) ────────────────────────────────────
    const renderPartCard = (part, group) => {
        const statusInfo = getStatusInfo(part);
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
                    <div
                        onClick={(e) => { e.stopPropagation(); setStatusPickerPartId(part.job_part_id); }}
                        style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px',
                            fontWeight: 'bold', backgroundColor: statusInfo.bg,
                            color: statusInfo.color, border: `1px solid ${statusInfo.border}`,
                            whiteSpace: 'nowrap', cursor: 'pointer',
                        }}
                    >
                        {statusInfo.label}
                    </div>
                </div>

                {/* Part details */}
                <div style={{ padding: '10px 14px', fontSize: '12px', color: '#444', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {part.rev && <span><strong>Rev:</strong> {part.rev}</span>}
                    {part.details && <span><strong>Details:</strong> {part.details}</span>}
                    <span><strong>Qty:</strong> {part.quantity || 1}</span>
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
                style={{ border: '3px solid #dee2e6', borderRadius: '8px', marginBottom: '16px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', backgroundColor: '#fff' }}
            >
                <div
                    onClick={() => toggleJob(group.job_id)}
                    style={{ padding: '12px 16px', backgroundColor: '#f8f9fa', cursor: 'pointer', borderBottom: isOpen ? '1px solid #dee2e6' : 'none' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                                style={{ fontWeight: 'bold', fontSize: '15px', color: group.invoice_number ? '#4CAF50' : (group.po_number ? '#1a3a8f' : '#999'), cursor: 'pointer' }}
                                onClick={(e) => { e.stopPropagation(); navigate(`/job/${group.job_id}`); }}
                            >
                                #{group.job_number}
                            </span>
                            <span style={{ fontSize: '13px', color: '#555' }}>{group.attention}</span>
                        </div>
                        <span style={{ color: '#888', fontSize: '12px' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                        <span>{group.parts.length} part{group.parts.length !== 1 ? 's' : ''}</span>
                        {!isOpen && (
                            <span style={{ color: '#999', marginLeft: '8px' }}>
                                {group.parts.map(p => p.part_number).join(', ')}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                        Invoice# {group.invoice_number || '—'} · PO# {group.po_number || '—'} · Due: {formatDate(group.due_date)}
                    </div>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateRows: isOpen ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.35s ease',
                }}>
                    <div style={{ minHeight: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: '#282c34' }}>
                            {group.parts.map(part => renderPartCard(part, group))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div>
            <Navbar />

            {/* In Progress Section */}
            <div className='requests' style={{ backgroundColor: '#282c34' }}>
                <h2 style={{ color: '#fff' }}>In Progress</h2>
                {renderTopLayer()}
                {renderMiddleLayer()}
                <div>
                    {filteredGroups.map(group => renderJobAccordion(group))}
                    {filteredGroups.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                            No starred parts match the current filter.
                        </div>
                    )}
                </div>
            </div>

            {/* Archive Section */}
            <div className='requests'>
                <h2>Job Archive</h2>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Job #</th>
                            <th>Created</th>
                            <th>PO #</th>
                            <th>PO Date</th>
                            <th>Invoice #</th>
                            <th>Parts</th>
                        </tr>
                    </thead>
                    <tbody>
                        {archiveJobs.map((job, index) => {
                            const isLastJob = index === archiveJobs.length - 1;
                            return (
                                <tr
                                    key={job.id}
                                    className='table-row'
                                    onClick={() => navigate(`/job/${job.id}`)}
                                    ref={isLastJob ? lastJobElementRef : null}
                                >
                                    <td>{job.job_number}</td>
                                    <td>{formatDate(job.created_at)}</td>
                                    <td>{job.po_number || '—'}</td>
                                    <td>{formatDate(job.po_date)}</td>
                                    <td>{job.invoice_number || '—'}</td>
                                    <td>
                                        {job.parts && job.parts.length > 0 ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {job.parts.map((part, i) => (
                                                    <span
                                                        key={i}
                                                        style={{
                                                            display: 'inline-block', padding: '2px 8px',
                                                            backgroundColor: '#eef2f7', border: '1px solid #d6dee8',
                                                            borderRadius: '10px', fontSize: '12px', whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {part.number}{part.quantity ? ` ×${part.quantity}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {loading && (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        Loading more jobs...
                    </div>
                )}
                {!hasMore && archiveJobs.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        No more jobs to load
                    </div>
                )}
            </div>

            {/* Status Picker Modal */}
            {statusPickerPartId !== null && (() => {
                const targetPart = Object.values(jobGroups)
                    .flatMap(g => g.parts)
                    .find(p => p.job_part_id === statusPickerPartId);
                return (
                    <div
                        style={{
                            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1001, padding: '16px',
                        }}
                        onClick={(e) => { if (e.target === e.currentTarget) setStatusPickerPartId(null); }}
                    >
                        <div style={{
                            backgroundColor: '#fff', borderRadius: '12px', padding: '24px',
                            width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                        }}>
                            <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '4px' }}>Update Status</div>
                            {targetPart && (
                                <div style={{ fontSize: '13px', color: '#555', marginBottom: '16px' }}>
                                    {targetPart.part_number}
                                </div>
                            )}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                                gap: '8px',
                                marginBottom: '16px',
                            }}>
                                {SHOP_STATUSES.map(s => (
                                    <button
                                        key={s.key}
                                        onClick={async () => {
                                            await handleUpdateStarStatus(statusPickerPartId, s.key);
                                            setStatusPickerPartId(null);
                                        }}
                                        style={{
                                            padding: '12px 8px', borderRadius: '8px',
                                            border: `2px solid ${s.border}`, backgroundColor: s.bg,
                                            color: s.color, cursor: 'pointer', fontSize: '12px',
                                            fontWeight: '700', textAlign: 'center', lineHeight: '1.3',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.94)')}
                                        onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setStatusPickerPartId(null)}
                                style={{
                                    width: '100%', padding: '10px', borderRadius: '6px',
                                    border: '1px solid #ccc', backgroundColor: '#fff',
                                    cursor: 'pointer', fontSize: '14px',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default ClientHome;
