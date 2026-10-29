import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PartPdfPreview from '../PartPdfPreview';
import useSavedSearch from '../../hooks/useSavedSearch';
import PartListsPanel from './PartListsPanel';
import { listParts } from '../../api/portalApi';
import {
    listLists, createList, renameList, deleteList, addPartsToList, removePartsFromList,
} from '../../api/portalListsApi';

const VISIBLE_JOBS = 3;
const QUIET_BUTTON = 'portal-button portal-button--quiet';

// Job links must not trigger the row's navigation.
const stopPropagation = (event) => event.stopPropagation();

const LIST_REMOVED = 'That list was removed.';

const PartRow = ({ part, onOpen, isSelectable, isSelected, onToggle }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const hiddenCount = part.jobs.length - VISIBLE_JOBS;
    const shownJobs = isExpanded ? part.jobs : part.jobs.slice(0, VISIBLE_JOBS);

    return (
        <div className={`portal-card portal-part-row${isSelected ? ' portal-part-row--selected' : ''}`}
             onClick={() => (isSelectable ? onToggle(part.part_id) : onOpen(part.part_id))}>
            {isSelectable ? (
                <Link to={`/client-part/${part.part_id}`} onClick={stopPropagation}>
                    <strong>{part.part_number}</strong>
                </Link>
            ) : (
                <strong>{part.part_number}</strong>
            )}
            <p className="portal-part-desc">{part.part_description}</p>
            <div className="portal-part-jobs">
                {shownJobs.map((job) => (
                    <Link key={job.id} className="portal-part-job-link"
                          to={`/client-job/${job.id}`} onClick={stopPropagation}>
                        {job.job_number}
                    </Link>
                ))}
                {!isExpanded && hiddenCount > 0 && (
                    <button type="button" className="portal-button portal-part-more"
                            onClick={(event) => { event.stopPropagation(); setIsExpanded(true); }}>
                        {`+${hiddenCount} more`}
                    </button>
                )}
            </div>
            <PartPdfPreview file={part.latest_drawing} drawingCount={part.drawing_count}
                            toggleClassName={QUIET_BUTTON} />
        </div>
    );
};

