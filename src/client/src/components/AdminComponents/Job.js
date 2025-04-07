import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import AddPart from './AddPart';
import '../Styling/Job.css';
import {jwtDecode} from 'jwt-decode';
import TopBar from './TopBar';

const Job = () => {
    const { id } = useParams();
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    const [job, setJob] = useState(null);
    const [parts, setParts] = useState([]);
    const [poDetails, setPoDetails] = useState({
        poNum: '',
        poDate: '',
        dueDate: '',
        taxCode: '',
        tax: '',
        taxPercent: '',
    });

    const [invoiceDetails, setInvoiceDetails] = useState({
        invoiceNum: '',
    });

    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;

    const fetchJobDetails = useCallback(async () => {
        try {
            const res = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${id}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const data = await res.json();
            if (res.status === 200) {
                setJob(data.job);
                setParts(data.parts);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [id, token]);

    const fetchNotes = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/getnote?jobid=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await res.json();
            if (res.status === 200) {
                setNotes(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [id, token]);

    useEffect(() => {
        fetchJobDetails();
        fetchNotes();
        console.log("accessLevel: ", accessLevel);
    }, [fetchJobDetails, fetchNotes]);

    const handlePartClick = (partId) => {
        navigate(`/part/${partId}`);
    };

    const handlePartAdded = (newPart) => {
        setParts(prev => [...prev, newPart]);
    };

    const handlePoChange = (e) => {
        const { name, value } = e.target;
        setPoDetails((prev) => ({ ...prev, [name]: value }));
    };

    const handleInvoiceChange = (e) => {
        const { name, value } = e.target;
        setInvoiceDetails((prev) => ({ ...prev, [name]: value }));
    };

    const handleUpdatePo = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/updatepo`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id, ...poDetails }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('PO updated successfully!');
                fetchJobDetails();
            } else {
                console.error(data);
                alert('Failed to update PO.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating PO.');
        }
    };

    const handleUpdateInvoiceAndIncrement = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/updateinvoiceandincrement`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Invoice updated and incremented successfully!');
                fetchJobDetails();
            } else {
                console.error(data);
                alert('Failed to update and increment invoice.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating and incrementing invoice.');
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return alert('Note content cannot be empty.');
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/newnote`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: newNote,
                    userid: decodedToken.id,
                    jobid: id,
                }),
            });
            const data = await res.json();
            if (res.status === 201) {
                alert('Note added successfully!');
                setNewNote('');
                fetchNotes();
            } else {
                console.error(data);
                alert('Failed to add note.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while adding note.');
        }
    };

    const handleUpdateNoteStatus = async (noteId, status) => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/updatestatus`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: noteId, status }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Note status updated successfully!');
                fetchNotes();
            } else {
                console.error(data);
                alert('Failed to update note status.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating note status.');
        }
    };

    const handleDeleteNote = async (noteId) => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/delete`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: noteId }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Note deleted successfully!');
                fetchNotes();
            } else {
                console.error(data);
                alert('Failed to delete note.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while deleting note.');
        }
    };

    const handleRemovePart = async (partId) => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/jobpartremove`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id, partId }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Part removed successfully!');
                setParts((prev) => prev.filter((part) => part.id !== partId));
            } else {
                console.error(data);
                alert('Failed to remove part.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while removing part.');
        }
    };

    if (!job) return <div>Loading...</div>;

    return (
        <div className="job-page">
            <Navbar />
            <TopBar 
                accessLevel={accessLevel} 
                job={job} 
                parts={parts} 
                token={token} 
            />
            {accessLevel >= 2 && (<button className="top-bar-button" onClick={handleUpdateInvoiceAndIncrement}>Update Invoice</button>)}
            <div className="job-notes-container">
                <div className="job-details">
                    <h2>Job #{job.job_number}</h2>
                    <p><strong>Attention:</strong> {job.attention}</p>
                    <p><strong>Company:</strong> {job.company_name}</p>
                    <p><strong>Created:</strong> {job.created_at?.slice(0, 10)}</p>
                    <p><strong>PO Number:</strong> {job.po_number || '—'}</p>
                    <p><strong>PO Date:</strong> {job.po_date || '—'}</p>
                    <p><strong>Due Date:</strong> {job.due_date || '—'}</p>
                    <p><strong>Tax Code:</strong> {job.tax_code || '—'}</p>
                    <p><strong>Tax:</strong> {job.tax || '—'}</p>
                    <p><strong>Tax Percent:</strong> {job.tax_percent || '—'}</p>
                    <p><strong>Invoice Number:</strong> {job.invoice_number || '—'}</p>
                    <p><strong>Invoice Date:</strong> {job.invoice_date || '—'}</p>
                </div>
                <div className="notes-section">
                    <h3>Notes</h3>
                    <textarea
                        className="notes-textarea"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a new note..."
                    />
                    <button className="notes-button" onClick={handleAddNote}>Add Note</button>
                    <ul className="notes-list">
                        {notes.map((note) => (
                            <li className="note-item" key={note.id}>
                                <p>{note.content}</p>
                                <p><strong>Status:</strong> {note.status}</p>
                                <p><strong>Admin:</strong> {note.admin_name}</p>
                                <p><strong>Created:</strong> {note.created_at}</p>
                                <button onClick={() => handleUpdateNoteStatus(note.id, 'acknowledged')}>Acknowledge</button>
                                <button onClick={() => handleUpdateNoteStatus(note.id, 'done')}>Mark as Done</button>
                                {accessLevel >= 2 && (
                                    <button onClick={() => handleDeleteNote(note.id)}>Delete</button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <div className='requests'>
                {accessLevel >= 2 && (
                    <>
                        <h3>Update PO</h3>
                        <form className="update-po-form" onSubmit={(e) => { e.preventDefault(); handleUpdatePo(); }}>
                            <input className="po-input" type="text" name="poNum" placeholder="PO Number" value={poDetails.poNum} onChange={handlePoChange} />
                            <input className="po-input" type="date" name="poDate" placeholder="PO Date" value={poDetails.poDate} onChange={handlePoChange} />
                            <input className="po-input" type="date" name="dueDate" placeholder="Due Date" value={poDetails.dueDate} onChange={handlePoChange} />
                            <input className="po-input" type="text" name="taxCode" placeholder="Tax Code" value={poDetails.taxCode} onChange={handlePoChange} />
                            <input className="po-input" type="number" name="tax" placeholder="Tax" value={poDetails.tax} onChange={handlePoChange} />
                            <input className="po-input" type="number" name="taxPercent" placeholder="Tax Percent" value={poDetails.taxPercent} onChange={handlePoChange} />
                            <button className="po-button" type="submit">Update PO</button>
                        </form>
                    </>
                )}
                <h3>Parts in Job</h3>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Part #</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parts.map(part => (
                            <tr key={part.id} style={{ cursor: 'pointer' }}>
                                <td onClick={() => handlePartClick(part.id)}>{part.number}</td>
                                <td onClick={() => handlePartClick(part.id)}>{part.quantity}</td>
                                <td onClick={() => handlePartClick(part.id)}>${part.price}</td>
                                {accessLevel >= 2 && (
                                    <td>
                                        <button className="remove-part-button" onClick={() => handleRemovePart(part.id)}>Remove</button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <hr />
                {accessLevel >= 2 && (
                    <AddPart jobId={id} onPartAdded={handlePartAdded} />
                )}
            </div>
        </div>
    );
};

export default Job;
