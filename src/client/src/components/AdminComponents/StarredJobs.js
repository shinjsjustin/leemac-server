import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const StarredJobs = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
    const [jobids, setJobIds] = useState([]);
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
            console.log(starredData);
            if (starredResponse.status === 200) {
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

                        const notesResponse = await fetch(
                            `${process.env.REACT_APP_URL}/internal/notes/getnote?jobid=${job_id}`,
                            {
                                method: 'GET',
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );
                        const notes = await notesResponse.json();
                        const latestNote = notes.length > 0 ? notes[0].content : '—';

                        // Ensure the job object includes the id property
                        return { id: job_id, ...jobSummary.job, latestNote };
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

    const handleRowClick = (id) => {
        navigate(`/job/${id}`);
    };

    const handleUnstarJob = async (id) => {
        console.log('Unstarring job with ID:', id);
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/unstarjob`, {
                method: 'DELETE', // Corrected HTTP method to DELETE
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }), // Corrected key to match backend expectation
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

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>Starred Jobs</h2>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Job #</th>
                            <th>Company Name</th>
                            <th>Attention</th>
                            <th>Created</th>
                            <th>PO #</th>
                            <th>PO Date</th>
                            <th>Invoice #</th>
                            <th>Latest Note</th>
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
                                <td>{job.latestNote}</td>
                                <td>
                                    <button onClick={(e) => { e.stopPropagation(); handleUnstarJob(job.id); }} className='unstar-button'>
                                        Unstar Job
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
