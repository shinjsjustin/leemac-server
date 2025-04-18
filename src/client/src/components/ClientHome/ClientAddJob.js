import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

import '../Styling/RequestTable.css';

const ClientAddJob = () => {
    const navigate = useNavigate();
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const clientid = decodedToken?.id || -1;

    const [jobNumber, setJobNumber] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [attention, setAttention] = useState('');


    const fetchJobNumber = useCallback(async () => {
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
                const nextJobNum = parseInt(data.current_job_num, 10) + 1;
                setJobNumber(nextJobNum);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    const fetchAdminInfo = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/admins/getadmin/${clientid}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const data = await res.json();
            if (res.status === 200) {
                setCompanyId(data.company_id); // Set company ID
                setAttention(data.name); // Set attention to admin name
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token, clientid]);

    useEffect(() => {
        fetchJobNumber();
        fetchAdminInfo();
    }, [fetchAdminInfo, fetchJobNumber]);

    const handleOnClick = async (e) => {
        e.preventDefault();

        try {
            // 1. Create job
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/newjob`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jobNum: jobNumber,
                    companyId,
                    attention
                }),
            });

            const data = await res.json();

            if (res.status === 201) {
                // 2. Update job number in metadata
                await fetch(`${process.env.REACT_APP_URL}/internal/job/updatejobnum`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ number: jobNumber }),
                });

                // 3. Link admin to the job
                await fetch(`${process.env.REACT_APP_URL}/internal/admins/admin-job`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        job_id: data.id,
                        admin_id: clientid,
                    }),
                });

                navigate(`/job/${data.id}`);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error('Error:', e);
        }
    };

    return (
        <div>
            <button onClick={handleOnClick}>Add Job</button>
        </div>
    );
};

export default ClientAddJob;
