import React, { useState, useEffect } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const JobList = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
    const [sortBy, setSortBy] = useState('created_at');
    const [order, setOrder] = useState('desc');
    const navigate = useNavigate();

    useEffect(() => {
        fetchJobs();
    }, [sortBy, order]);

    const fetchJobs = async () => {
        try {
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/getjobs?sortBy=${sortBy}&order=${order}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
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
    };

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
                            <th onClick={() => handleSort('company_id')}>Company ID</th>
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
                                <td>{job.company_id}</td>
                                <td>{job.created_at?.slice(0, 10)}</td>
                                <td>{job.po_number || '—'}</td>
                                <td>{job.po_date || '—'}</td>
                                <td>{job.invoice_number || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default JobList;
