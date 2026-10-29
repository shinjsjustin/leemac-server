import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import JobRow from './JobRow';
import StageBadge from './StageBadge';
import DrawingTile from './DrawingTile';
import DrawingWindows, { useDrawingWindows } from './DrawingWindows';
import { NoteTarget } from './NotePin';
import { isBlank } from './PortalField';
import {
    getJob, listJobs, listPartFiles, downloadFile, fileKind, isDrawing, formatDate,
} from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import '../Styling/PortalJob.css';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CARD_TILE_WIDTH_PX = 360;
const CARD_TILE_ASPECT = 1.4;
// Order from docs/shop-stages.md.
const STAGES = [
    ['quoted', 'Quoted'], ['in_shop', 'In the shop'], ['material', 'Material'], ['preparing', 'Preparing'],
    ['machining', 'Machining'], ['outside_finishing', 'Outside finishing'], ['finishing', 'Finishing'],
    ['inspection', 'Inspection'], ['packing', 'Packing'], ['done', 'Done'], ['delivered', 'Delivered'],
    ['invoiced', 'Invoiced'],
];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Whole days from today to the due date, both read as UTC dates so time zones never shift it.
function daysLeftText(dueDate) {
    const [year, month, day] = String(dueDate).slice(0, 10).split('-').map(Number);
    const today = Math.floor(Date.now() / MS_PER_DAY) * MS_PER_DAY;
    const days = Math.round((Date.UTC(year, month - 1, day) - today) / MS_PER_DAY);
    if (days === 0) return 'due today';
    return days > 0 ? `${plural(days, 'day')} left` : `${plural(-days, 'day')} late`;
}

const firstDrawing = (filesState) => filesState?.files?.find(isDrawing);

const toWindow = (part, job, drawing) => ({
    key: part.job_part_id,
    part_number: part.part_number,
    rev: part.rev,
    description: part.part_description,
    stage: part.stage,
    job_number: job.job_number,
    material: part.material,
    finish: part.finish,
    quantity: part.quantity,
    drawing,
});

function Fact({ label, children, className }) {
    return <span className={`portal-job-fact${className ? ` ${className}` : ''}`}><em>{label}</em> <b>{children}</b></span>;
}

function JobBand({ job }) {
    const isShipped = !isBlank(job.ship_date);
    return (
        <div className="portal-job-band">
            <div className="portal-job-headline">
                <h1>{job.job_number}</h1>
                <StageBadge stage={job.stage} flag={job.flag} />
            </div>
            <div className="portal-job-facts">
                {!isBlank(job.due_date) && (
                    <Fact label="Due" className="portal-job-fact--due">
                        {formatDate(job.due_date)}{!isShipped && ` · ${daysLeftText(job.due_date)}`}
                    </Fact>
                )}
                {!isBlank(job.po_number) && <Fact label="PO">{job.po_number}</Fact>}
                {!isBlank(job.po_date) && <Fact label="Ordered">{formatDate(job.po_date)}</Fact>}
            </div>
            <span className="portal-job-bar">
                {job.parts.map((part) => (
                    <span key={part.job_part_id} className={`portal-job-seg portal-job-seg--${part.stage?.key ?? 'none'}`} />
                ))}
            </span>
        </div>
    );
}

function PartCard({ part, filesState, notes, onNoteAdded, onOpen }) {
    const drawing = firstDrawing(filesState);
    const fileCount = filesState?.files?.length ?? 0;
    const materialLine = [part.material, part.finish].filter((value) => !isBlank(value)).join(' · ');
    return (
        <NoteTarget notes={notes} target={{ part_id: part.part_id }} onAdded={onNoteAdded}>
            <article className="portal-part-card" onClick={() => onOpen(part)}>
                {filesState?.files || filesState?.error
                    ? <DrawingTile file={drawing} width={CARD_TILE_WIDTH_PX} aspect={CARD_TILE_ASPECT} onOpen={() => onOpen(part)} />
                    : <div className="portal-tile portal-tile--skeleton" style={{ aspectRatio: String(CARD_TILE_ASPECT) }} />}
                <div className="portal-part-line">
                    <b className="portal-job-num">{part.part_number}</b>
                    {!isBlank(part.rev) && <span className="portal-part-rev">Rev {part.rev}</span>}
                    <StageBadge stage={part.stage} />
                </div>
                <div className="portal-part-line">
                    <span className="portal-part-desc">{part.part_description}</span>
                    {!isBlank(part.quantity) && <b className="portal-part-qty">{part.quantity}</b>}
                </div>
                <div className="portal-part-line portal-part-meta">
                    {materialLine && <span>{materialLine}</span>}
                    {fileCount > 0 && <span className="portal-part-files">{plural(fileCount, 'file')}</span>}
                </div>
            </article>
        </NoteTarget>
    );
}

