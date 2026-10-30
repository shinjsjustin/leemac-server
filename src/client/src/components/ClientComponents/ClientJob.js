import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import JobList from './JobList';
import StageBadge, { StageDot } from './StageBadge';
import DrawingTile from './DrawingTile';
import { NoteTarget, Thread } from './NotePin';
import { isBlank } from './PortalField';
import {
    getJob, listPartFiles, downloadFile, fileKind, isDrawing, formatDate, plural,
} from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import '../Styling/PortalJob.css';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CARD_TILE_WIDTH_PX = 360;
const CARD_TILE_ASPECT = 1.4;
// Each step covers the stage keys (docs/shop-stages.md) that mean the job is at that step.
const STEPS = [
    { label: 'Ordered', keys: ['quoted'] },
    { label: 'In the shop', keys: ['open', 'urgent', 'waiting', 'in_shop', 'material', 'preparing'] },
    { label: 'Machining', keys: ['machining', 'outside_finishing', 'finishing'] },
    { label: 'Inspection', keys: ['inspection', 'packing'] },
    { label: 'Ships', keys: ['done', 'delivered', 'shipped', 'invoiced'] },
];


// Whole days from today to the due date, both read as UTC dates so time zones never shift it.
function daysLeftText(dueDate) {
    const [year, month, day] = String(dueDate).slice(0, 10).split('-').map(Number);
    const today = Math.floor(Date.now() / MS_PER_DAY) * MS_PER_DAY;
    const days = Math.round((Date.UTC(year, month - 1, day) - today) / MS_PER_DAY);
    if (days === 0) return 'due today';
    return days > 0 ? `${plural(days, 'day')} left` : `${plural(-days, 'day')} late`;
}

const IN_SHOP_STEP = STEPS.find((step) => step.label === 'In the shop');
const IN_SHOP_STAGE = { key: 'in_shop', label: IN_SHOP_STEP.label };
const bandStage = (stage) => (IN_SHOP_STEP.keys.includes(stage?.key) ? IN_SHOP_STAGE : stage);

const firstDrawing = (filesState) => filesState?.files?.find(isDrawing);

function Fact({ label, children, className }) {
    return <span className={`portal-job-fact${className ? ` ${className}` : ''}`}><em>{label}</em> <b>{children}</b></span>;
}

