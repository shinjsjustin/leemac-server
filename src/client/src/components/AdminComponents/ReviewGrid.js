import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PdfThumbnail } from '../PdfImage';
import { fillFromPart, fillFromJob } from './reviewFill';
import '../Styling/QuoteRequestReview.css';

const FIELDS = [
    { key: 'part_number', label: 'Part number', hasHint: true },
    { key: 'description', label: 'Description', hasHint: true },
    { key: 'rev', label: 'Rev', hasHint: true },
    { key: 'material', label: 'Material', hasHint: true },
    { key: 'finish', label: 'Finish', hasHint: true },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'price', label: 'Price', type: 'number', step: '0.01' },
];

const MATCH_LABELS = { join: 'Will join', similar: 'Similar' };

const PDF_MIMETYPE = 'application/pdf';

// Asks for the PDF's url once, when its box first scrolls into view.
const PreviewBox = ({ kind, file, url, onNeedPreview, onOpenPreview }) => {
    const boxRef = useRef(null);

    useEffect(() => {
        if (url) return undefined;
        if (typeof window.IntersectionObserver !== 'function') {
            onNeedPreview(kind, file);
            return undefined;
        }
        const observer = new window.IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            onNeedPreview(kind, file);
        });
        observer.observe(boxRef.current);
        return () => observer.disconnect();
    }, [kind, file, url, onNeedPreview]);

    return (
        <div className="review-preview" ref={boxRef}>
            <span className="review-preview-name">{file.filename}</span>
            {url && <PdfThumbnail previewUrl={url} onClick={() => onOpenPreview(url)} />}
        </div>
    );
};

// previews maps "kind:fileId" to a blob url, or null when its fetch failed.
const ReviewGrid = ({ lines, onChange, matches = {}, errors = {}, previews = {}, onOpenFile, onOpenPartFile, onNeedPreview, onOpenPreview, onRemoveLine, onFillLine, readOnly = false }) => {
    const updateLine = (lineId, changes) =>
        onChange(lines.map((line) => (line.id === lineId ? { ...line, ...changes } : line)));

    const renderEntry = (className, content, onFill) =>
        readOnly
            ? <span className={className}>{content}</span>
            : <button type="button" className={className} onClick={onFill}>{content}</button>;

    const renderMatches = (line) => {
        const lineMatches = matches[line.id];
        if (!lineMatches) return null;
        if (!lineMatches.length) return <div className="review-matches">New part</div>;
        return (
            <ul className="review-matches">
                {lineMatches.map((match) => (
                    <li className="review-match" key={match.id}>
                        <span className="review-match-label">{MATCH_LABELS[match.match]}</span>
                        {renderEntry(
                            'review-match-part',
                            <>{match.number} {match.description}</>,
                            () => onFillLine(fillFromPart(line, match)),
                        )}
                        {' '}
                        <Link className="review-match-open" to={`/part/${match.id}`} target="_blank">open</Link>
                        {match.history.map((job, index) => (
                            <div key={index}>
                                {renderEntry(
                                    'review-match-job',
                                    <>{job.job_number} | {job.price} | qty {job.quantity} | rev {job.rev}</>,
                                    () => onFillLine(fillFromJob(line, match, job)),
                                )}
                            </div>
                        ))}
                    </li>
                ))}
            </ul>
        );
    };

    const renderFile = (kind, file, onOpen) => {
        const key = `${kind}:${file.id}`;
        if (file.mimetype !== PDF_MIMETYPE || previews[key] === null) {
            return <button type="button" key={file.id} onClick={() => onOpen(file)}>{file.filename}</button>;
        }
        return (
            <PreviewBox
                key={file.id}
                kind={kind}
                file={file}
                url={previews[key]}
                onNeedPreview={onNeedPreview}
                onOpenPreview={onOpenPreview}
            />
        );
    };

    const isEdited = (line) =>
        Boolean(line.source_part_id) && (line.part_number ?? '') !== line.source_part_number;

    const renderField = (line, field) => {
        const id = `review-${line.id}-${field.key}`;
        const value = line[field.key] ?? '';
        const suggestion = field.hasHint ? line.bourne_suggestion?.[field.key] : undefined;
        const hasHint = !readOnly && suggestion !== undefined && suggestion !== null && suggestion !== (line[field.key] ?? '');
        return (
            <div className="review-field" key={field.key}>
                <label htmlFor={id}>{field.label}</label>
                {readOnly ? (
                    <span id={id}>{value}</span>
                ) : (
                    <input
                        id={id}
                        type={field.type || 'text'}
                        step={field.step}
                        value={value}
                        onChange={(e) => updateLine(line.id, { [field.key]: e.target.value })}
                    />
                )}
                {hasHint && (
                    <div className="review-hint">
                        Bourne: {suggestion}
                        <button type="button" onClick={() => updateLine(line.id, { [field.key]: suggestion })}>
                            Use
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="review-grid">
            {lines.map((line) => (
                <div className="review-line" key={line.id}>
                    {FIELDS.map((field) => renderField(line, field))}
                    {renderMatches(line)}
                    {line.files?.length > 0 && (
                        <div className="review-files">
                            {line.files.map((file) => renderFile('line', file, onOpenFile))}
                        </div>
                    )}
                    {line.part_files?.length > 0 && (
                        <div className="review-files">
                            <span>Part drawings</span>
                            {line.part_files.map((file) => renderFile('part', file, onOpenPartFile))}
                        </div>
                    )}
                    {isEdited(line) && (
                        <div className="review-warning">
                            Edited from {line.source_part_number}. The job will use the original part {line.source_part_number}; remove this line to drop it.
                        </div>
                    )}
                    {!readOnly && (
                        <button type="button" onClick={() => onRemoveLine(line.id)}>Remove line</button>
                    )}
                    {errors[line.id] && <div className="review-error">{errors[line.id]}</div>}
                </div>
            ))}
        </div>
    );
};

export default ReviewGrid;
