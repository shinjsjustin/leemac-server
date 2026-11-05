import React, { useState } from 'react';
import { shareLink } from './partListShare';

const ListSharePanel = ({ sharing, error, canManage, onToggle, onRemoveMember }) => {
    const [confirmingId, setConfirmingId] = useState(null);
    const [copyNote, setCopyNote] = useState('');

    const link = sharing ? shareLink(window.location.origin, sharing.token) : null;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopyNote('Copied');
        } catch (e) {
            setCopyNote('Copy failed. Select the link and copy it by hand.');
        }
    };

    const remove = async (companyId) => {
        await onRemoveMember(companyId);
        setConfirmingId(null);
    };

    if (error) return <p role='alert' className='part-lists-error'>{error}</p>;
    if (!sharing) return null;

    return (
        <div className='part-lists-share'>
            <label className='part-lists-share-switch'>
                <input
                    type='checkbox'
                    role='switch'
                    checked={sharing.enabled}
                    disabled={!canManage}
                    onChange={(e) => onToggle(e.target.checked)}
                />
                Share link
            </label>
            {link && (
                <div className='part-lists-share-link'>
                    <input className='search-input' readOnly value={link} aria-label='Share link' />
                    <button type='button' className='search-button' onClick={copy}>Copy</button>
                    {copyNote && <small>{copyNote}</small>}
                </div>
            )}
            {!sharing.enabled && sharing.members.length > 0 && (
                <small>Link is off. Members keep their access to this list.</small>
            )}
            {sharing.members.length > 0 && (
                <ul className='part-lists-share-members'>
                    {sharing.members.map((member) => (
                        <li key={member.company_id}>
                            <span>{member.company_name}</span>
                            <small>{`Joined ${new Date(member.joined_at).toLocaleDateString()}`}</small>
                            {canManage && (confirmingId === member.company_id ? (
                                <button type='button' className='search-button' onClick={() => remove(member.company_id)}>
                                    Confirm
                                </button>
                            ) : (
                                <button type='button' className='search-button' onClick={() => setConfirmingId(member.company_id)}>
                                    Remove
                                </button>
                            ))}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ListSharePanel;
