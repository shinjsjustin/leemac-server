import React, { useState, useEffect } from 'react';
import Navbar from "../Navbar";
import {useNavigate} from 'react-router-dom';

const PartList = () =>{
    const token = localStorage.getItem('token');

    const [partList, setPartList] = useState([]);

    const [number, setNumber] = useState('');
    const [description, setDescription] = useState('');
    const [company, setCompany] = useState('');

    const [searchNum, setSearchNum] = useState('');
    const [searchDesc, setSearchDesc] = useState('');
    const [searchComp, setSearchComp] = useState('');

    const navigate = useNavigate();

    useEffect(()=> {
        fetchParts();
    }, [number, description, company])

    const handleNumberSearch = () => {
        setNumber(searchNum);
    }

    const handleDescriptionSearch = () => {
        setDescription(searchDesc);
    }

    const handleCompanySearch = () => {
        setCompany(searchComp);
    }

    const handleRowClick = (id) => {
        navigate(`/part/${id}`);
    }

    const handleAddPart = () =>{
        navigate('/add-part');
    }

    const fetchParts= async () => {
        const url = `${process.env.REACT_APP_URL}/internal/part/getparts?number=${number}&description=${description}&company=${company}`;
        // console.log('fetch Parts url: ', url);

        try {
            const response = await fetch(
                url,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Log the full response for debugging
            // console.log('Response:', response);

            // Check if the response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('Unexpected response type:', contentType);
                console.error('Response text:', await response.text()); // Log the raw response
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
    };

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
                    <input
                        type="text"
                        placeholder="COMPANY SEARCH"
                        value={searchComp}
                        onChange={(e) => setSearchComp(e.target.value)} // Update input value
                        className="search-input"
                    />
                    <button onClick={handleCompanySearch} className="search-button">
                        Search Company
                    </button>
                </div>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Number</th>
                            <th>Description</th>
                            <th>Unit Price</th>
                            <th>Company</th>
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
                                <td>{part.company}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
};

export default PartList;