import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const StarredJobs = () => {
    const token = localStorage.getItem('token');
    const [jobs, setJobs] = useState([]);
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
            // console.log(starredData);
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

                        // Ensure the job object includes the id property
                        return { id: job_id, ...jobSummary.job, latestNote: recentNote };
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

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    const handleUnstarJob = async (id) => {
        // console.log('Unstarring job with ID:', id);
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
                <h2>In Progress 진행 중</h2>
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
                            <th>Latest Note 메모</th>
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
