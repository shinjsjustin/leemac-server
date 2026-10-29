import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../Navbar';
import ReviewGrid from './ReviewGrid';
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

const lineProblem = (line) => {
    if (!String(line.part_number ?? '').trim()) return 'Part number is required.';
    if (!(Number(line.quantity) >= MIN_QUANTITY)) return 'Quantity must be at least 1.';
    if (line.price === null || line.price === undefined || String(line.price).trim() === '') return 'Price is required.';
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
            <div>
                <Navbar />
                <div className='requests'>{error || 'Loading quote request...'}</div>
            </div>
        );
    }

    const isReadOnly = review.status === 'job_created';

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>{review.name || `Request #${review.id}`}</h2>
                <div>Company: {review.company_name ?? review.company_id}</div>
                <div>Client: {review.client_name}</div>
                <div>Need by: {formatDate(review.need_by)}</div>
                <div>Note: {review.note}</div>
                <div>Status: {requestStatusLabel(review.status)}</div>
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
                <ReviewGrid
                    lines={lines}
                    onChange={setLines}
                    matches={matches}
                    errors={lineErrors}
                    onOpenFile={openFile}
                    onOpenPartFile={openPartFile}
                    onRemoveLine={handleRemoveLine}
                    readOnly={isReadOnly}
                />
                {error && <div className='review-error'>{error}</div>}
                {isSaved && <div>Saved</div>}
                {!isReadOnly && (
                    <div>
                        <button type='button' disabled={isBusy} onClick={() => run(save)}>Save</button>
                        <button type='button' disabled={isBusy} onClick={handleCheck}>Check</button>
                        <button type='button' disabled={isBusy} onClick={handleCreateJob}>Create job</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuoteRequestReview;
