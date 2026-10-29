import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PortalField from './PortalField';
import RequestGrid, { emptyRow, emptyRows, isRowEmpty } from './RequestGrid';
import {
  getRequest, createRequest, saveRequest, submitRequest,
  uploadLineFiles, removeRequestFile, requestStatusLabel, listRequests,
} from '../../api/portalRequestsApi';
import { listLists } from '../../api/portalListsApi';
import RequestRail from './RequestRail';

const DEFAULT_TITLE = 'Quick New Parts List';
const MIN_ROWS = 10;
const NEED_BY_LENGTH = 10;
const LINE_FIELDS = ['part_number', 'description', 'rev', 'material', 'finish'];
const TEXT_AND_QUANTITY = [...LINE_FIELDS, 'quantity'];
const REQUEST_FILES_KEY = 'request';
const ACCEPT = '.pdf,.step,.stp,.igs,.iges,.dxf,.dwg,.x_t,.sldprt,.png,.jpg,.jpeg';
const SUBMIT_ERROR = 'Each row needs a quantity of at least 1.';

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const isSubmittable = (row) =>
  Number.isInteger(Number(row.quantity)) && Number(row.quantity) >= 1;

const toRow = (line) => ({
  ...emptyRow(),
  id: line.id,
  ...Object.fromEntries(LINE_FIELDS.map((name) => [name, line[name] ?? ''])),
  quantity: line.quantity ?? '',
  files: line.files,
  part_files: line.part_files ?? [],
  source_part_id: line.source_part_id ?? null,
});

const toRows = (request) => {
  const rows = request.lines.map(toRow);
  if (request.status !== 'draft') return rows;
  return [...rows, ...emptyRows(Math.max(0, MIN_ROWS - rows.length))];
};

const toLineBody = (row) => ({
  id: row.id,
  ...Object.fromEntries(TEXT_AND_QUANTITY.map((name) => [name, row[name]])),
  has_files: row.files.length > 0 || row.pending.length > 0,
});

const extOf = (name) => (name.lastIndexOf('.') < 0 ? '' : name.slice(name.lastIndexOf('.')).toLowerCase());
const baseOf = (name) => (name.lastIndexOf('.') < 0 ? name : name.slice(0, name.lastIndexOf('.'))).toLowerCase();
const isPdf = (name) => extOf(name) === '.pdf';
const isStep = (name) => ['.step', '.stp'].includes(extOf(name));
const rowFileNames = (row) => [...row.files.map((f) => f.filename), ...row.pending.map((f) => f.name)];
const hasBothFiles = (row) => {
  const names = rowFileNames(row);
  return names.filter(isPdf).length === 1 && names.filter(isStep).length === 1;
};

// A PDF and a STEP with the same base name share a group; any other file stands alone.
const groupDropped = (files) => {
  const groups = [];
  files.forEach((file) => {
    const kind = isPdf(file.name) ? isPdf : isStep(file.name) ? isStep : null;
    const mate = kind && groups.find((g) =>
      g.base === baseOf(file.name) && !g.files.some((f) => kind(f.name)) && g.files.every((f) => isPdf(f.name) || isStep(f.name)));
    if (mate) mate.files.push(file);
    else groups.push({ base: kind ? baseOf(file.name) : null, files: [file] });
  });
  return groups.map((g) => g.files);
};

const rowsWithDropped = (rows, files) => {
  const queue = groupDropped(files);
  const filled = rows.map((row) => (isRowEmpty(row) && queue.length > 0 ? { ...row, pending: queue.shift() } : row));
  return [...filled, ...queue.map((pending) => ({ ...emptyRow(), pending }))];
};

const fileIdsByOwner = (request) =>
  new Map([
    ...request.lines.map((line) => [line.id, line.files.map((f) => f.id)]),
    [REQUEST_FILES_KEY, (request.files ?? []).map((f) => f.id)],
  ]);

const LoadFailure = ({ error }) => (
  <PortalMessage
    kind={error.kind === 'invalid' ? 'error' : error.kind}
    heading={error.kind === 'invalid' ? 'Please check your request' : undefined}
    message={error.message}
  />
);

