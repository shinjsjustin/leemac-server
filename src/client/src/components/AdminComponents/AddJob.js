import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import '../Styling/RequestTable.css';

const AddJob = () => {
    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    const [jobNumber, setJobNumber] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [companies, setCompanies] = useState([]);
    const [attention, setAttention] = useState('');

    const handleGoBack = () => {
        navigate('/joblist');
    };

    useEffect(() => {
        fetchJobNumber();
        fetchCompanies();
    }, []);

    const fetchJobNumber = async () => {
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
    };

    const fetchCompanies = async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/company/getcompanies`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const data = await res.json();
            if (res.status === 200) {
                setCompanies(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSubmit = async (e) => {
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
            <button onClick={handleGoBack}>Back</button>
            <div className='container'>
                <h1 className='header'>Add Job</h1>
                <form className='container-form' onSubmit={handleSubmit}>
                    <input
                        type='text'
                        placeholder='Job Number'
                        value={jobNumber}
                        disabled
                    />
                    <select
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        required
                    >
                        <option value=''>Select Company</option>
                        {companies.map((company) => (
                            <option key={company.id} value={company.id}>
                                {company.name}
                            </option>
                        ))}
                    </select>
                    <input
                        type='text'
                        placeholder='Attention'
                        value={attention}
                        onChange={(e) => setAttention(e.target.value)}
                        required
                    />
                    <button type='submit'>Submit</button>
                </form>
            </div>
        </div>
    );
};

export default AddJob;
