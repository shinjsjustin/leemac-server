import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const StarredJobs = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
    const [overallMetrics, setOverallMetrics] = useState({
        material: { numerator: 0, denominator: 0 },
        programming: { numerator: 0, denominator: 0 },
        manufacturing: { numerator: 0, denominator: 0 },
        total: { numerator: 0, denominator: 0 }
    });
    const navigate = useNavigate();

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

    useEffect(() => {
        fetchStarredJobs();
    }, [fetchStarredJobs]);

    const handleRowClick = (id) => {
        navigate(`/job/${id}`);
    };

    const formatDate = (isoString) => {
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
                <h2>In Progress 진행 중</h2>
                
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
                            <th>Job # 직무번호</th>
                            <th>Company Name 회사</th>
                            <th>Attention 담당자</th>
                            <th>Created 생성 날짜</th>
                            <th>PO #</th>
                            <th>PO Date</th>
                            <th>Invoice #</th>
                            <th>Parts 부품</th>
                            <th>Progress 진행률</th>
                            <th>Latest Note 메모</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id} className='table-row' onClick={() => handleRowClick(job.id)}>
                                <td>{job.job_number}</td>
                                <td>{job.company_name}</td>
                                <td>{job.attention || '—'}</td>
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
                                <td>
                                    <button onClick={(e) => { e.stopPropagation(); handleUnstarJob(job.id); }} className='unstar-button'>
                                        끝난
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StarredJobs;
