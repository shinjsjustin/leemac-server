import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../AdminLayout/AdminLayout';
import {useNavigate} from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import useSavedSearch from '../../hooks/useSavedSearch';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';
import PartPdfPreview from '../PartPdfPreview';
import OverviewRail from '../ClientComponents/OverviewRail';
import { listLists, createList, renameList, deleteList } from '../../api/adminPartListsApi';
import PartListsMenu from './PartListsMenu';
import './partLists.css';

const isValidList = (list) => typeof list?.name === 'string' && Array.isArray(list.part_ids);

const ListBar = ({ list, onRename, onDelete }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [name, setName] = useState(list.name);

    const save = async () => {
        if (await onRename(list.id, name)) setIsRenaming(false);
    };

    return (
        <div className='part-lists-bar'>
            <strong>{list.name}</strong>
            {isRenaming ? (
                <>
                    <input className='search-input' value={name} onChange={(e) => setName(e.target.value)} />
                    <button type='button' className='search-button' onClick={save}>Save</button>
                </>
            ) : (
                <button type='button' className='search-button' onClick={() => setIsRenaming(true)}>Rename</button>
            )}
            {isConfirming ? (
                <button type='button' className='search-button' onClick={() => onDelete(list.id)}>Confirm</button>
            ) : (
                <button type='button' className='search-button' onClick={() => setIsConfirming(true)}>Delete</button>
            )}
        </div>
    );
};

const TABLE_COLUMNS = 4;

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

    const handleListChanged = (changed) => {
        setLists((current) => current.map((list) => (list.id === changed.id ? changed : list)));
    };

    const handleRename = async (id, name) => {
        const result = await renameList(id, name);
        if (!result.ok) {
            setListError(result.error.message);
            return false;
        }
        setListError('');
        handleListChanged(result.data);
        return true;
    };

    const handleDelete = async (id) => {
        const result = await deleteList(id);
        if (!result.ok) {
            setListError(result.error.message);
            return;
        }
        setListError('');
        setSelectedListId(null);
        await loadLists();
    };

    const selectedList = lists.find((list) => list.id === selectedListId);
    const isInList = (part) => selectedList.part_ids.includes(part.id);
    const listParts = selectedList ? partList.filter(isInList) : partList;
    const otherParts = selectedList ? partList.filter((part) => !isInList(part)) : [];

    const handleRowClick = (id) => {
        navigate(`/part/${id}`);
    }

    const handleAddPart = () =>{
        navigate('/add-part');
    }

    const renderPartRow = (part, extraClass = '') => (
        <tr
            key={part.id}
            className={`table-row ${extraClass}`.trim()}
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
            <td>
                <PartListsMenu partId={part.id} lists={lists} onListChanged={handleListChanged} />
            </td>
        </tr>
    );

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
                {selectedList && (
                    <ListBar key={selectedList.id} list={selectedList} onRename={handleRename} onDelete={handleDelete} />
                )}
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Number</th>
                            <th>Description</th>
                            <th>Drawing</th>
                            <th>Lists</th>
                        </tr>
                    </thead>
                    <tbody>
                        {listParts.map((part) => renderPartRow(part))}
                        {selectedList && (
                            <>
                                {listParts.length === 0 && (
                                    <tr className='part-lists-empty'>
                                        <td colSpan={TABLE_COLUMNS}>No parts in this list yet</td>
                                    </tr>
                                )}
                                <tr className='part-lists-divider'>
                                    <th colSpan={TABLE_COLUMNS}>Other parts</th>
                                </tr>
                                {otherParts.map((part) => renderPartRow(part, 'part-lists-other'))}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
            </div>
        </AdminLayout>
    )
};

export default PartList;