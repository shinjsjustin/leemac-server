import React, { useState } from 'react';
import { useAnchoredMenu } from '../Overview/anchoredMenu';
import { addPartsToList, removePartsFromList } from '../../api/adminPartListsApi';

const PartListsMenu = ({ partId, lists, onListChanged }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState('');
    const [anchor, setAnchor] = useState(null);
    const { menuRef, style } = useAnchoredMenu(isOpen ? anchor : null);

    const toggle = async (list, isChecked) => {
        const save = isChecked ? addPartsToList : removePartsFromList;
        const result = await save(list.id, [partId]);
        if (!result.ok) {
            setError(result.error.message);
            return;
        }
        setError('');
        onListChanged(result.data);
    };

    return (
        <div className='part-lists-menu' onClick={(e) => e.stopPropagation()}>
            <button ref={setAnchor} type='button' className='search-button' onClick={() => setIsOpen(!isOpen)}>Lists</button>
            {isOpen && (
                <div ref={menuRef} style={style} className='part-lists-menu-panel'>
                    {lists.map((list) => (
                        <label key={list.id}>
                            <input
                                type='checkbox'
                                checked={list.part_ids.includes(partId)}
                                onChange={(e) => toggle(list, e.target.checked)}
                            />
                            {list.name}
                        </label>
                    ))}
                    {error && <p role='alert' className='part-lists-error'>{error}</p>}
                </div>
            )}
        </div>
    );
};

export default PartListsMenu;
