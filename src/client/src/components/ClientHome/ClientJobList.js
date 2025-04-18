import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';
import {jwtDecode} from 'jwt-decode'; // Ensure jwtDecode is imported
import ClientAddJob from './ClientAddJob';

const ClientJobList = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;
    const [jobs, setJobs] = useState([]);
    
    const navigate = useNavigate();

    const fetchJobs = useCallback(async () => {
        try {
            // console.log("Fetching jobs with access level:", accessLevel);
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/admins/getlinkedjobs/${decodedToken.id}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            // console.log("Response status for job IDs fetch:", response.status);
            const jobIdsData = await response.json();
            // console.log("Job IDs data:", jobIdsData);
    
            if (response.status === 200) {
                // Send all job IDs in a single request
                const jobDetailsResponse = await fetch(
                    `${process.env.REACT_APP_URL}/internal/job/getjobsbyids`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ jobIds: jobIdsData }), // Send array of IDs
                    }
                );
                // console.log("Response status for job details fetch:", jobDetailsResponse.status);
                const jobDetailsData = await jobDetailsResponse.json();
                // console.log("Job details data:", jobDetailsData);
    
                if (jobDetailsResponse.status === 200) {
                    setJobs(jobDetailsData); // Set all jobs at once
                } else {
                    console.error("Error fetching job details:", jobDetailsData);
                }
            } else {
                console.error("Error fetching job IDs:", jobIdsData);
            }
        } catch (e) {
            console.error("Error in fetchJobs:", e);
        }
    }, [accessLevel, token]);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    return (
        <div>
            <Navbar />
            <ClientAddJob />
            <div className="job-list-container">
                <h1>Job List</h1>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Attention</th>
                            <th>Job Number</th>
                            <th>PO Number</th>
                            <th>PO Date</th>
                            <th>Created At</th>
                            <th>Due Date</th>
                            <th>Tax Code</th>
                            <th>Tax</th>
                            <th>Tax Percent</th>
                            <th>Invoice Number</th>
                            <th>Invoice Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id} onClick={()=> navigate(`/job/${job.id}`)}>
                                <td>{job.attention || "N/A"}</td>
                                <td>{job.job_number || "N/A"}</td>
                                <td>{job.po_number || "N/A"}</td>
                                <td>{job.po_date || "N/A"}</td>
                                <td>{job.created_at || "N/A"}</td>
                                <td>{job.due_date || "N/A"}</td>
                                <td>{job.tax_code || "N/A"}</td>
                                <td>{job.tax || "N/A"}</td>
                                <td>{job.tax_percent || "N/A"}</td>
                                <td>{job.invoice_number || "N/A"}</td>
                                <td>{job.invoice_date || "N/A"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClientJobList;