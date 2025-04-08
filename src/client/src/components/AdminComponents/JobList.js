import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const JobList = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
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

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    const handleSort = (column) => {
        setSortBy(column);
        setOrder(order === 'asc' ? 'desc' : 'asc');
    };

    const handleRowClick = (id) => {
        navigate(`/job/${id}`);
    };

    const handleAddJob = () =>{
        navigate('/add-job');
    }

    const handleStarJob = async (id) => {
        console.log('Star job clicked:', id);
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/starjob`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }), // Corrected key to match backend expectation
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Job starred successfully!');
            } else {
                console.error(data);
                alert('Failed to star the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while starring the job.');
        }
    };

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>Jobs</h2>
                <button onClick={handleAddJob} className='search-button'>Add Job</button>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('job_number')}>Job #</th>
                            <th onClick={() => handleSort('company_name')}>Company Name</th>
                            <th onClick={() => handleSort('attention')}>Attention</th>
                            <th onClick={() => handleSort('created_at')}>Created</th>
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
                                <td>{job.created_at?.slice(0, 10)}</td>
                                <td>{job.po_number || '—'}</td>
                                <td>{job.po_date || '—'}</td>
                                <td>{job.invoice_number || '—'}</td>
                                <td>
                                    <button onClick={(e) => { e.stopPropagation(); handleStarJob(job.id); }} className='star-button'>
                                        Star Job
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

export default JobList;