function JobBand({ job, fileCount, onAddNote, onDownloadAll }) {
    const isShipped = !isBlank(job.ship_date);
    const hasFacts = [job.due_date, job.po_number, job.po_date].some((value) => !isBlank(value));
    return (
        <div className="portal-job-band">
            <div className="portal-job-headline">
                <h1>{job.job_number}</h1>
                <StageDot stage={bandStage(job.stage)} flag={job.flag} />
                <div className="portal-job-actions">
                    <button type="button" className="portal-button portal-button--quiet" onClick={onAddNote}>Add note</button>
                    {fileCount > 0 && (
                        <button type="button" className="portal-button" onClick={onDownloadAll}>{`Download all files \u00b7 ${fileCount}`}</button>
                    )}
                </div>
            </div>
            {hasFacts && <div className="portal-job-facts">
                {!isBlank(job.due_date) && (
                    <Fact label="Due" className="portal-job-fact--due">
                        {formatDate(job.due_date)}{!isShipped && ` · ${daysLeftText(job.due_date)}`}
                    </Fact>
                )}
                {!isBlank(job.po_number) && <Fact label="PO">{job.po_number}</Fact>}
                {!isBlank(job.po_date) && <Fact label="Ordered">{formatDate(job.po_date)}</Fact>}
            </div>}
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
    const fileKinds = [...new Set((filesState?.files ?? []).map(fileKind))];
    const materialLine = [part.material, part.finish].filter((value) => !isBlank(value)).join(' · ');
    return (
        <NoteTarget notes={notes} target={{ part_id: part.part_id }} onAdded={onNoteAdded}>
            <article className="portal-part-card" onClick={() => onOpen(part)}>
                {filesState?.files || filesState?.error
                    ? <DrawingTile file={drawing} width={CARD_TILE_WIDTH_PX} aspect={CARD_TILE_ASPECT} />
                    : <div className="portal-tile portal-tile--skeleton" style={{ aspectRatio: String(CARD_TILE_ASPECT) }} />}
                <div className="portal-part-line">
                    <b className="portal-job-num">{part.part_number}</b>
                    {!isBlank(part.rev) && <span className="portal-part-rev">Rev {part.rev}</span>}
                    <StageBadge stage={part.stage} />
                </div>
                <div className="portal-part-line">
                    <span className="portal-part-desc">{part.part_description}</span>
                    {!isBlank(part.quantity) && <b className="portal-part-qty">{`\u00d7${part.quantity}`}</b>}
                </div>
                <div className="portal-part-line portal-part-meta">
                    {materialLine && <span className="portal-part-material">{materialLine}</span>}
                    {fileKinds.map((kind) => <span key={kind} className="portal-file-chip">{kind}</span>)}
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

function Steps({ job }) {
    const current = STEPS.findIndex((step) => step.keys.includes(job.stage?.key));
    const shipDate = isBlank(job.ship_date) ? job.due_date : job.ship_date;
    const dates = { Ordered: job.po_date, Ships: shipDate };
    return (
        <ol className="portal-steps">
            {STEPS.map(({ label }, index) => (
                <li
                    key={label}
                    className={index < current ? 'portal-step--done' : undefined}
                    aria-current={index === current ? 'step' : undefined}
                >
                    <span>{label}</span>
                    {!isBlank(dates[label]) && <small>{formatDate(dates[label])}</small>}
                </li>
            ))}
        </ol>
    );
}

function FileList({ files, onDownload }) {
    return (
        <div className="portal-file-list">
            {files.map((file) => (
                <div key={file.id} className="portal-file">
                    <span className="portal-file-kind">{fileKind(file)}</span>
                    <span className="portal-file-name">{file.filename}</span>
                    <button type="button" className="portal-link" onClick={() => onDownload(file)}>Open</button>
                </div>
            ))}
        </div>
    );
}

const ClientJob = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [job, setJob] = useState(null);
    const [error, setError] = useState(null);
    const [notes, setNotes] = useState({ jobs: {}, parts: {} });
    // Keyed by part_id; each entry is { files } or { error }.
    const [filesByPart, setFilesByPart] = useState({});
    const [view, setView] = useState('drawings');
    const [downloadError, setDownloadError] = useState(null);
    const noteInputRef = useRef(null);

    const loadNotes = useCallback(async () => {
        const result = await listNotes();
        if (result.ok) setNotes(result.data);
    }, []);

    useEffect(() => {
        loadNotes();
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

    const openPart = (part) => navigate(`/client-part/${part.part_id}`);
    const allFiles = Object.values(filesByPart).flatMap((entry) => entry.files ?? []);
    const downloadAll = async () => {
        for (const file of allFiles) {
            const result = await downloadFile(file);
            setDownloadError(result.ok ? null : result.error);
            if (!result.ok) return;
        }
    };
    const downloadOne = async (file) => {
        const result = await downloadFile(file);
        setDownloadError(result.ok ? null : result.error);
    };
    const fileErrors = Object.entries(filesByPart).filter(([, entry]) => entry.error);
    const jobNotes = notes.jobs[job.id] ?? [];

    return (
        <PortalLayout title={`Job ${job.job_number}`} wide hideTitle>
            <div className="portal-job-page">
                <aside className="portal-job-list" aria-label="Your jobs">
                    <JobList compact currentId={job.id} notes={notes.jobs} onNoteAdded={loadNotes} />
                </aside>
                <section className="portal-job-main">
                    <JobBand job={job} fileCount={allFiles.length} onAddNote={() => noteInputRef.current?.focus()} onDownloadAll={downloadAll} />
                    <div className="portal-job-parts-head">
                        <h2>{`Parts · ${job.parts.length}`}</h2>
                        <span className="portal-job-parts-hint">Drawings load as you scroll</span>
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
                        <Steps job={job} />
                    </section>
                    <section className="portal-job-files">
                        <h2>{`Job files \u00b7 ${allFiles.length}`}</h2>
                        {downloadError && <PortalMessage kind={downloadError.kind} message={downloadError.message} />}
                        {fileErrors.map(([partId, entry]) => (
                            <PortalMessage key={partId} kind={entry.error.kind} message={entry.error.message} />
                        ))}
                        {allFiles.length === 0 ? <p>No files yet</p> : <FileList files={allFiles} onDownload={downloadOne} />}
                    </section>
                    <section className="portal-job-notes">
                        <h2>{`Notes on this job \u00b7 ${jobNotes.length}`}</h2>
                        <Thread
                            notes={jobNotes}
                            allowReply
                            placeholder={'Add a note for Leemac\u2026'}
                            target={{ job_id: job.id }}
                            onAdded={loadNotes}
                            inputRef={noteInputRef}
                        />
                    </section>
                </aside>
            </div>
        </PortalLayout>
    );
};

export default ClientJob;
