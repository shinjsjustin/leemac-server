import React, { useState, useEffect, useCallback } from 'react';
import '../Styling/Job.css';

const NotesSection = ({ jobId, userId, token, accessLevel }) => {
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [filesToUpload, setFiles] = useState([]);

    const fetchNotes = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/getnote?jobid=${jobId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await res.json();
            if (res.status === 200) {
                const notesWithFiles = await Promise.all(
                    data.map(async (note) => {
                        const fileRes = await fetch(`${process.env.REACT_APP_URL}/internal/notes/getblob?noteID=${note.id}`, {
                            method: 'GET',
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/json',
                            },
                        });
                        const files = fileRes.ok ? await fileRes.json() : [];
                        const mappedFiles = files.map((file) => {
                            let previewUrl = null;
                            if (file.mimetype === 'application/pdf' && file.content) {
                                try {
                                    const binaryString = window.atob(file.content);
                                    const len = binaryString.length;
                                    const bytes = new Uint8Array(len);
                                    for (let i = 0; i < len; i++) {
                                        bytes[i] = binaryString.charCodeAt(i);
                                    }
                                    const blob = new Blob([bytes], { type: file.mimetype });
                                    previewUrl = URL.createObjectURL(blob);
                                } catch (error) {
                                    console.error('Error converting base64 to Blob:', error);
                                }
                            }
                            return { 
                                ...file,
                                fileID: file.id,
                                previewUrl 
                            };
                        });
                        return { ...note, files: mappedFiles };
                    })
                );
                setNotes(notesWithFiles);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [jobId, token]);

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
                    userid: userId,
                    jobid: jobId,
                }),
            });
            const data = await res.json();
            if (res.status === 201) {
                alert('Note added successfully!');
                
                // Fetch job summary to get attention and job_number
                let attention = null;
                let jobNumber = null;
                try {
                    const jobSummaryRes = await fetch(`${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${jobId}`, {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });
                    const jobSummaryData = await jobSummaryRes.json();
                    if (jobSummaryRes.status === 200 && jobSummaryData.job) {
                        attention = jobSummaryData.job.attention;
                        jobNumber = jobSummaryData.job.job_number;
                    }
                } catch (e) {
                    console.error('Error fetching job summary:', e);
                }
                
                // Trigger external API call
                try {
                    console.log('=== GOOGLE SCRIPTS API CALL DEBUG ===');
                    console.log('Job ID:', jobId);
                    console.log('Attention:', attention);
                    console.log('Job Number:', jobNumber);
                    console.log('Note Content:', newNote);
                    
                    const payload = { 
                        note: {
                            "content": newNote,
                            "attention": attention,
                            "job": jobNumber
                        }
                    };
                    console.log('Payload being sent:', JSON.stringify(payload, null, 2));
                    
                    const response = await fetch(
                        'https://script.google.com/macros/s/AKfycbwBmp0MlpTcBaczJXCUyo9_mQ3DPZMpeH4lmGOBRqW6QQ5JHKcCoUhTpFNfpGvrUmMh/exec',
                        {
                            method: 'POST',
                            mode: 'no-cors',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify(payload),
                        }
                    );
                    
                    console.log('Response status:', response.status);
                    console.log('Response type:', response.type);
                    console.log('Response ok:', response.ok);
                    console.log('Response URL:', response.url);
                    console.log('Google Scripts API call completed');
                    console.log('=== END GOOGLE SCRIPTS DEBUG ===');
                } catch (e) {
                    console.error('=== GOOGLE SCRIPTS API ERROR ===');
                    console.error('Error type:', e.name);
                    console.error('Error message:', e.message);
                    console.error('Full error object:', e);
                    console.error('=== END ERROR DEBUG ===');
                }
                
                if(filesToUpload.length > 0) {
                    const formData = new FormData();
                    filesToUpload.forEach((file) => {
                        formData.append('files', file);
                    });

                    const fileResponse = await fetch(
                        `${process.env.REACT_APP_URL}/internal/notes/uploadblob?id=${data.id}`,
                        {
                            method: 'POST',
                            body: formData,
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                        }
                    );

                    if (!fileResponse.ok) {
                        throw new Error('File upload failed');
                    }
                }
                setNewNote('');
                setFiles([]);
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

    const handleFileClick = async (file) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/blob/download?fileID=${file.fileID}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to download file');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = file.filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading file:', error);
            alert('Failed to download file. Please try again.');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setFiles([...filesToUpload, ...e.dataTransfer.files]);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const removeFile = (index) => {
        setFiles(filesToUpload.filter((_, i) => i !== index));
    };

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    const handleFilePreview = (url) => {
        const newTab = window.open(url, '_blank');
        if (newTab) {
            newTab.focus();
        } else {
            alert('Unable to open preview. Please allow pop-ups for this site.');
        }
    };

    return (
        <div 
            className="notes-section"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <h3>Notes 메모</h3>
            <textarea
                className="notes-textarea"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a new note..."
            />
            <div>
                <h4>Files to be uploaded:</h4>
                {filesToUpload.map((file, index) => (
                    <div key={index} style={{ marginBottom: '5px' }}>
                        <span>{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                        <button type='button' onClick={() => removeFile(index)} style={{ marginLeft: '10px' }}>
                            Remove 삭제
                        </button>
                    </div>
                ))}
            </div>
            <button className="notes-button" onClick={handleAddNote}>Add Note</button>
            <ul className="notes-list">
                {notes.map((note) => (
                    <li className="note-item" key={note.id}>
                        <p>{note.content}</p>
                        <p><strong>Status 상태:</strong> {note.status}</p>
                        <p><strong>Admin 사람:</strong> {note.admin_name}</p>
                        <p><strong>Created 생성 날짜:</strong> {new Date(note.created_at).toLocaleString()}</p>
                        <button onClick={() => handleUpdateNoteStatus(note.id, 'acknowledged')}>Acknowledge</button>
                        <button onClick={() => handleUpdateNoteStatus(note.id, 'done')}>Mark as Done</button>
                        {accessLevel >= 2 && (
                            <button onClick={() => handleDeleteNote(note.id)}>Delete</button>
                        )}
                        {note.files.length > 0 && (
                            <div>
                                <h4>Files 파일:</h4>
                                <ul>
                                    {note.files.map((file) => (
                                        <li key={file.id}>
                                            <button onClick={() => handleFileClick(file)}>
                                                {file.filename} ({(file.size / 1024).toFixed(2)} KB)
                                            </button>
                                            {file.previewUrl && (
                                                <button onClick={() => handleFilePreview(file.previewUrl)}>Preview</button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default NotesSection;
