import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../Navbar';
import { apiFetch } from '../../api/apiFetch';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');

const ClientPart = () => {
    const { id } = useParams();
    const [part, setPart] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [files, setFiles] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const [partRes, filesRes] = await Promise.all([
                    apiFetch(`/client/portal/parts/${id}`),
                    apiFetch(`/client/portal/parts/${id}/files`),
                ]);
                if (!partRes.ok) throw new Error('Part not found');
                const data = await partRes.json();
                setPart(data.part);
                setJobs(data.jobs);
                if (filesRes.ok) setFiles(await filesRes.json());
            } catch (err) {
                console.error(err);
                setError('Unable to load this part.');
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

    if (!part) {
        return (
            <div>
                <Navbar />
                <div className='requests'><h2>Loading part...</h2></div>
            </div>
        );
    }

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>Part {part.number}</h2>
                <p>Description: {part.description || '-'}</p>

                <h3>Files</h3>
                {files.length === 0 && <p>No files.</p>}
                {files.map((file) => (
                    <div key={file.id}>
                        {file.filename}{' '}
                        <button onClick={() => downloadFile(file)}>Download</button>
                    </div>
                ))}

                <h3>Jobs</h3>
                {jobs.length === 0 && <p>No jobs.</p>}
                {jobs.map((job) => (
                    <div key={job.job_id}>
                        <Link to={`/client-job/${job.job_id}`}>{job.job_number}</Link>
                        {' '}- {formatDate(job.created_at)} - Qty {job.quantity} - Unit Price {job.price}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ClientPart;
