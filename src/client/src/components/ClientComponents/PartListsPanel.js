import React, { useState } from 'react';

function PartRow({ part, number, isFocused, onOpenPart }) {
  const className = `portal-rail-row${isFocused ? ' portal-rail-row--focused' : ''}`;
  return (
    <button type="button" className={className} onClick={() => onOpenPart(part)}>
      {number && <span className="portal-rail-num">{number}</span>}
      <b className="portal-rail-part">{part.part_number}</b>
      <span className="portal-rail-desc">{part.part_description}</span>
    </button>
  );
}

function ListGroup({ list, rows, isBusy, onRename, onDelete, onRequest, renderRow }) {
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
    <section className="portal-rail-list">
      <div className="portal-rail-head">
        {isEditing ? (
          <input className="portal-input" type="text" aria-label="List name" value={draft}
            onChange={(e) => setDraft(e.target.value)} />
        ) : (
          <b className="portal-rail-name">{list.name}</b>
        )}
        <span className="portal-rail-count">{rows.length}</span>
      </div>
      <div className="portal-rail-actions">
        <button type="button" className="portal-button portal-button--quiet" disabled={isBusy}
          onClick={isEditing ? save : startEdit}>{isEditing ? 'Save' : 'Edit'}</button>
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
      </div>
      {isConfirming && (
        <div className="portal-request-warning" role="alert">
          Delete this list? The parts stay in your portal.
        </div>
      )}
      {rows.map(renderRow)}
    </section>
  );
}

export default function PartListsPanel({
  lists, parts, openNumbers, focusedKey, onOpenPart, onCreate, onRename, onDelete, onRequest, isBusy,
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const create = async () => {
    if (await onCreate(trimmed)) setName('');
  };
  const renderRow = (part) => (
    <PartRow key={part.part_id} part={part} number={openNumbers[part.part_id]}
      isFocused={focusedKey === part.part_id} onOpenPart={onOpenPart} />
  );
  const partsById = new Map(parts.map((part) => [part.part_id, part]));
  const listedIds = new Set(lists.flatMap((list) => list.part_ids));
  const unlisted = parts.filter((part) => !listedIds.has(part.part_id));

  return (
    <aside className="portal-rail">
      {lists.map((list) => (
        <ListGroup key={list.id} list={list} isBusy={isBusy} onRename={onRename} onDelete={onDelete}
          onRequest={onRequest} renderRow={renderRow}
          rows={list.part_ids.map((id) => partsById.get(id)).filter(Boolean)} />
      ))}
      <section className="portal-rail-unlisted">
        <div className="portal-rail-head"><b className="portal-rail-name">Not on a list</b></div>
        {unlisted.map(renderRow)}
      </section>
      <div className="portal-rail-new">
        <input className="portal-input" type="text" aria-label="New list name" placeholder="List name"
          value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="portal-button" disabled={!trimmed || isBusy}
          onClick={create}>New list</button>
      </div>
    </aside>
  );
}
