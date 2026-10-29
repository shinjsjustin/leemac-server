import React from 'react';
import { Link } from 'react-router-dom';
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

const ReviewGrid = ({ lines, onChange, matches = {}, errors = {}, onOpenFile, readOnly = false }) => {
    const updateLine = (lineId, changes) =>
        onChange(lines.map((line) => (line.id === lineId ? { ...line, ...changes } : line)));

    const renderMatches = (line) => {
        const lineMatches = matches[line.id];
        if (!lineMatches) return null;
        if (!lineMatches.length) return <div className="review-matches">New part</div>;
        return (
            <ul className="review-matches">
                {lineMatches.map((match) => (
                    <li key={match.part_id}>
                        <Link to={`/part/${match.part_id}`}>{match.number}</Link>
                        {match.jobs.length > 0 && ` (${match.jobs.map((job) => job.job_number).join(', ')})`}
                    </li>
                ))}
            </ul>
        );
    };

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
                            {line.files.map((file) => (
                                <button type="button" key={file.id} onClick={() => onOpenFile(file)}>
                                    {file.filename}
                                </button>
                            ))}
                        </div>
                    )}
                    {errors[line.id] && <div className="review-error">{errors[line.id]}</div>}
                </div>
            ))}
        </div>
    );
};

export default ReviewGrid;
