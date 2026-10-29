import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../AdminLayout/AdminLayout';
import ReviewGrid from './ReviewGrid';
import RequestInboxRail from '../QuoteRequests/RequestInboxRail';
import PriceSheet from '../QuoteRequests/PriceSheet';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';
import {
    getReview, saveReview, checkMatches, createJob, removeLine, fetchRequestFileUrl, requestStatusLabel,
} from '../../api/quoteRequestsAdminApi';

const MIN_QUANTITY = 1;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-US') : '—');

const toPayload = (line) => ({
    id: line.id,
    part_number: line.part_number,
    description: line.description,
    rev: line.rev,
    material: line.material,
    finish: line.finish,
    quantity: line.quantity,
    price: line.price,
});

const ID_DIGITS = 4;

const isPriceEmpty = (line) => line.price === null || line.price === undefined || String(line.price).trim() === '';

const lineProblem = (line) => {
    if (!String(line.part_number ?? '').trim()) return 'Part number is required.';
    if (!(Number(line.quantity) >= MIN_QUANTITY)) return 'Quantity must be at least 1.';
    if (isPriceEmpty(line)) return 'Price is required.';
    return null;
};

const QuoteRequestReview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [review, setReview] = useState(null);
    const [lines, setLines] = useState([]);
    const [matches, setMatches] = useState({});
    const [lineErrors, setLineErrors] = useState({});
    const [error, setError] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [isBusy, setIsBusy] = useState(false);

    const [previews, setPreviews] = useState({});
    const requestedRef = useRef(new Set());
    const urlsRef = useRef(new Set());

    const applyReview = (data) => {
        setReview(data);
        setLines(data.lines);
    };

    useEffect(() => {
        let isCurrent = true;
        getReview(id).then((result) => {
            if (!isCurrent) return;
            if (result.ok) applyReview(result.data);
            else setError(result.error.message);
        });
        return () => { isCurrent = false; };
    }, [id]);

    useEffect(() => {
        const urls = urlsRef.current;
        return () => urls.forEach((url) => URL.revokeObjectURL(url));
    }, []);

    const handleNeedPreview = useCallback(async (kind, file) => {
        const key = `${kind}:${file.id}`;
        if (requestedRef.current.has(key)) return;
        requestedRef.current.add(key);
        const result = kind === 'line' ? await fetchRequestFileUrl(id, file.id) : await fetchAdminDrawingUrl(file);
        if (result.ok) urlsRef.current.add(result.url);
        setPreviews((current) => ({ ...current, [key]: result.ok ? result.url : null }));
    }, [id]);

    const handleOpenPreview = (url) => {
        const tab = window.open(url, '_blank');
        if (tab) tab.focus();
    };

    const run = async (action) => {
        setIsBusy(true);
        setError('');
        setIsSaved(false);
        try {
            await action();
        } finally {
            setIsBusy(false);
        }
    };

    // Resolves true when the lines were saved.
    const save = async () => {
        const result = await saveReview(id, lines.map(toPayload));
        if (!result.ok) {
            setError(result.error.message);
            return false;
        }
        applyReview(result.data);
        setIsSaved(true);
        return true;
    };

    const handleCheck = () => run(async () => {
        const result = await checkMatches(
            id,
            lines.map((line) => ({ id: line.id, part_number: line.part_number })),
        );
        if (!result.ok) return setError(result.error.message);
        setMatches(Object.fromEntries(result.data.map((entry) => [entry.line_id, entry.matches])));
    });

    const handlePrice = (lineId, price) => {
        setIsSaved(false);
        setLines((current) => current.map((line) => (line.id === lineId ? { ...line, price } : line)));
    };

    const handleFill = (filled) => run(async () => {
        setLines((current) => current.map((line) => (line.id === filled.id ? filled : line)));
        const result = await checkMatches(id, [{ id: filled.id, part_number: filled.part_number }]);
        if (!result.ok) return setError(result.error.message);
        setMatches((current) => ({ ...current, [filled.id]: result.data[0].matches }));
    });

    const handleCreateJob = () => run(async () => {
        const problems = {};
        lines.forEach((line) => {
            const problem = lineProblem(line);
            if (problem) problems[line.id] = problem;
        });
        setLineErrors(problems);
        if (Object.keys(problems).length) return;
        if (!(await save())) return;
        setIsSaved(false);
        const result = await createJob(id);
        if (!result.ok) return setError(result.error.message);
        navigate(`/job/${result.data.id}`);
    });

    const openFile = (file) => run(async () => {
        const result = await fetchRequestFileUrl(id, file.id);
        if (!result.ok) return setError(result.error.message);
        window.open(result.url);
    });

    const openPartFile = (file) => run(async () => {
        const result = await fetchAdminDrawingUrl(file);
        if (!result.ok) return setError(result.error.message);
        window.open(result.url);
    });

    const handleRemoveLine = (lineId) => run(async () => {
        if (!window.confirm('Remove this line from the request?')) return;
        const result = await removeLine(id, lineId);
        if (!result.ok) return setError(result.error.message);
        setReview(result.data);
        setLines((current) => current.filter((line) => line.id !== lineId));
        setMatches(({ [lineId]: _removed, ...rest }) => rest);
        setLineErrors(({ [lineId]: _removed, ...rest }) => rest);
    });

    if (!review) {
        return (
            <AdminLayout current="quote-requests" crumb="Quote requests">
                <div className='requests'>{error || 'Loading quote request...'}</div>
            </AdminLayout>
        );
    }

    const isReadOnly = review.status === 'job_created';

    return (
        <AdminLayout current="quote-requests" crumb={`Quote requests › #${review.id}`}>
            <div className='request-inbox-wrap'>
                <RequestInboxRail currentId={review.id} />
                <div className='requests'>
                    <div className='request-review-body'>
                        <div className='request-review-head'>
                            <span className='id'>REQ-{String(review.id).padStart(ID_DIGITS, '0')}</span>
                            <b>{review.company_name ?? review.company_id}</b>
                            <div>{review.name || `Request #${review.id}`} · {review.client_name}</div>
                            <div className='facts'>
                                <div><small>Status</small>{requestStatusLabel(review.status)}</div>
                                <div><small>Submitted</small>{formatDate(review.submitted_at)}</div>
                                <div><small>Need by</small>{formatDate(review.need_by)}</div>
                                <div><small>Lines</small>{lines.length} lines</div>
                                <div><small>Client note</small>{review.note}</div>
                            </div>
                            {isReadOnly && <Link to={`/job/${review.job_id}`}>View job</Link>}
                            {review.files.length > 0 && (
                                <div className='review-files'>
                                    {review.files.map((file) => (
                                        <button type='button' key={file.id} disabled={isBusy} onClick={() => openFile(file)}>
                                            {file.filename}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <PriceSheet lines={lines} matches={matches} onPrice={handlePrice} disabled={isBusy || isReadOnly} />
                    </div>
                <ReviewGrid
                    lines={lines}
                    onChange={setLines}
                    matches={matches}
                    errors={lineErrors}
                    previews={previews}
                    onNeedPreview={handleNeedPreview}
                    onOpenPreview={handleOpenPreview}
                    onOpenFile={openFile}
                    onOpenPartFile={openPartFile}
                    onRemoveLine={handleRemoveLine}
                    onFillLine={handleFill}
                    readOnly={isReadOnly}
                />
                {error && <div className='review-error'>{error}</div>}
                {isSaved && <div>Saved</div>}
                {!isReadOnly && (
                    <div>
                        <button type='button' disabled={isBusy} onClick={() => run(save)}>Save</button>
                        <button type='button' disabled={isBusy} onClick={handleCheck}>Check</button>
                        <button type='button' disabled={isBusy || lines.some(isPriceEmpty)} onClick={handleCreateJob}>Create job</button>
                    </div>
                )}
                </div>
            </div>
        </AdminLayout>
    );
};

export default QuoteRequestReview;
