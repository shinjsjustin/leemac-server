import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import ListRequestForm from './ListRequestForm';
import { addableParts, removableParts } from './sharedListActions';
import { listParts } from '../../api/portalApi';
import {
    getSharedList, renameSharedList, addPartsToSharedList, removePartsFromSharedList,
    leaveSharedList, getSharedRequestLines, requestFromSharedList,
} from '../../api/portalListsApi';

const QUIET_BUTTON = 'portal-button portal-button--quiet';
const SHARED_API = { getRequestLines: getSharedRequestLines, requestFromList: requestFromSharedList };

const ClientSharedList = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [list, setList] = useState(null);
    const [portalParts, setPortalParts] = useState([]);
    const [status, setStatus] = useState('loading');
    const [writeError, setWriteError] = useState('');
    const [name, setName] = useState('');
    const [pickedId, setPickedId] = useState('');
    const [isLeaving, setIsLeaving] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        const result = await getSharedList(id);
        if (result.ok) {
            setList(result.data);
            setName(result.data.name);
            setStatus('ready');
        } else {
            setStatus(result.error.kind === 'not_found' ? 'not_found' : 'error');
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        listParts().then((result) => { if (result.ok) setPortalParts(result.data); });
    }, []);

    // Runs a write, then refreshes the list so the page shows what the server holds.
    const write = async (run) => {
        setIsBusy(true);
        setWriteError('');
        const result = await run();
        setIsBusy(false);
        if (!result.ok) {
            if (result.error.kind === 'not_found') setStatus('not_found');
            else setWriteError(result.error.message);
            return false;
        }
        await load();
        return true;
    };

    const leave = async () => {
        setIsBusy(true);
        const result = await leaveSharedList(id);
        setIsBusy(false);
        if (result.ok || result.error.kind === 'not_found') navigate('/client-parts');
        else setWriteError(result.error.message);
    };

    const addPicked = async () => {
        const added = await write(() => addPartsToSharedList(id, [Number(pickedId)]));
        if (added) setPickedId('');
    };

    let body;
    if (status === 'loading') body = <PortalMessage kind="loading" />;
    else if (status === 'error') body = <PortalMessage kind="error" />;
    else if (status === 'not_found') {
        body = <PortalMessage kind="not_found" heading="We couldn't find that list"
                              message="It may have been removed, or you may have left it." />;
    } else if (isRequesting) {
        body = (
            <ListRequestForm list={list} api={SHARED_API}
                             onSubmitted={() => navigate('/client-requests')}
                             onCancel={() => setIsRequesting(false)}
                             onGone={() => { setIsRequesting(false); setStatus('not_found'); }} />
        );
    } else {
        const removable = new Set(removableParts(list).map((part) => part.part_id));
        const addable = addableParts(portalParts, list);
        body = (
            <>
                <form onSubmit={(e) => { e.preventDefault(); write(() => renameSharedList(id, name)); }}>
                    <input className="portal-input" aria-label="List name" value={name}
                           onChange={(e) => setName(e.target.value)} />
                    <button type="submit" className={QUIET_BUTTON} disabled={isBusy || !name.trim()}>Rename</button>
                </form>
                {writeError && <p className="portal-error" role="alert">{writeError}</p>}
                <ul>
                    {list.parts.map((part) => (
                        <li key={part.part_id}>
                            {part.part_number} {part.part_description}
                            {part.files.map((file) => (
                                <a key={file.id} href={file.url} target="_blank" rel="noreferrer"> {file.filename}</a>
                            ))}
                            {removable.has(part.part_id) && (
                                <button type="button" className={QUIET_BUTTON} disabled={isBusy}
                                        onClick={() => write(() => removePartsFromSharedList(id, [part.part_id]))}>
                                    {`Remove ${part.part_number}`}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
                {addable.length > 0 && (
                    <div>
                        <select className="portal-input" aria-label="Add a part" value={pickedId}
                                onChange={(e) => setPickedId(e.target.value)}>
                            <option value="">Add a part</option>
                            {addable.map((part) => (
                                <option key={part.part_id} value={part.part_id}>{part.part_number}</option>
                            ))}
                        </select>
                        <button type="button" className={QUIET_BUTTON} disabled={isBusy || !pickedId}
                                onClick={addPicked}>Add</button>
                    </div>
                )}
                <button type="button" className="portal-button" onClick={() => setIsRequesting(true)}>Request a quote</button>
                {isLeaving ? (
                    <div role="alert">
                        <span>Leave this list? You will need a new link to rejoin.</span>
                        <button type="button" className="portal-button" disabled={isBusy} onClick={leave}>Yes, leave</button>
                        <button type="button" className={QUIET_BUTTON} onClick={() => setIsLeaving(false)}>Stay</button>
                    </div>
                ) : (
                    <button type="button" className={QUIET_BUTTON} onClick={() => setIsLeaving(true)}>Leave list</button>
                )}
            </>
        );
    }

    return (
        <PortalLayout title={list ? list.name : 'Shared list'}>
            <Link to="/client-parts">Back to parts</Link>
            {body}
        </PortalLayout>
    );
};

export default ClientSharedList;