const ClientPartsPage = () => {
    const navigate = useNavigate();
    const {
        number, description, searchNum, setSearchNum, searchDesc, setSearchDesc,
        applyNumber, applyDescription, clear,
    } = useSavedSearch('clientPartListSearch');
    const [parts, setParts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        setIsLoading(true);
        setError(null);
        listParts({ number, description }).then((result) => {
            if (!isCurrent) return;
            setIsLoading(false);
            if (!result.ok) {
                setError(result.error);
                setParts([]);
                return;
            }
            setError(null);
            setParts(result.data);
        });
        return () => { isCurrent = false; };
    }, [number, description]);

    const isSearching = Boolean(number || description);

    const [lists, setLists] = useState([]);
    const [selectedListId, setSelectedListId] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [listError, setListError] = useState(null);
    const [isBusy, setIsBusy] = useState(false);

    const reloadLists = async () => {
        const result = await listLists();
        if (result.ok) setLists(result.data);
        else setListError(result.error);
    };

    useEffect(() => { reloadLists(); }, []);

    const chooseList = (id) => {
        setSelectedListId(id === selectedListId ? null : id);
        setSelectedIds(new Set());
    };

    const togglePart = (id) => {
        const next = new Set(selectedIds);
        if (!next.delete(id)) next.add(id);
        setSelectedIds(next);
    };

    // Runs a list write; returns the data on success, or null after showing the error.
    const writeList = async (write) => {
        setIsBusy(true);
        setListError(null);
        const result = await write();
        setIsBusy(false);
        if (result.ok) return result.data;
        if (result.error.kind === 'not_found') {
            setSelectedListId(null);
            setSelectedIds(new Set());
            setListError({ kind: 'error', message: LIST_REMOVED });
            await reloadLists();
        } else {
            setListError(result.error);
        }
        return null;
    };

    const changeMembers = async (write) => {
        const updated = await writeList(() => write(selectedListId, [...selectedIds]));
        if (!updated) return;
        setLists(lists.map((l) => (l.id === updated.id ? updated : l)));
        setSelectedIds(new Set());
    };

    const reloadAfter = async (write) => {
        const data = await writeList(write);
        if (data === null) return false;
        await reloadLists();
        return true;
    };

    const onDelete = async (id) => {
        const isDeleted = await reloadAfter(() => deleteList(id));
        if (isDeleted && id === selectedListId) chooseList(id);
        return isDeleted;
    };

    const selectedList = lists.find((l) => l.id === selectedListId);
    const inList = selectedList ? new Set(selectedList.part_ids) : null;
    const listedParts = inList ? parts.filter((p) => inList.has(p.part_id)) : [];
    const otherParts = inList ? parts.filter((p) => !inList.has(p.part_id)) : parts;

    const renderRow = (part) => (
        <PartRow key={part.part_id} part={part} onOpen={(id) => navigate(`/client-part/${id}`)}
                 isSelectable={Boolean(selectedList)} isSelected={selectedIds.has(part.part_id)}
                 onToggle={togglePart} />
    );

    return (
        <PortalLayout
            title="Your parts"
            back={<Link className="portal-back-link" to="/client-home">Back to your jobs</Link>}
        >
            <div className="portal-parts-split">
                <PartListsPanel
                    lists={lists} selectedId={selectedListId} onSelect={chooseList} isBusy={isBusy}
                    onCreate={(name) => reloadAfter(() => createList(name))}
                    onRename={(id, name) => reloadAfter(() => renameList(id, name))}
                    onDelete={onDelete}
                />
                <div className="portal-parts-main">
                <div className="portal-search">
                    <div className="portal-search-row">
                        <input type="text" className="portal-input" aria-label="Number search"
                               placeholder="Part number" value={searchNum}
                               onChange={(e) => setSearchNum(e.target.value)}
                               onKeyDown={(e) => e.key === 'Enter' && applyNumber()} />
                        <button type="button" className={QUIET_BUTTON} aria-label="Search part number"
                                onClick={applyNumber}>Search</button>
                    </div>
                    <div className="portal-search-row">
                        <input type="text" className="portal-input" aria-label="Description search"
                               placeholder="Description" value={searchDesc}
                               onChange={(e) => setSearchDesc(e.target.value)}
                               onKeyDown={(e) => e.key === 'Enter' && applyDescription()} />
                        <button type="button" className={QUIET_BUTTON} aria-label="Search description"
                                onClick={applyDescription}>Search</button>
                    </div>
                    {isSearching && <button type="button" className={QUIET_BUTTON} onClick={clear}>Clear</button>}
                </div>
                {isLoading && <PortalMessage kind="loading" />}
                {error && <PortalMessage kind={error.kind} message={error.message} />}
                {!isLoading && !error && parts.length === 0 && (
                    <PortalMessage kind="empty" message={isSearching
                        ? 'No parts match your search.'
                        : "You don't have any parts with us yet."} />
                )}
                {listError && <PortalMessage kind={listError.kind === 'invalid' ? 'error' : listError.kind}
                                             message={listError.message} />}
                {selectedList && selectedIds.size > 0 && (
                    <div className="portal-parts-selection">
                        <button type="button" className="portal-button" disabled={isBusy}
                                onClick={() => changeMembers(addPartsToList)}>Add to list</button>
                        <button type="button" className="portal-button" disabled={isBusy}
                                onClick={() => changeMembers(removePartsFromList)}>Remove from list</button>
                        <button type="button" className={QUIET_BUTTON}
                                onClick={() => setSelectedIds(new Set())}>Clear selected</button>
                    </div>
                )}
                {selectedList && (
                    <div className="portal-parts-section">
                        <h2>{`In ${selectedList.name}`}</h2>
                        {listedParts.map(renderRow)}
                    </div>
                )}
                {selectedList ? otherParts.length > 0 && (
                    <div className="portal-parts-section">
                        <h2>Other parts</h2>
                        {otherParts.map(renderRow)}
                    </div>
                ) : otherParts.map(renderRow)}
                </div>
            </div>
        </PortalLayout>
    );
};

export default ClientPartsPage;
