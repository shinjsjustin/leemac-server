import React, { useState } from 'react';

export default function OverviewRail({
  lists, selectedListId, onSelectList, onCreate, isBusy,
}) {
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    if (await onCreate(name.trim())) {
      setName('');
      setIsNaming(false);
    }
  };

  return (
    <div className="portal-overview-rail">
      <h2>Lists</h2>
      {lists.map((list) => (
        <button
          key={list.id}
          type="button"
          className="portal-overview-list"
          aria-pressed={list.id === selectedListId}
          onClick={() => onSelectList(list.id === selectedListId ? null : list.id)}
        >
          <b>{list.name}</b>
          <small>{`${list.part_ids.length} parts`}</small>
        </button>
      ))}
      {isNaming ? (
        <div className="portal-overview-newlist">
          <input type="text" className="portal-input" aria-label="New list name" value={name}
            onChange={(e) => setName(e.target.value)} />
          <button type="button" className="portal-button" disabled={isBusy} onClick={create}>Create</button>
        </div>
      ) : (
        <button type="button" className="portal-button" onClick={() => setIsNaming(true)}>+ New list</button>
      )}
    </div>
  );
}
