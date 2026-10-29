import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PartWall from './PartWall';
import PartListsPanel from './PartListsPanel';
import ListRequestForm from './ListRequestForm';
import DrawingWindows, { useDrawingWindows } from './DrawingWindows';
import { listParts } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import {
    listLists, createList, renameList, deleteList, addPartsToList, removePartsFromList,
} from '../../api/portalListsApi';
import '../Styling/PortalParts.css';

const QUIET_BUTTON = 'portal-button portal-button--quiet';
const LIST_REMOVED = 'That list was removed.';
const PHONE_QUERY = '(max-width: 599px)';
const FINISHED_STAGES = ['done', 'delivered', 'shipped', 'invoiced'];
const ALL_MATERIALS = '';
const NO_NOTES = { jobs: {}, parts: {} };

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const toWindow = (part) => ({
    key: part.part_id,
    part_number: part.part_number,
    description: part.part_description,
    drawing: part.latest_drawing,
    rev: part.latest?.rev,
    stage: part.latest?.stage,
    job_number: part.latest?.job_number,
    material: part.latest?.material,
    finish: part.latest?.finish,
    quantity: part.latest?.quantity,
});

const isOnJob = (part) => Boolean(part.latest?.stage) && !FINISHED_STAGES.includes(part.latest.stage.key);

const matchesSearch = (part, needle) => [
    part.part_number, part.part_description, part.latest?.material,
    ...(part.jobs ?? []).map((job) => job.job_number),
].some((text) => String(text ?? '').toLowerCase().includes(needle));

