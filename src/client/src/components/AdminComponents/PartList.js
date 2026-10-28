import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import {useNavigate} from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import useSavedSearch from '../../hooks/useSavedSearch';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';
import PartPdfPreview from '../PartPdfPreview';


const PartList = () =>{
    const [partList, setPartList] = useState([]);

    const {
        number, description, searchNum, setSearchNum, searchDesc, setSearchDesc,
        applyNumber, applyDescription, clear,
    } = useSavedSearch('adminPartListSearch');

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
        fetchParts();
    }, [fetchParts, number, description]);

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
                        onKeyDown={(e) => e.key === 'Enter' && applyNumber()}
                        className="search-input"
                    />
                    <button onClick={applyNumber} className="search-button">
                        Search Number
                    </button>
                    <input
                        type="text"
                        placeholder="DESCRIPTION SEARCH"
                        value={searchDesc}
                        onChange={(e) => setSearchDesc(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyDescription()}
                        className="search-input"
                    />
                    <button onClick={applyDescription} className="search-button">
                        Search Desc
                    </button>
                    {(number || description) && (
                        <button onClick={clear} className="search-button">
                            Clear
                        </button>
                    )}
                </div>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Number</th>
                            <th>Description</th>
                            <th>Drawing</th>
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
                                <td>
                                    <PartPdfPreview
                                        file={part.latest_drawing}
                                        drawingCount={part.drawing_count}
                                        fetchUrl={fetchAdminDrawingUrl}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
};

export default PartList;