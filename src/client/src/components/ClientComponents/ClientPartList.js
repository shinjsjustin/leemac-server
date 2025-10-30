import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const ClientPartList = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const companyId = decodedToken?.company_id;

    const [partList, setPartList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const navigate = useNavigate();

    const fetchParts = useCallback(async () => {
        if (!companyId) {
            setError('Company ID not found in token');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/part/getpartsbycompany?company_id=${companyId}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Error fetching parts: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            setPartList(data);
            setError('');
        } catch (e) {
            console.error('Error during fetchParts:', e);
            setError('Failed to load parts. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [companyId, token]);

    useEffect(() => {
        fetchParts();
    }, [fetchParts]);

    const handleRowClick = (id) => {
        navigate(`/part/${id}`);
    };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    };

    if (loading) {
        return (
            <div>
                <Navbar />
                <div className='requests'>
                    <h2>Loading parts...</h2>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <Navbar />
                <div className='requests'>
                    <h2>Parts</h2>
                    <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>
                        {error}
                    </div>
                    <button 
                        onClick={fetchParts} 
                        className="search-button"
                        style={{ display: 'block', margin: '0 auto' }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>My Parts History</h2>
                <p style={{ marginBottom: '20px', color: '#666' }}>
                    Parts used in your company's jobs (showing latest job information)
                </p>
                
                {partList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                        <h3>No parts found</h3>
                        <p>No parts have been used in jobs for your company yet.</p>
                    </div>
                ) : (
                    <table className='requests-table'>
                        <thead>
                            <tr>
                                <th>Part Number</th>
                                <th>Description</th>
                                <th>Latest Job #</th>
                                <th>Latest Job Date</th>
                                <th>Last Quantity</th>
                                <th>Last Price</th>
                                <th>Last Rev</th>
                                <th>Last Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {partList.map((part) => (
                                <tr
                                    key={part.id}
                                    className='table-row'
                                    onClick={() => handleRowClick(part.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td style={{ fontWeight: 'bold' }}>{part.number}</td>
                                    <td>{part.description || '—'}</td>
                                    <td>{part.latest_job_number || '—'}</td>
                                    <td>{formatDate(part.latest_job_date)}</td>
                                    <td>{part.latest_quantity || '—'}</td>
                                    <td>{part.latest_price ? `$${part.latest_price}` : '—'}</td>
                                    <td>{part.latest_rev || '—'}</td>
                                    <td>{part.latest_details || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                
                <div style={{ 
                    marginTop: '20px', 
                    padding: '15px', 
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#666'
                }}>
                    <strong>Total parts: {partList.length}</strong>
                    <br />
                    Click on any part to view detailed information and files.
                </div>
            </div>
        </div>
    );
};

export default ClientPartList;
