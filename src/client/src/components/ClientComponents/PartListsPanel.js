import React, { useState } from 'react';

function ListCard({ list, isSelected, isBusy, onSelect, onRename, onDelete, onRequest }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [draft, setDraft] = useState(list.name);

  const save = async () => {
    if (await onRename(list.id, draft.trim())) setIsEditing(false);
  };
  const remove = async () => {
    if (await onDelete(list.id)) setIsConfirming(false);
  };
  const startEdit = () => {
    setDraft(list.name);
    setIsEditing(true);
  };

  return (
    <div className="portal-list-card">
      <div className="portal-list-main">
        {isEditing ? (
          <input className="portal-input" type="text" aria-label="List name" value={draft}
            onChange={(e) => setDraft(e.target.value)} />
        ) : (
          <button type="button" className="portal-list-name" aria-pressed={isSelected}
            onClick={() => onSelect(list.id)}>{list.name}</button>
        )}
        <div className="portal-list-meta">Created by {list.created_by_name}</div>
        <div className="portal-list-meta">Edited by {list.updated_by_name}</div>
        {isConfirming && (
          <div className="portal-request-warning" role="alert">
            Delete this list? The parts stay in your portal.
          </div>
        )}
      </div>
      <div className="portal-list-actions">
        {onRequest && (
          <button type="button" className="portal-button portal-button--quiet" disabled={isBusy}
            onClick={() => onRequest(list.id)}>Request</button>
        )}
        {isConfirming ? (
          <>
            <button type="button" className="portal-button portal-button--quiet" disabled={isBusy}
              onClick={remove}>Delete list</button>
            <button type="button" className="portal-button portal-button--quiet"
              onClick={() => setIsConfirming(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="portal-button portal-button--quiet" disabled={isBusy}
            onClick={() => setIsConfirming(true)}>Delete</button>
        )}
        <button type="button" className="portal-button portal-button--quiet" disabled={isBusy}
          onClick={isEditing ? save : startEdit}>{isEditing ? 'Save' : 'Edit'}</button>
      </div>
    </div>
  );
}

export default function PartListsPanel({
  lists, selectedId, onSelect, onCreate, onRename, onDelete, onRequest, isBusy,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const create = async () => {
    if (await onCreate(trimmed)) setName('');
  };

  return (
    <aside className={`portal-lists${isOpen ? '' : ' portal-lists--collapsed'}`}>
      <button type="button" className="portal-lists-toggle portal-button portal-button--quiet"
        aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>Lists ({lists.length})</button>
      <div className="portal-search-row">
        <input className="portal-input" type="text" aria-label="New list name" placeholder="List name" value={name}
          onChange={(e) => setName(e.target.value)} />
        <button type="button" className="portal-button" disabled={!trimmed || isBusy}
          onClick={create}>Add list</button>
      </div>
      {lists.map((list) => (
        <ListCard key={list.id} list={list} isSelected={list.id === selectedId} isBusy={isBusy}
          onSelect={onSelect} onRename={onRename} onDelete={onDelete} onRequest={onRequest} />
      ))}
    </aside>
  );
}
