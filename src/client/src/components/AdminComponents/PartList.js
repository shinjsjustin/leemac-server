import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import {useNavigate} from 'react-router-dom';

const PartList = () =>{
    const token = localStorage.getItem('token');

    const [partList, setPartList] = useState([]);

    const [number, setNumber] = useState('');
    const [description, setDescription] = useState('');

    const [searchNum, setSearchNum] = useState('');
    const [searchDesc, setSearchDesc] = useState('');

    const navigate = useNavigate();

    const fetchParts = useCallback(async () => {
        const url = `${process.env.REACT_APP_URL}/internal/part/getparts?number=${number}&description=${description}`;
        try {
            const response = await fetch(
                url,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
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
    }, [number, description, token]);

    useEffect(() => {
        fetchParts();
    }, [fetchParts]);

    const handleNumberSearch = () => {
        setNumber(searchNum);
    }

    const handleDescriptionSearch = () => {
        setDescription(searchDesc);
    }


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
                        onChange={(e) => setSearchNum(e.target.value)} // Update input value
                        className="search-input"
                    />
                    <button onClick={handleNumberSearch} className="search-button">
                        Search Number
                    </button>
                    <input
                        type="text"
                        placeholder="DESCRIPTION SEARCH"
                        value={searchDesc}
                        onChange={(e) => setSearchDesc(e.target.value)} // Update input value
                        className="search-input"
                    />
                    <button onClick={handleDescriptionSearch} className="search-button">
                        Search Desc
                    </button>
                </div>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Number</th>
                            <th>Description</th>
                            <th>Unit Price</th>
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
                                <td>{part.price}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
};

export default PartList;