function PartTable({ parts, onOpen }) {
    return (
        <table className="portal-part-table">
            <thead>
                <tr><th>Part</th><th>Rev</th><th>Description</th><th>Qty</th><th>Material</th><th>Finish</th><th>Unit price</th><th>Stage</th></tr>
            </thead>
            <tbody>
                {parts.map((part) => (
                    <tr key={part.job_part_id} onClick={() => onOpen(part)}>
                        <td className="portal-job-num">{part.part_number}</td>
                        <td>{part.rev}</td>
                        <td>{part.part_description}</td>
                        <td>{part.quantity}</td>
                        <td>{part.material}</td>
                        <td>{part.finish}</td>
                        <td>{!isBlank(part.unit_price) && usd.format(part.unit_price)}</td>
                        <td><StageBadge stage={part.stage} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function Steps({ stageKey }) {
    return (
        <ol className="portal-steps">
            {STAGES.map(([key, label]) => (
                <li key={key} aria-current={key === stageKey ? 'step' : undefined}>{label}</li>
            ))}
        </ol>
    );
}

function FileGroup({ part, filesState, onError }) {
    if (filesState.error) return <PortalMessage kind={filesState.error.kind} message={filesState.error.message} />;
    if (!filesState.files || filesState.files.length === 0) return null;
    const handleDownload = async (file) => {
        const result = await downloadFile(file);
        onError(result.ok ? null : result.error);
    };
    return (
        <div className="portal-file-group">
            <h3>{part.part_number}</h3>
            {filesState.files.map((file) => (
                <div key={file.id} className="portal-file">
                    <span className="portal-file-kind">{fileKind(file)}</span>
                    <span className="portal-file-name">{file.filename}</span>
                    <button type="button" className="portal-button" onClick={() => handleDownload(file)}>Download</button>
                </div>
            ))}
        </div>
    );
}

const ClientJob = () => {
    const { id } = useParams();
    const windows = useDrawingWindows();
    const [job, setJob] = useState(null);
    const [error, setError] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [notes, setNotes] = useState({ jobs: {}, parts: {} });
    // Keyed by part_id; each entry is { files } or { error }.
    const [filesByPart, setFilesByPart] = useState({});
    const [view, setView] = useState('drawings');
    const [downloadError, setDownloadError] = useState(null);

    const loadNotes = useCallback(async () => {
        const result = await listNotes();
        if (result.ok) setNotes(result.data);
    }, []);

    useEffect(() => {
        loadNotes();
        listJobs().then((result) => { if (result.ok) setJobs(result.data.jobs); });
    }, [loadNotes]);

    useEffect(() => {
        let isCurrent = true;
        setJob(null);
        setError(null);
        setFilesByPart({});
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

    if (error) {
        return <PortalLayout title="Job" wide hideTitle><PortalMessage kind={error.kind} message={error.message} /></PortalLayout>;
    }
    if (!job) {
        return <PortalLayout title="Job" wide hideTitle><PortalMessage kind="loading" /></PortalLayout>;
    }

    const openPart = (part) => windows.openPart(toWindow(part, job, firstDrawing(filesByPart[part.part_id])));
    const distinctParts = job.parts.filter((part, index) => job.parts.findIndex((p) => p.part_id === part.part_id) === index);

    return (
        <PortalLayout title={`Job ${job.job_number}`} wide hideTitle>
            <div className="portal-job-page">
                <aside className="portal-job-list" aria-label="Your jobs">
                    {jobs.map((other) => (
                        <JobRow key={other.id} job={other} notes={notes.jobs[other.id] ?? []} onNoteAdded={loadNotes} compact current={other.id === job.id} />
                    ))}
                </aside>
                <section className="portal-job-main">
                    <JobBand job={job} />
                    <div className="portal-job-parts-head">
                        <h2>{`Parts · ${job.parts.length}`}</h2>
                        <div className="portal-view-switch">
                            {[['drawings', 'Drawings'], ['table', 'Table']].map(([key, label]) => (
                                <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
                            ))}
                        </div>
                    </div>
                    {view === 'table' ? <PartTable parts={job.parts} onOpen={openPart} /> : (
                        <div className="portal-part-cards">
                            {job.parts.map((part) => (
                                <PartCard
                                    key={part.job_part_id}
                                    part={part}
                                    filesState={filesByPart[part.part_id]}
                                    notes={notes.parts[part.part_id] ?? []}
                                    onNoteAdded={loadNotes}
                                    onOpen={openPart}
                                />
                            ))}
                        </div>
                    )}
                </section>
                <aside className="portal-job-side">
                    <section>
                        <h2>Progress</h2>
                        <Steps stageKey={job.stage?.key} />
                    </section>
                    <section>
                        <h2>Files</h2>
                        {downloadError && <PortalMessage kind={downloadError.kind} message={downloadError.message} />}
                        {distinctParts.map((part) => (
                            <FileGroup key={part.part_id} part={part} filesState={filesByPart[part.part_id] ?? {}} onError={setDownloadError} />
                        ))}
                    </section>
                    <section className="portal-job-notes">
                        <NoteTarget notes={notes.jobs[job.id] ?? []} target={{ job_id: job.id }} onAdded={loadNotes}>
                            <h2>Notes</h2>
                        </NoteTarget>
                    </section>
                </aside>
            </div>
            <DrawingWindows
                windows={windows.open}
                focusedKey={windows.focusedKey}
                onFocus={windows.focus}
                onClose={windows.close}
                onCloseAll={windows.closeAll}
            />
        </PortalLayout>
    );
};

export default ClientJob;
