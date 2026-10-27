import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PortalField, { isBlank } from './PortalField';
import PortalDrawing, { NoDrawing } from './PortalDrawing';
import { getJob, listPartFiles, downloadFile, fileKind, isDrawing, statusLabel, formatDate } from '../../api/portalApi';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const FileRow = ({ file, onError }) => {
    const handleDownload = async () => {
        const result = await downloadFile(file);
        if (!result.ok) onError(result.error);
    };
    return (
        <div className="portal-file">
            <span>{file.filename}</span>
            <span className="portal-file-kind">{fileKind(file)}</span>
            <button type="button" className="portal-button" onClick={handleDownload}>Download</button>
        </div>
    );
};

const PartPreview = ({ files, error }) => {
    if (error) return <PortalMessage kind={error.kind} message={error.message} />;
    if (!files) return <PortalMessage kind="loading" />;
    const drawings = files.filter(isDrawing);
    return (
        <div className="portal-drawings portal-drawings--large">
            {drawings.length === 0 && <NoDrawing size="large" />}
            {drawings.map((file) => <PortalDrawing key={file.id} file={file} size="large" />)}
        </div>
    );
};

const PartCard = ({ part, filesState, isOpen, onToggle }) => {
    const [downloadError, setDownloadError] = useState(null);
    const { files } = filesState;
    return (
        <div className="portal-card portal-part">
            <div className="portal-part-body">
                <div className="portal-part-preview">
                    <PartPreview files={files} error={filesState.error} />
                </div>
                <div>
                    <div className="portal-card-row">
                        <strong>{part.part_number}</strong>
                        <span className="portal-badge">{statusLabel(part.status)}</span>
                    </div>
                    {!isBlank(part.part_description) && <p className="portal-part-desc">{part.part_description}</p>}
                    <div className="portal-fields">
                        <PortalField label="Qty" value={part.quantity} />
                        <PortalField label="Unit price" value={part.unit_price}>{usd.format(part.unit_price)}</PortalField>
                        <PortalField label="Rev" value={part.rev} />
                    </div>
                    <button
                        type="button"
                        className="portal-button portal-part-toggle"
                        aria-expanded={isOpen}
                        onClick={() => onToggle(part)}
                    >
                        {isOpen ? 'Hide files' : 'Show files'}
                    </button>
                    {isOpen && downloadError && <PortalMessage kind={downloadError.kind} message={downloadError.message} />}
                    {isOpen && files && files.length === 0 && <p className="portal-meta">No files for this part yet.</p>}
                    {isOpen && files && files.map((file) => (
                        <FileRow key={file.id} file={file} onError={setDownloadError} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const ClientJob = () => {
    const { id } = useParams();
    const [job, setJob] = useState(null);
    const [error, setError] = useState(null);
    // Keyed by part_id; each entry is { files } or { error }, loaded once with the job.
    const [filesByPart, setFilesByPart] = useState({});
    const [openParts, setOpenParts] = useState({});

    useEffect(() => {
        let isCurrent = true;
        getJob(id).then((result) => {
            if (!isCurrent) return;
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setJob(result.data);
            const partIds = [...new Set(result.data.parts.map((part) => part.part_id))];
            partIds.forEach((partId) => listPartFiles(partId).then((filesResult) => {
                if (!isCurrent) return;
                const entry = filesResult.ok ? { files: filesResult.data } : { error: filesResult.error };
                setFilesByPart((previous) => ({ ...previous, [partId]: entry }));
            }));
        });
        return () => { isCurrent = false; };
    }, [id]);

    const togglePart = (part) =>
        setOpenParts((previous) => ({ ...previous, [part.part_id]: !previous[part.part_id] }));

    if (error) {
        return <PortalLayout title="Job"><PortalMessage kind={error.kind} message={error.message} /></PortalLayout>;
    }
    if (!job) {
        return <PortalLayout title="Job"><PortalMessage kind="loading" /></PortalLayout>;
    }

    return (
        <PortalLayout
            title={`Job ${job.job_number}`}
            back={<Link className="portal-back-link" to="/client-home">Back to your jobs</Link>}
            titleAside={
                <span className={`portal-badge${job.status === 'shipped' ? ' portal-badge--shipped' : ''}`}>
                    {statusLabel(job.status)}
                </span>
            }
        >
            <div className="portal-fields portal-job-fields">
                <PortalField label="PO" value={job.po_number} />
                <PortalField label="PO date" value={job.po_date}>{formatDate(job.po_date)}</PortalField>
                <PortalField label="Due" value={job.due_date}>{formatDate(job.due_date)}</PortalField>
                <PortalField label="Ship" value={job.ship_date}>{formatDate(job.ship_date)}</PortalField>
            </div>
            <div className="portal-parts">
                {job.parts.map((part) => (
                    <PartCard
                        key={part.job_part_id}
                        part={part}
                        filesState={filesByPart[part.part_id] || {}}
                        isOpen={Boolean(openParts[part.part_id])}
                        onToggle={togglePart}
                    />
                ))}
            </div>
        </PortalLayout>
    );
};

export default ClientJob;