const ClientRequestPage = () => {
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const [request, setRequest] = useState(null);
  const [name, setName] = useState('');
  const [needBy, setNeedBy] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState(() => emptyRows(MIN_ROWS));
  const [rowErrors, setRowErrors] = useState({});
  const [requestFiles, setRequestFiles] = useState([]);
  const [rail, setRail] = useState(null);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(paramId));
  const [isBusy, setIsBusy] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const requestId = useRef(paramId);
  const savedFileIds = useRef(new Map());

  const applyRequest = (loaded) => {
    setRequest(loaded);
    setName(loaded.name ?? '');
    setNeedBy((loaded.need_by ?? '').slice(0, NEED_BY_LENGTH));
    setNote(loaded.note ?? '');
    setRows(toRows(loaded));
    setRequestFiles(loaded.files ?? []);
    savedFileIds.current = fileIdsByOwner(loaded);
  };

  useEffect(() => {
    requestId.current = paramId;
    if (!paramId) return undefined;
    let isCurrent = true;
    setIsLoading(true);
    setLoadError(null);
    getRequest(paramId).then((result) => {
      if (!isCurrent) return;
      setIsLoading(false);
      if (result.ok) applyRequest(result.data);
      else setLoadError(result.error);
    });
    return () => { isCurrent = false; };
  }, [paramId]);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([listRequests(), listLists()]).then(([requests, lists]) => {
      if (!isCurrent || !requests.ok) return;
      setRail({ requests: requests.data, lists: lists.ok ? lists.data : [] });
    });
    return () => { isCurrent = false; };
  }, []);

  const fail = (apiError) => {
    setError(apiError);
    return false;
  };

  // Returns true once the draft, its new files and its removed files are all stored.
  const persist = async () => {
    const sent = rows.filter((row) => !isRowEmpty(row));
    const body = { name, need_by: needBy, note, lines: sent.map(toLineBody) };

    let saved;
    if (requestId.current) {
      saved = await saveRequest(requestId.current, body);
      if (!saved.ok) return fail(saved.error);
      saved = saved.data;
    } else {
      const created = await createRequest(body);
      if (!created.ok) return fail(created.error);
      requestId.current = created.data.id;
      const loaded = await getRequest(requestId.current);
      if (!loaded.ok) return fail(loaded.error);
      saved = loaded.data;
    }

    const stored = sent.map((row, i) => ({ ...row, id: saved.lines[i].id }));
    const removedFrom = (owner, files) => {
      const kept = new Set(files.map((f) => f.id));
      return (savedFileIds.current.get(owner) ?? [])
        .filter((fileId) => !kept.has(fileId))
        .map((fileId) => ({ owner, fileId }));
    };
    const removals = [
      ...sent.filter((row) => row.id !== null).flatMap((row) => removedFrom(row.id, row.files)),
      ...removedFrom(REQUEST_FILES_KEY, requestFiles),
    ];
    // Keep ids and unsent files on screen so a retry doesn't create duplicates.
    setRows(stored.concat(rows.filter((row) => isRowEmpty(row))));

    for (const { owner, fileId } of removals) {
      const removed = await removeRequestFile(requestId.current, fileId);
      // A file that is already gone is the outcome the user asked for.
      if (!removed.ok && removed.error.kind !== 'not_found') return fail(removed.error);
      savedFileIds.current.set(owner, savedFileIds.current.get(owner).filter((id) => id !== fileId));
    }
    const uploads = stored.filter((row) => row.pending.length > 0);
    for (const row of uploads) {
      const uploaded = await uploadLineFiles(requestId.current, row.id, row.pending);
      if (!uploaded.ok) return fail(uploaded.error);
      setRows((current) => current.map((r) => (r.key === row.key ? { ...r, pending: [] } : r)));
    }

    if (removals.length === 0 && uploads.length === 0) {
      applyRequest(saved);
      return true;
    }
    const reloaded = await getRequest(requestId.current);
    if (!reloaded.ok) return fail(reloaded.error);
    applyRequest(reloaded.data);
    return true;
  };

  const validate = (isSubmit) => {
    const errors = {};
    rows.filter((row) => !isRowEmpty(row)).forEach((row) => {
      if (isSubmit && !isSubmittable(row)) errors[row.key] = SUBMIT_ERROR;
    });
    setRowErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const run = async (isSubmit) => {
    setError(null);
    setIsSaved(false);
    if (!validate(isSubmit)) return;
    setIsBusy(true);
    const isNew = !requestId.current;
    const isStored = await persist();
    if (isStored && isSubmit) {
      const submitted = await submitRequest(requestId.current);
      if (submitted.ok) navigate('/client-requests');
      else fail(submitted.error);
    } else if (isStored && isNew) {
      navigate(`/client-request/${requestId.current}`);
    } else if (isStored) {
      setIsSaved(true);
    }
    setIsBusy(false);
  };

  const back = <Link className="portal-back-link" to="/client-requests">Back to your requests</Link>;

  if (isLoading) return <PortalLayout title={DEFAULT_TITLE} back={back} wide><PortalMessage kind="loading" /></PortalLayout>;
  if (loadError) return <PortalLayout title={DEFAULT_TITLE} back={back} wide><LoadFailure error={loadError} /></PortalLayout>;

  const isReadOnly = Boolean(request) && request.status !== 'draft';

  const filledRows = rows.filter((row) => !isRowEmpty(row));
  const quantityCount = filledRows.filter((row) => !isBlank(row.quantity)).length;
  const missingCount = filledRows.filter((row) => !hasBothFiles(row)).length;
  const addDropped = (fileList) => setRows((current) => rowsWithDropped(current, Array.from(fileList)));

  const statusTag = (
    <span className="portal-req-tag">{request ? requestStatusLabel(request.status) : 'Draft'}</span>
  );
  const draftTitle = (
    <input id="request-name" className="portal-request-title" type="text" aria-label="List title"
           placeholder="Untitled List" value={name} onChange={(e) => setName(e.target.value)} />
  );
  const draftHeader = (
    <div className="portal-request-header">
      {statusTag}
      <label className="portal-request-header-field" htmlFor="request-need-by">Need by
        <input id="request-need-by" className="portal-input" type="date" value={needBy}
               onChange={(e) => setNeedBy(e.target.value)} />
      </label>
      <label className="portal-request-header-field" htmlFor="request-note">Note
        <input id="request-note" className="portal-input" type="text" value={note}
               onChange={(e) => setNote(e.target.value)} />
      </label>
    </div>
  );
  const readOnlyHeader = isReadOnly && (
    <div className="portal-request-header">
      {statusTag}
      <PortalField label="Need by" value={needBy} />
      <PortalField label="Note" value={note} />
    </div>
  );

  return (
    <PortalLayout title={isReadOnly ? request.name || 'Untitled List' : draftTitle}
                  titleAside={isReadOnly ? readOnlyHeader : draftHeader} back={back} wide>
      <div className="portal-req-page portal-req-page--request">
        {rail && <RequestRail requests={rail.requests} lists={rail.lists} currentId={request?.id} />}
        <div className="portal-req-main">
          {error && <LoadFailure error={error} />}
          {!isReadOnly && (
            <label className="portal-req-drop" onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => { e.preventDefault(); addDropped(e.dataTransfer.files); }}>
              Drop drawings here. A PDF and a STEP with the same name become one line.
              <span className="portal-button portal-button--quiet">Browse files</span>
              <input hidden type="file" multiple accept={ACCEPT} value=""
                     onChange={(e) => addDropped(e.target.files)} />
            </label>
          )}
          {requestFiles.length > 0 && (
            <ul className="portal-request-files">
              {requestFiles.map((f) => (
                <li key={f.id}>
                  {f.filename}
                  {!isReadOnly && (
                    <button type="button" className="portal-button portal-button--quiet portal-request-file-remove"
                            aria-label={`Remove ${f.filename}`}
                            onClick={() => setRequestFiles((current) => current.filter((x) => x.id !== f.id))}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <RequestGrid requestId={request?.id} rows={rows} onChange={setRows} errors={rowErrors} readOnly={isReadOnly} />
          {!isReadOnly && (
            <div className="portal-req-footer">
              <span>{filledRows.length} lines</span>
              <span>{quantityCount} with quantity</span>
              <span>{missingCount} missing files</span>
              {isSaved && <span role="status">Saved</span>}
              <button type="button" className="portal-button portal-button--quiet" disabled={isBusy}
                      onClick={() => run(false)}>Save draft</button>
              <button type="button" className="portal-button" disabled={isBusy}
                      onClick={() => run(true)}>Submit request {'\u00b7'} {quantityCount} lines</button>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
};

export default ClientRequestPage;
