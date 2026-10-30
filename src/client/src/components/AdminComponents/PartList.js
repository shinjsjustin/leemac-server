import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../AdminLayout/AdminLayout';
import {useNavigate} from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import useSavedSearch from '../../hooks/useSavedSearch';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';
import PartPdfPreview from '../PartPdfPreview';
import OverviewRail from '../ClientComponents/OverviewRail';
import { listLists, createList } from '../../api/adminPartListsApi';
import './partLists.css';

const isValidList = (list) => typeof list?.name === 'string' && Array.isArray(list.part_ids);


const PartList = () =>{
    const [partList, setPartList] = useState([]);
    const [lists, setLists] = useState([]);
    const [selectedListId, setSelectedListId] = useState(null);
    const [listError, setListError] = useState('');

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

    const loadLists = useCallback(async () => {
        const result = await listLists();
        setLists(result.ok && Array.isArray(result.data) ? result.data.filter(isValidList) : []);
    }, []);

    useEffect(() => {
        loadLists();
    }, [loadLists]);

    const handleCreateList = async (name) => {
        const result = await createList(name);
        if (!result.ok) {
            setListError(result.error.message);
            return false;
        }
        setListError('');
        await loadLists();
        return true;
    };

    const selectedList = lists.find((list) => list.id === selectedListId);
    const shownParts = selectedList
        ? partList.filter((part) => selectedList.part_ids.includes(part.id))
        : partList;

    const handleRowClick = (id) => {
        navigate(`/part/${id}`);
    }

    const handleAddPart = () =>{
        navigate('/add-part');
    }

    return (
        <AdminLayout current="parts" crumb="Parts">
            <div className='part-lists-layout'>
            <div className='part-lists-rail'>
                <OverviewRail
                    lists={lists}
                    selectedListId={selectedListId}
                    onSelectList={setSelectedListId}
                    onCreate={handleCreateList}
                />
                {listError && <p role='alert' className='part-lists-error'>{listError}</p>}
            </div>
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
                        {shownParts.map((part) => (
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
                                        toggleClassName="search-button"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            </div>
        </AdminLayout>
    )
};

export default PartList;