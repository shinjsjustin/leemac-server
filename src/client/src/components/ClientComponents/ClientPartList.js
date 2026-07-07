import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { apiFetch } from '../../api/apiFetch';

const SESSION_KEY = 'clientPartListSearch';

const getsavedSearch = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {}; } catch { return {}; }
};

const ClientPartList = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const companyId = decodedToken?.company_id;

    const [partList, setPartList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [number, setNumber] = useState(() => getsavedSearch().number || '');
    const [description, setDescription] = useState(() => getsavedSearch().description || '');
    const [searchNum, setSearchNum] = useState(() => getsavedSearch().number || '');
    const [searchDesc, setSearchDesc] = useState(() => getsavedSearch().description || '');

    const navigate = useNavigate();

    const fetchParts = useCallback(async () => {
        if (!companyId) {
            setError('Company ID not found in token');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const params = new URLSearchParams({ company_id: companyId });
            if (number) params.append('number', number);
            if (description) params.append('description', description);
            const response = await apiFetch(
                `/internal/part/getpartsbycompany?${params.toString()}`
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
    }, [companyId, number, description]);

    useEffect(() => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ number, description }));
        fetchParts();
    }, [fetchParts, number, description]);

    const handleRowClick = (id) => {
        navigate(`/part/${id}`);
    };

    const handleNumberSearch = () => {
        setNumber(searchNum);
    };

    const handleDescriptionSearch = () => {
        setDescription(searchDesc);
    };

    const handleClearSearch = () => {
        setNumber('');
        setDescription('');
        setSearchNum('');
        setSearchDesc('');
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
                <div className="search-container">
                    <input
                        type="text"
                        placeholder="NUMBER SEARCH"
                        value={searchNum}
                        onChange={(e) => setSearchNum(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNumberSearch()}
                        className="search-input"
                    />
                    <button onClick={handleNumberSearch} className="search-button">
                        Search Number
                    </button>
                    <input
                        type="text"
                        placeholder="DESCRIPTION SEARCH"
                        value={searchDesc}
                        onChange={(e) => setSearchDesc(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleDescriptionSearch()}
                        className="search-input"
                    />
                    <button onClick={handleDescriptionSearch} className="search-button">
                        Search Desc
                    </button>
                    {(number || description) && (
                        <button onClick={handleClearSearch} className="search-button">
                            Clear
                        </button>
                    )}
                </div>
                
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
