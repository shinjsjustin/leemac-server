import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import AddPart from './AddPart';

const Job = () => {
    const { id } = useParams();
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    const [job, setJob] = useState(null);
    const [parts, setParts] = useState([]);

    useEffect(() => {
        fetchJobDetails();
    }, []);

    const fetchJobDetails = async () => {
        try {
            const res = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${id}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            const data = await res.json();
            if (res.status === 200) {
                setJob(data.job);
                setParts(data.parts);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handlePartClick = (partId) => {
        navigate(`/part/${partId}`);
    };

    const handlePartAdded = (newPart) => {
        setParts(prev => [...prev, newPart]);
    };

    const handleGoBack = () => {
        navigate('/joblist');
    };

    if (!job) return <div>Loading...</div>;

    return (
        <div>
            <Navbar />
            <button onClick={handleGoBack}>Back</button>
            <div className='requests'>
                <h2>Job #{job.job_number}</h2>
                <p><strong>Attention:</strong> {job.attention}</p>
                <p><strong>Company:</strong> {job.company_name}</p>
                <p><strong>Created:</strong> {job.created_at?.slice(0, 10)}</p>
                <p><strong>PO Number:</strong> {job.po_number || '—'}</p>
                <p><strong>PO Date:</strong> {job.po_date || '—'}</p>

                <h3>Parts in Job</h3>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Part #</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parts.map(part => (
                            <tr key={part.id} onClick={() => handlePartClick(part.id)} style={{ cursor: 'pointer' }}>
                                <td>{part.number}</td>
                                <td>{part.quantity}</td>
                                <td>${part.price}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <hr />
                <AddPart jobId={id} onPartAdded={handlePartAdded} />
            </div>
        </div>
    );
};

export default Job;
