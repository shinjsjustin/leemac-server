import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import {useNavigate} from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

const SESSION_KEY = 'adminPartListSearch';

const getSavedSearch = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {}; } catch { return {}; }
};

const PartList = () =>{
    const [partList, setPartList] = useState([]);

    const [number, setNumber] = useState(() => getSavedSearch().number || '');
    const [description, setDescription] = useState(() => getSavedSearch().description || '');

    const [searchNum, setSearchNum] = useState(() => getSavedSearch().number || '');
    const [searchDesc, setSearchDesc] = useState(() => getSavedSearch().description || '');

    const navigate = useNavigate();

    const fetchParts = useCallback(async () => {
        try {
            const response = await apiFetch(
                `/internal/part/getparts?number=${number}&description=${description}`
            );

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('Unexpected response type:', contentType);
                console.error('Response text:', await response.text());
                return;
            }

            if (!response.ok) {
                console.error(`Error fetching parts: ${response.status} ${response.statusText}`);
                return;
            }

            const data = await response.json();
            if (response.status === 200) {
                if (data.length === 0) {
                    console.warn('No parts found for the given search criteria.');
                }
                setPartList(data);
            } else {
                console.error('Unexpected response:', data);
            }
        } catch (e) {
            console.error('Error during fetchParts:', e);
        }
    }, [number, description]);

    useEffect(() => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ number, description }));
        fetchParts();
    }, [fetchParts, number, description]);

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


    const handleRowClick = (id) => {
        navigate(`/part/${id}`);
    }

    const handleAddPart = () =>{
        navigate('/add-part');
    }

    return (
        <div>
            <Navbar/>
            <div className='requests'>
                <h2>Parts</h2>
                <button onClick={handleAddPart} className='search-button'>Add Part</button>
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
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Number</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {partList.map((part) => (
                            <tr
                                key={part.id}
                                className='table-row'
                                onClick={() => handleRowClick(part.id)}
                            >
                                <td>{part.number}</td>
                                <td>{part.description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
};

export default PartList;