import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

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

    const fetchJobNumber = useCallback(async () => {
        try {
            const res = await apiFetch('/internal/job/currentjobnum');

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

    const fetchCompanies = useCallback(async () => {
        try {
            const res = await apiFetch('/internal/company/getcompanies');

            const data = await res.json();
            if (res.status === 200) {
                setCompanies(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    useEffect(() => {
        fetchCompanies();
        fetchJobNumber();
    }, [fetchCompanies, fetchJobNumber]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            // 1. Create job
            const res = await apiFetch('/internal/job/newjob', {
                method: 'POST',
                body: { jobNum: jobNumber, companyId, attention },
            });

            const data = await res.json();

            if (res.status === 201) {
                // 2. Update job number in metadata
                await apiFetch('/internal/job/updatejobnum', {
                    method: 'POST',
                    body: { number: jobNumber },
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
                        value={jobNumber}
                        onChange={(e) => setJobNumber(e.target.value)}
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
