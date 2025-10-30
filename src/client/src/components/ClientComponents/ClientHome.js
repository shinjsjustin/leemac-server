import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const ClientHome = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
    const [overallMetrics, setOverallMetrics] = useState({
        material: { numerator: 0, denominator: 0 },
        programming: { numerator: 0, denominator: 0 },
        manufacturing: { numerator: 0, denominator: 0 },
        total: { numerator: 0, denominator: 0 }
    });
    
    // Archive section state
    const [archiveJobs, setArchiveJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const observerRef = useRef();
    const lastJobElementRef = useRef();
    
    const navigate = useNavigate();
    const LIMIT = 35;

    const fetchOverallMetrics = useCallback(async (jobIds) => {
        if (jobIds.length === 0) {
            setOverallMetrics({
                material: { numerator: 0, denominator: 0 },
                programming: { numerator: 0, denominator: 0 }, 
                manufacturing: { numerator: 0, denominator: 0 },
                total: { numerator: 0, denominator: 0 }
            });
            return;
        }

        try {
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/tasks/getjobsmetrics`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ job_ids: jobIds })
                }
            );

            if (response.ok) {
                const metrics = await response.json();
                setOverallMetrics(metrics);
            } else {
                console.error('Failed to fetch overall metrics');
            }
        } catch (e) {
            console.error('Error fetching overall metrics:', e);
        }
    }, [token]);

    const fetchStarredJobs = useCallback(async () => {
        try {
            // Decode token to get client name
            const tokenPayload = JSON.parse(atob(token.split('.')[1]));
            const clientName = tokenPayload.name;

            const starredResponse = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/getstarredjobsfilteredbyclient?clientName=${encodeURIComponent(clientName)}`,
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
                const jobIds = starredData.map(({ job_id }) => job_id);
                
                const jobDetails = await Promise.all(
                    starredData.map(async ({ job_id }) => {
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

                        // Fetch individual job metrics
                        const metricsResponse = await fetch(
                            `${process.env.REACT_APP_URL}/internal/tasks/getjobmetrics?job_id=${job_id}`,
                            {
                                method: 'GET',
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );
                        const jobMetrics = metricsResponse.ok 
                            ? await metricsResponse.json() 
                            : {
                                material: { numerator: 0, denominator: 0 },
                                programming: { numerator: 0, denominator: 0 },
                                manufacturing: { numerator: 0, denominator: 0 },
                                total: { numerator: 0, denominator: 0 }
                            };

                        return { 
                            id: job_id, 
                            ...jobSummary.job, 
                            latestNote: recentNote,
                            metrics: jobMetrics,
                            parts: jobSummary.parts || []
                        };
                    })
                );
                
                setJobs(jobDetails);
                fetchOverallMetrics(jobIds);
            } else {
                console.error(starredData);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token, fetchOverallMetrics]);

    const fetchArchiveJobs = useCallback(async (reset = false) => {
        if (loading) return;
        
        setLoading(true);
        const currentOffset = reset ? 0 : offset;

        try {
            // Decode token to get client name
            const tokenPayload = JSON.parse(atob(token.split('.')[1]));
            const clientName = tokenPayload.name;

            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/getjobsbyclient?clientName=${encodeURIComponent(clientName)}&limit=${LIMIT}&offset=${currentOffset}`,
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
    }, [token, offset, loading]);

    const fetchCurrentJobNumber = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/currentjobnum`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const data = await res.json();
            if (res.status === 200) {
                return parseInt(data.current_job_num, 10) + 1;
            } else {
                console.error(data);
                return null;
            }
        } catch (e) {
            console.error(e);
            return null;
        }
    }, [token]);

    const handleAddJob = async () => {
        try {
            // Decode token to get client information
            const tokenPayload = JSON.parse(atob(token.split('.')[1]));
            const clientName = tokenPayload.name;
            const companyId = tokenPayload.company_id;

            // Get the next job number
            const nextJobNumber = await fetchCurrentJobNumber();
            if (!nextJobNumber) {
                alert('Failed to get next job number');
                return;
            }

            // 1. Create job
            const createJobResponse = await fetch(`${process.env.REACT_APP_URL}/internal/job/newjob`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jobNum: nextJobNumber,
                    companyId: companyId,
                    attention: clientName
                }),
            });

            const jobData = await createJobResponse.json();

            if (createJobResponse.status === 201) {
                const jobId = jobData.id;

                // 2. Update job number in metadata
                await fetch(`${process.env.REACT_APP_URL}/internal/job/updatejobnum`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ number: nextJobNumber }),
                });

                // 3. Automatically star the job
                await fetch(`${process.env.REACT_APP_URL}/internal/job/starjob`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ jobId: jobId, attention: clientName }),
                });

                // 4. Navigate to the new job
                navigate(`/job/${jobId}`);
            } else {
                console.error(jobData);
                alert('Failed to create job');
            }
        } catch (e) {
            console.error('Error creating job:', e);
            alert('Error creating job');
        }
    };

    useEffect(() => {
        fetchStarredJobs();
        
        // Reset and fetch archive jobs
        setArchiveJobs([]);
        setOffset(0);
        setHasMore(true);
        fetchArchiveJobs(true);
    }, [fetchStarredJobs, token]);

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

        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };
    }, [hasMore, loading, fetchArchiveJobs]);

    const handleRowClick = (id) => {
        navigate(`/job/${id}`);
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    const renderMiniMetricBar = (label, data, color) => {
        const percentage = data.denominator > 0 ? Math.round((data.numerator / data.denominator) * 100) : 0;
        
        return (
            <div style={{ textAlign: 'center', flex: '1' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                    {label}
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>
                    {data.numerator}/{data.denominator} ({percentage}%)
                </div>
                <div style={{ 
                    backgroundColor: '#e0e0e0', 
                    borderRadius: '8px', 
                    height: '12px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        backgroundColor: color,
                        height: '100%',
                        borderRadius: '8px',
                        width: `${percentage}%`,
                        transition: 'width 0.3s ease'
                    }}></div>
                </div>
            </div>
        );
    };

    const renderTotalMetricBar = (data) => {
        const percentage = data.denominator > 0 ? Math.round((data.numerator / data.denominator) * 100) : 0;
        
        return (
            <div style={{ marginTop: '15px' }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '5px' 
                }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Overall Progress</span>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                        {data.numerator}/{data.denominator} ({percentage}%)
                    </span>
                </div>
                <div style={{ 
                    backgroundColor: '#e0e0e0', 
                    borderRadius: '10px', 
                    height: '20px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        backgroundColor: '#96CEB4',
                        height: '100%',
                        borderRadius: '10px',
                        width: `${percentage}%`,
                        transition: 'width 0.3s ease'
                    }}></div>
                </div>
            </div>
        );
    };

    const renderJobMetricBars = (metrics) => {
        return (
            <div style={{ padding: '8px', fontSize: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    {renderMiniMetricBar('Mat', metrics.material, '#FF6B6B')}
                    {renderMiniMetricBar('Prog', metrics.programming, '#4ECDC4')}
                    {renderMiniMetricBar('Mfg', metrics.manufacturing, '#45B7D1')}
                </div>
                <div>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>
                        Total: {metrics.total.numerator}/{metrics.total.denominator} 
                        ({metrics.total.denominator > 0 ? Math.round((metrics.total.numerator / metrics.total.denominator) * 100) : 0}%)
                    </div>
                    <div style={{ 
                        backgroundColor: '#e0e0e0', 
                        borderRadius: '6px', 
                        height: '8px',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            backgroundColor: '#96CEB4',
                            height: '100%',
                            borderRadius: '6px',
                            width: `${metrics.total.denominator > 0 ? Math.round((metrics.total.numerator / metrics.total.denominator) * 100) : 0}%`,
                            transition: 'width 0.3s ease'
                        }}></div>
                    </div>
                </div>
            </div>
        );
    };

    const renderPartsList = (parts) => {
        if (!parts || parts.length === 0) {
            return <span style={{ color: '#666', fontStyle: 'italic' }}>No parts</span>;
        }

        return (
            <div style={{ fontSize: '11px' }}>
                {parts.map((part, index) => (
                    <div key={index} style={{ marginBottom: '2px' }}>
                        <strong>{part.number}</strong> - Qty: {part.quantity} - ${part.price || 0}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2>In Progress</h2>
                    <button 
                        onClick={handleAddJob}
                        style={{
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}
                    >
                        Add Job
                    </button>
                </div>
                
                {/* Overall Progress Metrics */}
                <div style={{
                    backgroundColor: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    marginBottom: '20px'
                }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Overall Progress Metrics</h3>
                    
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                        {renderMiniMetricBar('Material', overallMetrics.material, '#FF6B6B')}
                        {renderMiniMetricBar('Programming', overallMetrics.programming, '#4ECDC4')}
                        {renderMiniMetricBar('Manufacturing', overallMetrics.manufacturing, '#45B7D1')}
                    </div>
                    
                    {renderTotalMetricBar(overallMetrics.total)}
                    
                    <div style={{ 
                        marginTop: '15px', 
                        paddingTop: '15px', 
                        borderTop: '1px solid #dee2e6',
                        fontSize: '12px',
                        color: '#666'
                    }}>
                        <div>Active Jobs: {jobs.length}</div>
                    </div>
                </div>

                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Job #</th>
                            <th>Created </th>
                            <th>PO #</th>
                            <th>PO Date</th>
                            <th>Invoice #</th>
                            <th>Parts</th>
                            <th>Progress</th>
                            <th>Latest Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id} className='table-row' onClick={() => handleRowClick(job.id)}>
                                <td>{job.job_number}</td>
                                <td>{formatDate(job.created_at)}</td>
                                <td>{job.po_number || '—'}</td>
                                <td>{formatDate(job.po_date) || '—'}</td>
                                <td>{job.invoice_number || '—'}</td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    {renderPartsList(job.parts)}
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    {renderJobMetricBars(job.metrics)}
                                </td>
                                <td>{job.latestNote}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Archive Section */}
                <div style={{ marginTop: '40px' }}>
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
                                        onClick={() => handleRowClick(job.id)}
                                        ref={isLastJob ? lastJobElementRef : null}
                                    >
                                        <td>{job.job_number}</td>
                                        <td>{formatDate(job.created_at)}</td>
                                        <td>{job.po_number || '—'}</td>
                                        <td>{formatDate(job.po_date) || '—'}</td>
                                        <td>{job.invoice_number || '—'}</td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            {renderPartsList(job.parts)}
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
            </div>
        </div>
    );
};

export default ClientHome;
