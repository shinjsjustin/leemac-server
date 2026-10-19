import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../Navbar';
import { apiFetch } from '../../api/apiFetch';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');

const ClientJob = () => {
    const { id } = useParams();
    const [job, setJob] = useState(null);
    const [parts, setParts] = useState([]);
    const [files, setFiles] = useState([]);
    const [notes, setNotes] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const [jobRes, filesRes, notesRes] = await Promise.all([
                    apiFetch(`/client/portal/jobs/${id}`),
                    apiFetch(`/client/portal/jobs/${id}/files`),
                    apiFetch(`/client/portal/jobs/${id}/notes`),
                ]);
                if (!jobRes.ok) throw new Error('Job not found');
                const data = await jobRes.json();
                setJob(data.job);
                setParts(data.parts);
                if (filesRes.ok) setFiles(await filesRes.json());
                if (notesRes.ok) setNotes(await notesRes.json());
            } catch (err) {
                console.error(err);
                setError('Unable to load this job.');
            }
        };
        load();
    }, [id]);

    const downloadFile = async (file) => {
        try {
            const response = await apiFetch(`/client/portal/files/${file.id}/download`);
            if (!response.ok) throw new Error('Failed to download file');
            const url = window.URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = file.filename;
            link.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert('Failed to download file. Please try again.');
        }
    };

    if (error) {
        return (
            <div>
                <Navbar />
                <div className='requests'><h2 style={{ color: 'red' }}>{error}</h2></div>
            </div>
        );
    }

    if (!job) {
        return (
            <div>
                <Navbar />
                <div className='requests'><h2>Loading job...</h2></div>
            </div>
        );
    }

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>Job {job.job_number}</h2>
                <p>Attention: {job.attention || '-'}</p>
                <p>PO: {job.po_number || '-'}</p>
                <p>PO Date: {formatDate(job.po_date)}</p>
                <p>Due Date: {formatDate(job.due_date)}</p>

                <h3>Parts</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Number</th>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parts.map((part) => (
                            <tr key={part.job_part_id}>
                                <td><Link to={`/client-part/${part.id}`}>{part.number}</Link></td>
                                <td>{part.description}</td>
                                <td>{part.quantity}</td>
                                <td>{part.price}</td>
                                <td>{part.star_status || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <h3>Files</h3>
                {files.length === 0 && <p>No files.</p>}
                {files.map((file) => (
                    <div key={file.id}>
                        {file.filename}{' '}
                        <button onClick={() => downloadFile(file)}>Download</button>
                    </div>
                ))}

                <h3>Notes</h3>
                {notes.length === 0 && <p>No notes.</p>}
                {notes.map((note) => (
                    <div key={note.id}>
                        <strong>{note.author}</strong> ({formatDate(note.created_at)}): {note.content}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ClientJob;
