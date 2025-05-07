import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const JobList = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
    const [starredJobs, setStarredJobs] = useState([]); // New state for starred jobs
    const [sortBy, setSortBy] = useState('created_at');
    const [order, setOrder] = useState('desc');
    const navigate = useNavigate();

    const fetchJobs = useCallback(async () => {
        try {
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/getjobs?sortBy=${sortBy}&order=${order}`,
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
                setJobs(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [sortBy, order, token]);

    const fetchStarredJobs = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/getstarredjobs`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                setStarredJobs(data.map((job) => job.job_id)); // Extract job IDs
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    useEffect(() => {
        fetchJobs();
        fetchStarredJobs(); // Fetch starred jobs on component load
    }, [fetchJobs, fetchStarredJobs]);

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

    const handleStarJob = async (id) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/starjob`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 201) {
                alert('Job starred successfully!');
                setStarredJobs((prev) => [...prev, id]); // Add job to starred list
            } else {
                console.error(data);
                alert('Failed to star the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while starring the job.');
        }
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
                setStarredJobs((prev) => prev.filter((jobId) => jobId !== id)); // Remove job from starred list
            } else {
                console.error(data);
                alert('Failed to unstar the job.');
            }
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
                <button onClick={handleAddJob} className='search-button'>Add Job 추가</button>
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
                        {jobs.map((job) => (
                            <tr key={job.id} className='table-row' onClick={() => handleRowClick(job.id)}>
                                <td>{job.job_number}</td>
                                <td>{job.company_name}</td>
                                <td>{job.attention || '—'}</td>
                                <td>{formatDate(job.created_at)}</td>
                                <td>{job.po_number || '—'}</td>
                                <td>{formatDate(job.po_date) || '—'}</td>
                                <td>{job.invoice_number || '—'}</td>
                                <td>
                                    {starredJobs.includes(job.id) ? (
                                        <button onClick={(e) => { e.stopPropagation(); handleUnstarJob(job.id); }} className='star-button'>
                                            끝난
                                        </button>
                                    ) : (
                                        <button onClick={(e) => { e.stopPropagation(); handleStarJob(job.id); }} className='star-button'>
                                            진행 중
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default JobList;
