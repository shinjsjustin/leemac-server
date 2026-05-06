import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const JobList = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
    const [starredJobIds, setStarredJobIds] = useState(new Set());
    const [sortBy, setSortBy] = useState('created_at');
    const [order, setOrder] = useState('desc');
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [attentionSearch, setAttentionSearch] = useState('');
    const [attentionInput, setAttentionInput] = useState('');
    const navigate = useNavigate();
    const observerRef = useRef();
    const lastJobElementRef = useRef();

    const LIMIT = 35;

    const fetchJobs = useCallback(async (reset = false) => {
        if (loading) return;
        
        setLoading(true);
        const currentOffset = reset ? 0 : offset;

        try {
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/getjobs?sortBy=${sortBy}&order=${order}&limit=${LIMIT}&offset=${currentOffset}&attention=${encodeURIComponent(attentionSearch)}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const data = await response.json();
            if (response.status === 200) {
                if (reset) {
                    setJobs(data.jobs);
                    setOffset(LIMIT);
                } else {
                    setJobs(prev => [...prev, ...data.jobs]);
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
    }, [sortBy, order, token, offset, loading, attentionSearch]);

    const fetchStarredJobs = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/getstarredjobsfull`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                // Build a set of job_ids that have at least one starred part
                setStarredJobIds(new Set(data.map(row => row.job_id)));
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    useEffect(() => {
        setJobs([]);
        setOffset(0);
        setHasMore(true);
        fetchJobs(true);
        fetchStarredJobs();
    }, [sortBy, order, token, attentionSearch]);

    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    fetchJobs();
                }
            },
            { threshold: 1.0 }
        );

        if (lastJobElementRef.current) {
            observerRef.current.observe(lastJobElementRef.current);
        }

        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };
    }, [hasMore, loading, fetchJobs]);

    const handleSort = (column) => {
        setSortBy(column);
        setOrder(order === 'asc' ? 'desc' : 'asc');
    };

    const handleRowClick = (id) => {
        navigate(`/job/${id}`);
    };

    const handleAddJob = () => {
        navigate('/add-job');
    };

    const handleStarJob = async (id, attention) => {
        try {
            // Fetch the job's parts first
            const summaryRes = await fetch(`${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${id}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const summaryData = await summaryRes.json();
            if (!summaryRes.ok || !summaryData.parts?.length) {
                alert('No parts found on this job. Please add parts before starring.');
                return;
            }
            await Promise.all(summaryData.parts.map(part =>
                fetch(`${process.env.REACT_APP_URL}/internal/job/starjob`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobPartId: part.job_part_id, attention }),
                })
            ));
            setStarredJobIds(prev => new Set([...prev, id]));
        } catch (e) {
            console.error(e);
            alert('An error occurred while starring the job.');
        }
    };

    const handleUnstarJob = async (id) => {
        try {
            // Fetch the job's parts to unstar each one
            const summaryRes = await fetch(`${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${id}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const summaryData = await summaryRes.json();
            if (summaryRes.ok && summaryData.parts?.length) {
                await Promise.all(summaryData.parts.map(part =>
                    fetch(`${process.env.REACT_APP_URL}/internal/job/unstarjob`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jobPartId: part.job_part_id }),
                    })
                ));
            }
            setStarredJobIds(prev => { const next = new Set(prev); next.delete(id); return next; });
        } catch (e) {
            console.error(e);
            alert('An error occurred while unstarring the job.');
        }
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>Jobs 일</h2>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleAddJob} className='search-button'>Add Job 추가</button>
                    <input
                        type='text'
                        placeholder='Search attention...'
                        value={attentionInput}
                        onChange={e => setAttentionInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') setAttentionSearch(attentionInput); }}
                        style={{ padding: '6px 10px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '200px' }}
                    />
                    <button
                        onClick={() => setAttentionSearch(attentionInput)}
                        className='search-button'
                    >
                        Search
                    </button>
                    {attentionSearch && (
                        <button
                            onClick={() => { setAttentionSearch(''); setAttentionInput(''); }}
                            style={{ padding: '6px 10px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#fff' }}
                        >
                            Clear
                        </button>
                    )}
                </div>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('job_number')}>Job # 직무번호</th>
                            <th onClick={() => handleSort('company_name')}>Company Name 회사</th>
                            <th onClick={() => handleSort('attention')}>Attention 담당자</th>
                            <th onClick={() => handleSort('created_at')}>Created 생성 날짜</th>
                            <th onClick={() => handleSort('po_number')}>PO #</th>
                            <th onClick={() => handleSort('po_date')}>PO Date</th>
                            <th onClick={() => handleSort('invoice_number')}>Invoice #</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job, index) => {
                            const isLastJob = index === jobs.length - 1;
                            return (
                                <tr 
                                    key={job.id} 
                                    className='table-row' 
                                    onClick={() => handleRowClick(job.id)}
                                    ref={isLastJob ? lastJobElementRef : null}
                                >
                                    <td>{job.job_number}</td>
                                    <td>{job.company_name}</td>
                                    <td>{job.attention || '—'}</td>
                                    <td>{formatDate(job.created_at)}</td>
                                    <td>{job.po_number || '—'}</td>
                                    <td>{formatDate(job.po_date) || '—'}</td>
                                    <td>{job.invoice_number || '—'}</td>
                                    <td>
                                        {starredJobIds.has(job.id) ? (
                                            <button onClick={(e) => { e.stopPropagation(); handleUnstarJob(job.id); }} className='star-button'>
                                                끝난
                                            </button>
                                        ) : (
                                            <button onClick={(e) => { e.stopPropagation(); handleStarJob(job.id, job.attention); }} className='star-button'>
                                                진행 중
                                            </button>
                                        )}
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
                {!hasMore && jobs.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        No more jobs to load
                    </div>
                )}
            </div>
        </div>
    );
};

export default JobList;
