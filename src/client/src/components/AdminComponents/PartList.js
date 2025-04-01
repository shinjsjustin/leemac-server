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
        fetchSeagateParts();
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

    const fetchSeagateParts= async () => {
        try{
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/getparts?number=${number}&description=${description}&company=${company}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            const data = await response.json();
            if (response.status === 200){
                setPartList(data);
            }else{
                console.error(data);
            }
        }catch(e){
            console.error(e);
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