function usePhone() {
    const [isPhone, setIsPhone] = useState(() => Boolean(window.matchMedia?.(PHONE_QUERY).matches));
    useEffect(() => {
        const query = window.matchMedia?.(PHONE_QUERY);
        if (!query?.addEventListener) return undefined;
        const update = () => setIsPhone(query.matches);
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    return isPhone;
}

function Switch({ options, value, onChange, label }) {
    return (
        <div className="portal-parts-switch" role="group" aria-label={label}>
            {options.map(([key, text]) => (
                <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>
            ))}
        </div>
    );
}

const ClientPartsPage = () => {
    const navigate = useNavigate();
    const windows = useDrawingWindows();
    const isPhone = usePhone();
    const [parts, setParts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notes, setNotes] = useState(NO_NOTES);
    const [search, setSearch] = useState('');
    const [material, setMaterial] = useState(ALL_MATERIALS);
    const [isOnJobOnly, setIsOnJobOnly] = useState(false);
    const [view, setView] = useState('drawings');
    const [phoneSide, setPhoneSide] = useState('parts');

    const [lists, setLists] = useState([]);
    const [pickedListId, setPickedListId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [listError, setListError] = useState(null);
    const [isBusy, setIsBusy] = useState(false);
    const [requestingListId, setRequestingListId] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        setIsLoading(true);
        setError(null);
        listParts().then((result) => {
            if (!isCurrent) return;
            setIsLoading(false);
            if (!result.ok) {
                setError(result.error);
                setParts([]);
                return;
            }
            setParts(result.data);
        });
        return () => { isCurrent = false; };
    }, []);

    const loadNotes = useCallback(async () => {
        const result = await listNotes();
        if (result.ok) setNotes(result.data);
    }, []);

    const reloadLists = async () => {
        const result = await listLists();
        if (result.ok) setLists(result.data);
        else setListError(result.error);
    };

    useEffect(() => { loadNotes(); reloadLists(); }, [loadNotes]);

    const materials = [...new Set(parts.map((p) => p.latest?.material).filter(Boolean))];
    const onJobCount = parts.filter(isOnJob).length;
    const needle = search.trim().toLowerCase();
    const shownParts = parts.filter((part) => matchesSearch(part, needle)
        && (material === ALL_MATERIALS || part.latest?.material === material)
        && (!isOnJobOnly || isOnJob(part)));
    const openNumbers = Object.fromEntries(windows.open.map((p, index) => [p.key, index + 1]));

    const startRequest = (id) => {
        setRequestingListId(id);
        setPhoneSide('parts');
    };

    const leaveGoneList = async () => {
        setRequestingListId(null);
        setPickedListId(null);
        setSelectedIds([]);
        setListError({ kind: 'error', message: LIST_REMOVED });
        await reloadLists();
    };

    const toggle = (id) => setSelectedIds((current) => (
        current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

    // Runs a list write; returns the data on success, or null after showing the error.
    const writeList = async (write) => {
        setIsBusy(true);
        setListError(null);
        const result = await write();
        setIsBusy(false);
        if (result.ok) return result.data;
        if (result.error.kind === 'not_found') await leaveGoneList();
        else setListError(result.error);
        return null;
    };

    const changeMembers = async (write, partIds) => {
        const updated = await writeList(() => write(pickedListId, partIds));
        if (!updated) return;
        setLists(lists.map((l) => (l.id === updated.id ? updated : l)));
        setSelectedIds([]);
    };

    const reloadAfter = async (write) => {
        const data = await writeList(write);
        if (data === null) return false;
        await reloadLists();
        return true;
    };

    const onDelete = async (id) => {
        const isDeleted = await reloadAfter(() => deleteList(id));
        if (isDeleted && id === pickedListId) setPickedListId(null);
        if (isDeleted && id === requestingListId) setRequestingListId(null);
        return isDeleted;
    };

    const pickedList = lists.find((l) => l.id === pickedListId);
    const requestingList = lists.find((l) => l.id === requestingListId);
    const onPicked = new Set(pickedList?.part_ids);
    const toAdd = selectedIds.filter((id) => !onPicked.has(id));
    const isAllOnList = Boolean(pickedList) && toAdd.length === 0;

    const showWall = !isPhone || phoneSide === 'parts';
    const showRail = !isPhone || phoneSide === 'lists';

    const wall = requestingList ? (
        <ListRequestForm list={requestingList} onSubmitted={() => navigate('/client-requests')}
                         onCancel={() => setRequestingListId(null)} onGone={leaveGoneList} />
    ) : (
        <>
            {isLoading && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {!isLoading && !error && shownParts.length === 0 && (
                <PortalMessage kind="empty" message={parts.length > 0
                    ? 'No parts match your search.'
                    : "You don't have any parts with us yet."} />
            )}
            <PartWall parts={shownParts} view={view} selectedIds={selectedIds} onToggle={toggle}
                      onOpen={(part) => windows.openPart(toWindow(part))} openNumbers={openNumbers}
                      focusedKey={windows.focusedKey} notes={notes.parts} onNoteAdded={loadNotes} />
        </>
    );

    return (
        <PortalLayout title="Parts" wide titleAside={(
            <>
                <span className="portal-parts-count">{parts.length}</span>
                {isPhone && (
                    <Switch label="Show" value={phoneSide} onChange={setPhoneSide}
                            options={[['parts', 'Parts'], ['lists', 'Lists']]} />
                )}
            </>
        )}>
            <div className="portal-parts-toolbar portal-search-row">
                <input type="text" className="portal-input" aria-label="Search parts"
                       placeholder="Search part number, description, material or job" value={search}
                       onChange={(e) => setSearch(e.target.value)} />
                <select className="portal-input" aria-label="Material" value={material}
                        onChange={(e) => setMaterial(e.target.value)}>
                    <option value={ALL_MATERIALS}>All materials</option>
                    {materials.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button type="button" className={QUIET_BUTTON} aria-pressed={isOnJobOnly}
                        onClick={() => setIsOnJobOnly(!isOnJobOnly)}>{`On a job now \u00b7 ${onJobCount}`}</button>
                {!isPhone && (
                    <Switch label="View" value={view} onChange={setView}
                            options={[['drawings', 'Drawings'], ['table', 'Table']]} />
                )}
            </div>
            {listError && <PortalMessage kind={listError.kind === 'invalid' ? 'error' : listError.kind}
                                         message={listError.message} />}
            {selectedIds.length > 0 && (
                <div className="portal-parts-selection">
                    <span>{`${plural(selectedIds.length, 'part')} selected`}</span>
                    <select className="portal-input" aria-label="List" value={pickedListId ?? ''}
                            onChange={(e) => setPickedListId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Add to list</option>
                        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    {pickedList && !isAllOnList && (
                        <button type="button" className="portal-button" disabled={isBusy}
                                onClick={() => changeMembers(addPartsToList, toAdd)}>Add to list</button>
                    )}
                    {isAllOnList && (
                        <button type="button" className="portal-button" disabled={isBusy}
                                onClick={() => changeMembers(removePartsFromList, selectedIds)}>Remove from list</button>
                    )}
                    <button type="button" className={QUIET_BUTTON} onClick={() => setSelectedIds([])}>Clear</button>
                </div>
            )}
            <div className="portal-parts-split">
                {showWall && <div className="portal-parts-main">{wall}</div>}
                {showRail && (
                    <PartListsPanel
                        lists={lists} parts={parts} openNumbers={openNumbers} focusedKey={windows.focusedKey}
                        onOpenPart={(part) => windows.openPart(toWindow(part))} isBusy={isBusy}
                        onCreate={(name) => reloadAfter(() => createList(name))}
                        onRename={(id, name) => reloadAfter(() => renameList(id, name))}
                        onDelete={onDelete} onRequest={startRequest}
                    />
                )}
            </div>
            <DrawingWindows railed windows={windows.open} focusedKey={windows.focusedKey}
                            onFocus={windows.focus} onClose={windows.close} onCloseAll={windows.closeAll} />
        </PortalLayout>
    );
};

export default ClientPartsPage;
