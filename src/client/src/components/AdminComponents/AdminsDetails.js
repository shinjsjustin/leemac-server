import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate, useParams, useLocation } from 'react-router-dom';

const AdminDetails = ({ adminName: propAdminName }) => {
    const token = localStorage.getItem('token');
    const { id } = useParams();
    const { state } = useLocation();
    const adminName = propAdminName || state?.adminName; // Use prop or state
    const [jobs, setJobs] = useState([]);
    const [linkedJobs, setLinkedJobs] = useState([]);
    const navigate = useNavigate();

    const fetchJobs = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/getjobs`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                setJobs(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    const fetchLinkedJobs = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/admins/getlinkedjobs/${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                setLinkedJobs(data.map((job) => job.job_id)); // Extract job IDs
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [id, token]);

    useEffect(() => {
        fetchJobs();
        fetchLinkedJobs();
        // console.log('Admin Name: ', adminName); // Log the admin name
    }, [fetchJobs, fetchLinkedJobs, adminName]);

    const handleLinkJob = async (jobId) => {
        // console.log('id: ', id); // Log the admin ID
        // console.log('jobId: ', jobId); // Log the job ID
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/admins/admin-job`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ job_id: jobId, admin_id: id }),
            });
            const data = await response.json();
            if (response.status === 201) {
                alert('Job linked successfully!');
                setLinkedJobs((prev) => [...prev, jobId]); // Add job to linked list
            } else {
                console.error(data);
                alert('Failed to link the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while linking the job.');
        }
    };

    const handleUnlinkJob = async (jobId) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/admins/admin-job`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ admin_id: id, job_id: jobId }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Job unlinked successfully!');
                setLinkedJobs((prev) => prev.filter((id) => id !== jobId)); // Remove job from linked list
            } else {
                console.error(data);
                alert('Failed to unlink the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while unlinking the job.');
        }
    };

    return (
        <div>
            <Navbar />
            <button onClick={() => navigate(-1)}>Back</button>
            <div className="requests">
                <h2>{adminName}'s Details</h2> {/* Updated header */}
                <table className="requests-table">
                    <thead>
                        <tr>
                            <th>Job #</th>
                            <th>Company Name</th>
                            <th>Attention</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id}>
                                <td>{job.job_number}</td>
                                <td>{job.company_name}</td>
                                <td>{job.attention || '—'}</td>
                                <td>
                                    {linkedJobs.includes(job.id) ? (
                                        <button onClick={() => handleUnlinkJob(job.id)}>Unlink Job</button>
                                    ) : (
                                        <button onClick={() => handleLinkJob(job.id)}>Link Job</button>
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

export default AdminDetails;
