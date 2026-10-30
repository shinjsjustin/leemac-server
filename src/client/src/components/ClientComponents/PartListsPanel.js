import React, { useState } from 'react';

function PartRow({ part, onOpenPart }) {
  return (
    <button type="button" className="portal-rail-row" onClick={() => onOpenPart(part)}>
      <b className="portal-rail-part">{part.part_number}</b>
      <span className="portal-rail-desc">{part.part_description}</span>
      {part.latest?.job_number && <span className="portal-rail-job">{part.latest.job_number}</span>}
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
        <span className="portal-rail-count">{`\u00b7 ${rows.length}`}</span>
        <button type="button" className="portal-link" disabled={isBusy}
          onClick={isEditing ? save : startEdit}>{isEditing ? 'Save' : 'Edit'}</button>
        {onRequest && (
          <button type="button" className="portal-button portal-button--small portal-rail-request"
            disabled={isBusy} onClick={() => onRequest(list.id)}>Request</button>
        )}
      </div>
      {isEditing && (
        <div className="portal-rail-actions">
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
      )}
      {isEditing && isConfirming && (
        <div className="portal-request-warning" role="alert">
          Delete this list? The parts stay in your portal.
        </div>
      )}
      {rows.map(renderRow)}
    </section>
  );
}

const matches = (part, needle) => (
  `${part.part_number} ${part.part_description ?? ''} ${part.latest?.job_number ?? ''}`
    .toLowerCase().includes(needle));

export default function PartListsPanel({
  lists, parts, onOpenPart, onCreate, onRename, onDelete, onRequest, isBusy, tabs,
}) {
  const [name, setName] = useState('');
  const [isNaming, setIsNaming] = useState(false);
  const [tab, setTab] = useState('lists');
  const [filter, setFilter] = useState('');
  const trimmed = name.trim();
  const needle = filter.trim().toLowerCase();

  const create = async () => {
    if (!(await onCreate(trimmed))) return;
    setName('');
    setIsNaming(false);
  };
  const renderRow = (part) => (
    <PartRow key={part.part_id} part={part} onOpenPart={onOpenPart} />
  );
  const visible = (rows) => rows.filter((part) => matches(part, needle));
  const partsById = new Map(parts.map((part) => [part.part_id, part]));
  const listedIds = new Set(lists.flatMap((list) => list.part_ids));
  const unlisted = parts.filter((part) => !listedIds.has(part.part_id));
  const showAll = tabs && tab === 'all';

  return (
    <aside className="portal-rail">
      {tabs && (
        <>
          <div className="portal-rail-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!showAll} onClick={() => setTab('lists')}>
              {`Lists ${lists.length}`}
            </button>
            <button type="button" role="tab" aria-selected={showAll} onClick={() => setTab('all')}>
              {`All parts ${parts.length}`}
            </button>
          </div>
          <input className="portal-input" type="text" aria-label="Filter lists and parts"
            placeholder="Filter lists and parts" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </>
      )}
      {showAll ? visible(parts).map(renderRow) : (
        <>
          {lists.map((list) => (
            <ListGroup key={list.id} list={list} isBusy={isBusy} onRename={onRename} onDelete={onDelete}
              onRequest={onRequest} renderRow={renderRow}
              rows={visible(list.part_ids.map((id) => partsById.get(id)).filter(Boolean))} />
          ))}
          <section className="portal-rail-unlisted">
            <div className="portal-rail-head"><b className="portal-rail-name">Not on a list</b></div>
            {visible(unlisted).map(renderRow)}
          </section>
        </>
      )}
      {isNaming ? (
        <div className="portal-rail-new">
          <input className="portal-input" type="text" aria-label="New list name" placeholder="List name"
            value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="portal-button" disabled={!trimmed || isBusy}
            onClick={create}>Create</button>
        </div>
      ) : (
        <button type="button" className="portal-link" disabled={isBusy}
          onClick={() => setIsNaming(true)}>+ New list</button>
      )}
    </aside>
  );
}
