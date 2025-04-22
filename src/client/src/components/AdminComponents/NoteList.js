import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const NoteList = () => {
    const token = localStorage.getItem('token');

    const [noteList, setNoteList] = useState([]);
    const [sortBy, setSortBy] = useState('created_at');
    const [order, setOrder] = useState('asc');

    const navigate = useNavigate();

    const fetchNotes = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/notes/listnotes?sortBy=${sortBy}&order=${order}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
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
    }, [sortBy, order, token]);

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    const handleSort = (field) => {
        if (sortBy === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setOrder('asc');
        }
    };

    const handleRowClick = (jobId) => {
        navigate(`/job/${jobId}`);
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    return (
        <div>
            <Navbar />
            <div className='requests'>
                <h2>Notes</h2>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Content</th>
                            <th onClick={() => handleSort('status')}>Status</th>
                            <th onClick={() => handleSort('admin_name')}>Admin Name</th>
                            <th onClick={() => handleSort('job_number')}>Job Number</th>
                            <th onClick={() => handleSort('created_at')}>Created At</th>
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
                                <td>{note.status}</td>
                                <td>{note.admin_name}</td>
                                <td>{note.job_number}</td>
                                <td>{formatDate(note.created_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default NoteList;
