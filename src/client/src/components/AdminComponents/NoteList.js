import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../AdminLayout/AdminLayout';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

const NoteList = () => {
    const [noteList, setNoteList] = useState([]);
    const [sortBy, setSortBy] = useState('created_at');
    const [order, setOrder] = useState('desc');

    const navigate = useNavigate();

    const fetchNotes = useCallback(async () => {
        try {
            const response = await apiFetch(`/internal/notes/listnotes?sortBy=${sortBy}&order=${order}`);
            if (response.ok) {
                const data = await response.json();
                setNoteList(data);
            } else {
                const errorText = await response.text();
                console.error('Failed to fetch notes:', errorText);
            }
        } catch (error) {
            console.error('Error fetching notes:', error);
        }
    }, [sortBy, order]);

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    const handleSort = (field) => {
        if (sortBy === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setOrder('desc');
        }
    };

    const handleRowClick = (jobId) => {
        if (jobId) navigate(`/job/${jobId}`);
    };

    const handleToggleShare = async (e, note) => {
        e.stopPropagation();
        try {
            const res = await apiFetch('/internal/notes/share', {
                method: 'PUT',
                body: { id: note.id, shared: !note.shared },
            });
            if (res.ok) {
                fetchNotes();
            } else {
                console.error('Failed to update note sharing:', await res.text());
            }
        } catch (error) {
            console.error('Error updating note sharing:', error);
        }
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    return (
        <AdminLayout current="notes" crumb="Notes">
            <div className='requests'>
                <h2>Notes</h2>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Content</th>
                            <th onClick={() => handleSort('author')}>Author</th>
                            <th onClick={() => handleSort('job_number')}>Job Number</th>
                            <th onClick={() => handleSort('created_at')}>Created At</th>
                            <th>Sharing</th>
                        </tr>
                    </thead>
                    <tbody>
                        {noteList.map((note) => (
                            <tr
                                key={note.id}
                                className='table-row'
                                onClick={() => handleRowClick(note.jobid)}
                            >
                                <td>{note.content}</td>
                                <td>{note.author}{note.is_client ? ' (client)' : ''}</td>
                                <td>{note.job_number ?? note.part_number}</td>
                                <td>{formatDate(note.created_at)}</td>
                                <td>
                                    {!note.is_client && (
                                        <>
                                            {note.shared ? 'Shared' : 'Private'}{' '}
                                            <button onClick={(e) => handleToggleShare(e, note)}>
                                                {note.shared ? 'Unshare' : 'Share with client'}
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </AdminLayout>
    );
};

export default NoteList;
