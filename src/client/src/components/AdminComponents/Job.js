import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import AddPart from './AddPart';
import '../Styling/Job.css';
import { jwtDecode } from 'jwt-decode';


const Job = () => {
    const { id } = useParams();
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    const [job, setJob] = useState(null);
    const [parts, setParts] = useState([]);
    const [partFiles, setPartFiles] = useState({}); // Store files for each part
    const [poDetails, setPoDetails] = useState({
        poNum: '',
        poDate: '',
        dueDate: '',
        taxCode: '',
        tax: '',
        taxPercent: '',
    });

    // Add part modal state
    const [showAddPartModal, setShowAddPartModal] = useState(false);
    const [openSection, setOpenSection] = useState(new Set(['jobinfo', 'parts', 'po', 'notes', 'expenses']));
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);

    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;
    const userId = decodedToken?.id;
    const [isCurrentJobStarred, setIsCurrentJobStarred] = useState(false);
    const [hoveredRemoveId, setHoveredRemoveId] = useState(null);

    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [noteFilesToUpload, setNoteFiles] = useState([]);

    const [expenses, setExpenses] = useState([]);
    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [newExpense, setNewExpense] = useState({
        description: '',
        vendor: '',
        amount: '',
        expense_date: '',
        category: '',
        notes: '',
    });

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

    const checkCurrentJobStarred = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/checkstarred?jobId=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            
            if (response.ok) {
                const data = await response.json();
                setIsCurrentJobStarred(data.isStarred);
            } else {
                console.error('Failed to check starred status');
                setIsCurrentJobStarred(false);
            }
        } catch (e) {
            console.error('Error checking starred status:', e);
            setIsCurrentJobStarred(false);
        }
    }, [id, token]);

    const fetchPartFiles = useCallback(async (partId) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/getblob?partID=${partId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Fetching Files Error');
            }

            const fileDetails = await response.json();
            const mappedFiles = fileDetails.map((file) => {
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
                    previewUrl,
                };
            });

            setPartFiles(prev => ({
                ...prev,
                [partId]: mappedFiles
            }));
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    const handleFilePreview = (url) => {
        const newTab = window.open(url, '_blank');
        if (newTab) {
            newTab.focus();
        } else {
            alert('Unable to open preview. Please allow pop-ups for this site.');
        }
    };

    const fetchExpenses = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/expenses/byjob/${id}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setExpenses(data);
            }
        } catch (e) {
            console.error('Error fetching expenses:', e);
        }
    }, [id, token]);

    const handleCreateExpense = async (e) => {
        e.preventDefault();
        if (!newExpense.description || !newExpense.amount || !newExpense.expense_date) {
            alert('Description, amount, and date are required.');
            return;
        }
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/expenses/create`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newExpense, jobIds: [parseInt(id)] }),
            });
            if (res.ok) {
                setNewExpense({ description: '', vendor: '', amount: '', expense_date: '', category: '', notes: '' });
                setShowExpenseForm(false);
                fetchExpenses();
            } else {
                const data = await res.json();
                alert(`Failed to create expense: ${data.error}`);
            }
        } catch (e) {
            console.error('Error creating expense:', e);
            alert('Error creating expense.');
        }
    };

    const handleUpdateExpense = async (expense) => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/expenses/update/${expense.id}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: expense.description,
                    vendor: expense.vendor,
                    amount: expense.amount,
                    expense_date: expense.expense_date,
                    category: expense.category,
                    notes: expense.notes,
                }),
            });
            if (res.ok) {
                alert('Expense updated successfully!');
                fetchExpenses();
            } else {
                const data = await res.json();
                alert(`Failed to update expense: ${data.error}`);
            }
        } catch (e) {
            console.error('Error updating expense:', e);
            alert('Error updating expense.');
        }
    };

    const handleDeleteExpense = async (expenseId) => {
        if (!window.confirm('Are you sure you want to delete this expense?')) return;
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/expenses/delete/${expenseId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                fetchExpenses();
            } else {
                const data = await res.json();
                alert(`Failed to delete expense: ${data.error}`);
            }
        } catch (e) {
            console.error('Error deleting expense:', e);
            alert('Error deleting expense.');
        }
    };

    const handleExpenseFieldChange = (expenseId, field, value) => {
        setExpenses(prev =>
            prev.map(exp => exp.id === expenseId ? { ...exp, [field]: value } : exp)
        );
    };

    const fetchNotes = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/getnote?jobid=${id}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (res.status === 200) {
                const notesWithFiles = await Promise.all(
                    data.map(async (note) => {
                        const fileRes = await fetch(`${process.env.REACT_APP_URL}/internal/notes/getblob?noteID=${note.id}`, {
                            method: 'GET',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        });
                        const files = fileRes.ok ? await fileRes.json() : [];
                        const mappedFiles = files.map((file) => {
                            let previewUrl = null;
                            if (file.mimetype === 'application/pdf' && file.content) {
                                try {
                                    const binaryString = window.atob(file.content);
                                    const len = binaryString.length;
                                    const bytes = new Uint8Array(len);
                                    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
                                    const blob = new Blob([bytes], { type: file.mimetype });
                                    previewUrl = URL.createObjectURL(blob);
                                } catch (error) {
                                    console.error('Error converting base64 to Blob:', error);
                                }
                            }
                            return { ...file, fileID: file.id, previewUrl };
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
    }, [id, token]);

    const handleAddNote = async () => {
        if (!newNote.trim()) return alert('Note content cannot be empty.');
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/notes/newnote`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newNote, userid: userId, jobid: id }),
            });
            const data = await res.json();
            if (res.status === 201) {
                alert('Note added successfully!');
                let attention = null;
                let jobNumber = null;
                try {
                    const jobSummaryRes = await fetch(`${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${id}`, {
                        method: 'GET',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    });
                    const jobSummaryData = await jobSummaryRes.json();
                    if (jobSummaryRes.status === 200 && jobSummaryData.job) {
                        attention = jobSummaryData.job.attention;
                        jobNumber = jobSummaryData.job.job_number;
                    }
                } catch (e) {
                    console.error('Error fetching job summary:', e);
                }
                try {
                    const payload = { note: { content: newNote, attention, job: jobNumber } };
                    await fetch(
                        'https://script.google.com/macros/s/AKfycbwBmp0MlpTcBaczJXCUyo9_mQ3DPZMpeH4lmGOBRqW6QQ5JHKcCoUhTpFNfpGvrUmMh/exec',
                        { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }
                    );
                } catch (e) {
                    console.error('Google Scripts API error:', e);
                }
                if (noteFilesToUpload.length > 0) {
                    const formData = new FormData();
                    noteFilesToUpload.forEach((file) => formData.append('files', file));
                    const fileResponse = await fetch(
                        `${process.env.REACT_APP_URL}/internal/notes/uploadblob?id=${data.id}`,
                        { method: 'POST', body: formData, headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (!fileResponse.ok) throw new Error('File upload failed');
                }
                setNewNote('');
                setNoteFiles([]);
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
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

    const handleNoteFileClick = async (file) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/blob/download?fileID=${file.fileID}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Failed to download file');
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

    const handleNoteDrop = (e) => {
        e.preventDefault();
        setNoteFiles(prev => [...prev, ...e.dataTransfer.files]);
    };

    const handleNoteDragOver = (e) => { e.preventDefault(); };

    const removeNoteFile = (index) => { setNoteFiles(prev => prev.filter((_, i) => i !== index)); };

    useEffect(() => {
        fetchJobDetails();
        checkCurrentJobStarred();
        fetchExpenses();
        fetchNotes();
    }, [fetchJobDetails, checkCurrentJobStarred, fetchExpenses, fetchNotes]);

    useEffect(() => {
        // Fetch files for each part when parts are loaded
        parts.forEach(part => {
            fetchPartFiles(part.id);
        });
    }, [parts, fetchPartFiles]);

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

    // Function to create calendar event
    const createCalendarEvent = async (jobData, partsData, poDate, dueDate) => {
        try {
            const formatDateForCalendar = (dateString) => {
                if (!dateString) return null;
                const date = new Date(dateString);
                return date.toISOString().split('T')[0];
            };

            const startDate = formatDateForCalendar(poDate);
            const endDate = formatDateForCalendar(dueDate);

            if (!startDate || !endDate) {
                console.warn('PO Date or Due Date missing, skipping calendar event creation');
                return null;
            }

            // Event 1: Ordered event on poDate
            const orderedEventData = {
                summary: `${jobData.job_number} ordered by ${jobData.attention}`,
                description: jobData.attention || '',
                startDate: startDate,
                endDate: startDate,
                allDay: true,
                calendarId: 'primary'
            };

            // Event 2: Expected event on dueDate
            const expectedEventData = {
                summary: `${jobData.job_number} expected`,
                description: jobData.attention || '',
                startDate: endDate,
                endDate: endDate,
                allDay: true,
                calendarId: 'primary'
            };

            console.log('Creating ordered event:', orderedEventData);
            console.log('Creating expected event:', expectedEventData);

            const [orderedRes, expectedRes] = await Promise.all([
                fetch(`${process.env.REACT_APP_URL}/internal/calendar/events`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderedEventData),
                }),
                fetch(`${process.env.REACT_APP_URL}/internal/calendar/events`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(expectedEventData),
                }),
            ]);

            const orderedResult = orderedRes.ok ? await orderedRes.json() : null;
            const expectedResult = expectedRes.ok ? await expectedRes.json() : null;

            const eventIds = {
                orderedEventId: orderedResult?.event?.id || null,
                expectedEventId: expectedResult?.event?.id || null,
            };

            console.log('Calendar events created:', eventIds);

            // Store event IDs in localStorage keyed by job ID for later deletion
            localStorage.setItem(`poEventIds_${id}`, JSON.stringify(eventIds));

            return eventIds;
        } catch (error) {
            console.error('Error creating calendar events:', error);
        }
    };

    // Helper to get the soonest upcoming Friday at 3pm
    const getSoonestFriday3pm = () => {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7; // if today is Friday, get next Friday
        const friday = new Date(now);
        friday.setDate(now.getDate() + daysUntilFriday);
        friday.setHours(15, 0, 0, 0);
        return friday;
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
                
                // Create calendar event after successful PO update
                try {
                    await createCalendarEvent(
                        job, 
                        parts, 
                        poDetails.poDate, 
                        poDetails.dueDate
                    );
                    console.log('Calendar event created for job update');
                } catch (calendarError) {
                    console.error('Calendar event creation failed, but PO was updated:', calendarError);
                    // Don't show error to user since PO update was successful
                }
                
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

                // Calculate costs automatically
                await handleCosts();

                // Delete the two PO calendar events if they exist
                const storedEventIds = localStorage.getItem(`poEventIds_${id}`);
                if (storedEventIds) {
                    const { orderedEventId, expectedEventId } = JSON.parse(storedEventIds);
                    const deletePromises = [];
                    if (orderedEventId) {
                        deletePromises.push(
                            fetch(`${process.env.REACT_APP_URL}/internal/calendar/events/${orderedEventId}?calendarId=primary`, {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${token}` },
                            })
                        );
                    }
                    if (expectedEventId) {
                        deletePromises.push(
                            fetch(`${process.env.REACT_APP_URL}/internal/calendar/events/${expectedEventId}?calendarId=primary`, {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${token}` },
                            })
                        );
                    }
                    try {
                        await Promise.all(deletePromises);
                        console.log('PO calendar events deleted');
                        localStorage.removeItem(`poEventIds_${id}`);
                    } catch (deleteError) {
                        console.error('Failed to delete one or more PO calendar events:', deleteError);
                    }
                }

                // Create a Friday 3pm review reminder event
                try {
                    const friday3pm = getSoonestFriday3pm();
                    const endTime = new Date(friday3pm.getTime() + 30 * 60 * 1000); // 30 min duration
                    const reviewEventData = {
                        summary: `Review Job #${job.job_number} – ${job.attention}`,
                        description: `Invoice has been issued. Please review job #${job.job_number} for ${job.attention}.`,
                        startDateTime: friday3pm.toISOString(),
                        endDateTime: endTime.toISOString(),
                        calendarId: 'primary',
                        reminders: [{ method: 'popup', minutes: 10 }],
                    };
                    const reviewRes = await fetch(`${process.env.REACT_APP_URL}/internal/calendar/events`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(reviewEventData),
                    });
                    if (reviewRes.ok) {
                        console.log('Friday review event created');
                    } else {
                        console.error('Failed to create Friday review event');
                    }
                } catch (calendarError) {
                    console.error('Calendar review event creation failed:', calendarError);
                }

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

    const handleStarJob = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/starjob`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id, attention: job.attention }),
            });
            const data = await response.json();
            if (response.status === 201) {
                alert('Job starred successfully!');
                setIsCurrentJobStarred(true);
            } else {
                console.error(data);
                alert('Failed to star the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while starring the job.');
        }
    };

    const handleUnstarJob = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/unstarjob`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Job unstarred successfully!');
                setIsCurrentJobStarred(false);
            } else {
                console.error(data);
                alert('Failed to unstar the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while unstarring the job.');
        }
    };

    const handleUpdateJobPartJoin = async (partId, newQuantity, newPrice, newRev, newDetails, newNote) => {
        if (newQuantity <= 0) {
            return alert('Quantity must be greater than 0.');
        }

        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/updatejobpartjoin`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    jobId: id, 
                    partId, 
                    quantity: newQuantity,
                    price: newPrice,
                    rev: newRev,
                    details: newDetails,
                    note: newNote
                }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Part details updated successfully!');
                fetchJobDetails();
            } else {
                console.error(data);
                alert('Failed to update part details.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating part details.');
        }
    };

    const handleCosts = async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/calculatecost`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Costs calculated successfully!');
                setJob((prevJob) => ({
                    ...prevJob,
                    subtotal: data.subtotal,
                    total_cost: data.total_cost,
                }));
            } else {
                console.error(data);
                alert('Failed to calculate costs.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while calculating costs.');
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    const formatShortDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    const handleGoBack = () => navigate(-1);

    const handlePopulateSheet = async () => {
        try {
            const clearResponse = await fetch(`${process.env.REACT_APP_URL}/internal/sheet/clear`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            if (clearResponse.status !== 200) { alert('Failed to clear Google Sheet.'); return; }
            const populateResponse = await fetch(`${process.env.REACT_APP_URL}/internal/sheet/populate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ job, parts }),
            });
            const data = await populateResponse.json();
            if (populateResponse.status === 200) {
                alert('Google Sheet populated successfully!');
            } else {
                console.error(data);
                alert('Failed to populate Google Sheet.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while populating Google Sheet.');
        }
    };

    const triggerExport = useCallback(async (actionType) => {
        try {
            await fetch(
                'https://script.google.com/macros/s/AKfycbwBmp0MlpTcBaczJXCUyo9_mQ3DPZMpeH4lmGOBRqW6QQ5JHKcCoUhTpFNfpGvrUmMh/exec',
                {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ action: actionType }),
                }
            );
        } catch (e) {
            console.error('Network or fetch error:', e);
        }
    }, [token]);

    if (!job) return (
        <div>
            <Navbar />
            <div className="centered-button-container">
                <button onClick={() => navigate('/')}>Session expired, click to return home</button>
            </div>
        </div>
    );

    const chipStyle = {
        border: '1.5px solid #aaa',
        borderRadius: '12px',
        padding: '1px 10px',
        background: '#f8f8f8',
        fontSize: '12px',
        whiteSpace: 'nowrap',
    };

    const toggleSection = (key) => setOpenSection(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

    const accordionHeaderStyle = (isOpen) => ({
        padding: '12px 16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: isOpen ? '#fff' : '#fafaf8',
        userSelect: 'none',
        borderBottom: isOpen ? 'none' : '1px solid #e0e0e0',
    });

    const sectionBodyStyle = {
        padding: '16px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e0e0e0',
    };

    const expensesTotal = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

    return (
        <div className="job-page">
            <Navbar />

            {/* ── Header Bar ── */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 100,
                backgroundColor: '#1a3a1a', color: '#fff',
                height: '44px', display: 'flex', alignItems: 'center',
                padding: '0 16px', gap: '12px',
            }}>
                <button
                    onClick={handleGoBack}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '14px', padding: '4px 8px', flexShrink: 0 }}
                >
                    ← Back
                </button>
                <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: '15px' }}>
                    Job #{job.job_number}
                </span>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                        onClick={() => setShowOverflowMenu(p => !p)}
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '20px', padding: '4px 8px', lineHeight: 1 }}
                    >
                        ⋯
                    </button>
                    {showOverflowMenu && (
                        <div style={{
                            position: 'absolute', right: 0, top: '100%',
                            backgroundColor: '#fff', border: '1px solid #ddd',
                            borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 200, minWidth: '160px', overflow: 'hidden',
                        }}>
                            <button
                                onClick={() => { isCurrentJobStarred ? handleUnstarJob() : handleStarJob(); setShowOverflowMenu(false); }}
                                style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                            >
                                {isCurrentJobStarred ? '☆ Unstar Job' : '⭐ Star Job'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Status Strip ── */}
            <div style={{
                position: 'sticky', top: '44px', zIndex: 99,
                backgroundColor: '#d4edda', padding: '6px 16px',
                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                borderBottom: '1.5px solid #b2dfdb', fontSize: '13px',
            }}>
                <strong>{job.company_name}</strong>
                <span style={{ color: '#555' }}>— {job.attention}</span>
                {job.po_number && <span style={chipStyle}>PO {job.po_number}</span>}
                {job.due_date && <span style={chipStyle}>Due {formatShortDate(job.due_date)}</span>}
                {accessLevel >= 2 && job.total_cost != null && <span style={{ ...chipStyle, fontWeight: '600' }}>${Number(job.total_cost).toFixed(2)}</span>}
            </div>

            {/* ── Accordion Sections ── */}
            <div style={{ paddingBottom: '60px' }}>

                {/* ── Job Info ── */}
                <div style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div
                        style={accordionHeaderStyle(openSection.has('jobinfo'))}
                        onClick={() => toggleSection('jobinfo')}
                    >
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: '700' }}>Job Info</div>
                            {!openSection.has('jobinfo') && (
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                    {job.company_name} · Created {formatShortDate(job.created_at)}
                                </div>
                            )}
                        </div>
                        <span style={{ color: '#888' }}>{openSection.has('jobinfo') ? '▲' : '▼'}</span>
                    </div>
                    {openSection.has('jobinfo') && (
                        <div style={sectionBodyStyle}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                                {[
                                    ['Attention', job.attention],
                                    ['Company', job.company_name],
                                    ['Created', formatDate(job.created_at)],
                                    ['PO Number', job.po_number || '—'],
                                    ['PO Date', job.po_date ? formatDate(job.po_date) : '—'],
                                    ['Due Date', job.due_date ? formatDate(job.due_date) : '—'],
                                    ...(accessLevel >= 2 ? [
                                        ['Tax Code', job.tax_code || '—'],
                                        ['Tax', job.tax || '—'],
                                        ['Tax Percent', job.tax_percent != null ? `${job.tax_percent}%` : '—'],
                                    ] : []),
                                    ['Invoice Number', job.invoice_number || '—'],
                                    ['Invoice Date', job.invoice_date ? formatDate(job.invoice_date) : '—'],
                                    ...(accessLevel >= 2 ? [
                                        ['Subtotal', job.subtotal != null ? `$${Number(job.subtotal).toFixed(2)}` : '—'],
                                        ['Total', job.total_cost != null ? `$${Number(job.total_cost).toFixed(2)}` : '—'],
                                    ] : []),
                                ].map(([label, value]) => (
                                    <div key={label} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                                        <span style={{ color: '#888', fontSize: '12px', minWidth: '100px', flexShrink: 0 }}>{label}</span>
                                        <span style={{ fontSize: '13px', fontWeight: label === 'Total' ? '600' : 'normal' }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Parts ── */}
                <div style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div
                        style={accordionHeaderStyle(openSection.has('parts'))}
                        onClick={() => toggleSection('parts')}
                    >
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: '700' }}>Parts ({parts.length})</div>
                            {!openSection.has('parts') && (
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                    {parts.length > 0 ? parts.map(p => p.number).join(', ') : 'No parts'}
                                </div>
                            )}
                        </div>
                        <span style={{ color: '#888' }}>{openSection.has('parts') ? '▲' : '▼'}</span>
                    </div>
                    {openSection.has('parts') && (
                        <div style={sectionBodyStyle}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <button
                                    onClick={() => setShowAddPartModal(true)}
                                    style={{ padding: '7px 14px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                                >
                                    + Add Part
                                </button>
                                {accessLevel >= 2 && (
                                    <button
                                        onClick={handleCosts}
                                        style={{ padding: '7px 14px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                                    >
                                        Costs
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'grid', gap: '16px' }}>
                                {parts.map(part => (
                                    <div key={part.id} style={{
                                        border: '1px solid #ddd',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        backgroundColor: '#fafaf8',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                    }}>
                                        {/* Top bar — part number + remove button */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <h4 style={{ margin: 0, cursor: 'pointer', fontSize: '14px' }} onClick={() => handlePartClick(part.id)}>
                                                {part.number}
                                            </h4>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm(`Remove part "${part.number}" from this job?`)) {
                                                        handleRemovePart(part.id);
                                                    }
                                                }}
                                                onMouseEnter={() => setHoveredRemoveId(part.id)}
                                                onMouseLeave={() => setHoveredRemoveId(null)}
                                                style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '50%',
                                                    border: 'none',
                                                    backgroundColor: hoveredRemoveId === part.id ? '#c62828' : '#f44336',
                                                    color: '#fff',
                                                    cursor: 'pointer',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    transform: hoveredRemoveId === part.id ? 'scale(1.12)' : 'scale(1)',
                                                    transition: 'background-color 0.15s ease, transform 0.15s ease',
                                                }}
                                                title="Remove part"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {/* Fields row — inputs on left, Preview button on right */}
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'grid', gap: '8px', flex: 1, minWidth: '160px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', color: '#888', minWidth: '60px' }}>Rev</span>
                                                    {accessLevel >= 1 ? (
                                                        <input type="text" defaultValue={part.rev} onChange={(e) => part.newRev = e.target.value} style={{ width: '80px', fontSize: '12px' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '12px' }}>{part.rev}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', color: '#888', minWidth: '60px' }}>Details</span>
                                                    {accessLevel >= 1 ? (
                                                        <input type="text" defaultValue={part.details} onChange={(e) => part.newDetails = e.target.value} style={{ width: '140px', fontSize: '12px' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '12px' }}>{part.details}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', color: '#888', minWidth: '60px' }}>Qty</span>
                                                    {accessLevel >= 1 ? (
                                                        <input type="number" defaultValue={part.quantity} min="1" onChange={(e) => part.newQuantity = parseInt(e.target.value, 10)} style={{ width: '60px', fontSize: '12px' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '12px' }}>{part.quantity}</span>
                                                    )}
                                                </div>
                                                {accessLevel >= 2 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '12px', color: '#888', minWidth: '60px' }}>Unit Price</span>
                                                        <input type="number" step="0.01" defaultValue={part.price} onChange={(e) => part.newPrice = parseFloat(e.target.value)} style={{ width: '80px', fontSize: '12px' }} />
                                                    </div>
                                                )}
                                            </div>
                                            {/* Preview buttons — right of fields */}
                                            {partFiles[part.id] && partFiles[part.id].filter(f => f.mimetype === 'application/pdf' && f.previewUrl).length > 0 && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                                                    {partFiles[part.id]
                                                        .filter(f => f.mimetype === 'application/pdf' && f.previewUrl)
                                                        .map((file, index) => (
                                                            <button
                                                                key={index}
                                                                onClick={() => handleFilePreview(file.previewUrl)}
                                                                style={{
                                                                    padding: '8px 14px',
                                                                    backgroundColor: '#FF6D00',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '12px',
                                                                    fontWeight: '600',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                Preview
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Note */}
                                        <div>
                                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>Note</div>
                                            {accessLevel >= 1 ? (
                                                <textarea
                                                    defaultValue={part.note || ''}
                                                    onChange={(e) => part.newNote = e.target.value}
                                                    placeholder="Part note..."
                                                    rows="5"
                                                    style={{ width: '100%', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', padding: '6px', resize: 'vertical', boxSizing: 'border-box' }}
                                                />
                                            ) : (
                                                <p style={{ fontSize: '12px', color: '#444', margin: 0 }}>
                                                    {part.note || <span style={{ color: '#999', fontStyle: 'italic' }}>No note</span>}
                                                </p>
                                            )}
                                        </div>

                                        {/* Update button — below note, left-aligned, auto width */}
                                        {accessLevel >= 1 && (
                                            <div>
                                                <button
                                                    onClick={() => handleUpdateJobPartJoin(
                                                        part.id,
                                                        part.newQuantity || part.quantity,
                                                        part.newPrice || part.price,
                                                        part.newRev || part.rev,
                                                        part.newDetails || part.details,
                                                        part.newNote !== undefined ? part.newNote : (part.note || null)
                                                    )}
                                                    style={{ padding: '6px 12px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    Update
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── PO / Billing ── */}
                <div style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div
                        style={accordionHeaderStyle(openSection.has('po'))}
                        onClick={() => toggleSection('po')}
                    >
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: '700' }}>PO / Billing</div>
                            {!openSection.has('po') && (
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                    PO {job.po_number || '—'} · Tax {job.tax || '—'}
                                </div>
                            )}
                        </div>
                        <span style={{ color: '#888' }}>{openSection.has('po') ? '▲' : '▼'}</span>
                    </div>
                    {openSection.has('po') && (
                        <div style={{ padding: '16px', backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0' }}>
                            {accessLevel >= 2 ? (
                                <form onSubmit={(e) => { e.preventDefault(); handleUpdatePo(); }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '12px', color: '#888', minWidth: '80px' }}>PO Number</span>
                                                <input className="po-input" type="text" name="poNum" placeholder="PO Number" value={poDetails.poNum} onChange={handlePoChange} style={{ flex: 1, padding: '5px 8px', fontSize: '13px' }} />
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '12px', color: '#888', minWidth: '80px' }}>PO Date</span>
                                                <input className="po-input" type="date" name="poDate" value={poDetails.poDate} onChange={handlePoChange} style={{ flex: 1, padding: '5px 8px', fontSize: '13px' }} />
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '12px', color: '#888', minWidth: '80px' }}>Due Date</span>
                                                <input className="po-input" type="date" name="dueDate" value={poDetails.dueDate} onChange={handlePoChange} style={{ flex: 1, padding: '5px 8px', fontSize: '13px' }} />
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '12px', color: '#888', minWidth: '80px' }}>Tax Code</span>
                                                <input className="po-input" type="text" name="taxCode" placeholder="Tax Code" value={poDetails.taxCode} onChange={handlePoChange} style={{ flex: 1, padding: '5px 8px', fontSize: '13px' }} />
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '12px', color: '#888', minWidth: '80px' }}>Tax</span>
                                                <input className="po-input" type="number" name="tax" placeholder="Tax" value={poDetails.tax} onChange={handlePoChange} style={{ flex: 1, padding: '5px 8px', fontSize: '13px' }} />
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '12px', color: '#888', minWidth: '80px' }}>Tax %</span>
                                                <input className="po-input" type="number" name="taxPercent" placeholder="%" value={poDetails.taxPercent} onChange={handlePoChange} style={{ flex: 1, padding: '5px 8px', fontSize: '13px' }} />
                                            </label>
                                    </div>
                                    <div style={{ marginTop: '14px' }}>
                                        <button type="submit" style={{ padding: '7px 20px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Update PO</button>
                                    </div>
                                </form>
                            ) : (
                                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Insufficient permissions to edit PO details.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Notes ── */}
                <div style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div
                        style={accordionHeaderStyle(openSection.has('notes'))}
                        onClick={() => toggleSection('notes')}
                    >
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: '700' }}>Notes</div>
                            {!openSection.has('notes') && (
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                    {notes.length > 0 ? `${notes.length} note${notes.length !== 1 ? 's' : ''}` : 'No notes'}
                                </div>
                            )}
                        </div>
                        <span style={{ color: '#888' }}>{openSection.has('notes') ? '▲' : '▼'}</span>
                    </div>
                    {openSection.has('notes') && (
                        <div
                            style={{ padding: '16px', backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0' }}
                            onDrop={handleNoteDrop}
                            onDragOver={handleNoteDragOver}
                        >
                            <textarea
                                className="notes-textarea"
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                placeholder="Add a new note... (drag & drop files below)"
                                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '8px' }}
                            />
                            {noteFilesToUpload.length > 0 && (
                                <div style={{ marginBottom: '10px' }}>
                                    <strong style={{ fontSize: '12px', color: '#555' }}>Files to upload:</strong>
                                    {noteFilesToUpload.map((file, index) => (
                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                            <span style={{ fontSize: '12px' }}>{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                                            <button
                                                type="button"
                                                onClick={() => removeNoteFile(index)}
                                                style={{ padding: '2px 8px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={handleAddNote}
                                style={{ padding: '7px 18px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', marginBottom: '16px' }}
                            >
                                Add Note
                            </button>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {notes.map((note) => (
                                    <li key={note.id} style={{ marginBottom: '12px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fafaf8' }}>
                                        <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>{note.content}</p>
                                        <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#888' }}>
                                            <strong>Status:</strong> {note.status}&nbsp;·&nbsp;<strong>Created:</strong> {new Date(note.created_at).toLocaleString()}
                                        </p>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <button onClick={() => handleUpdateNoteStatus(note.id, 'acknowledged')} style={{ padding: '4px 10px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Acknowledge</button>
                                            <button onClick={() => handleUpdateNoteStatus(note.id, 'done')} style={{ padding: '4px 10px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Mark as Done</button>
                                            {accessLevel >= 2 && (
                                                <button onClick={() => handleDeleteNote(note.id)} style={{ padding: '4px 10px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                                            )}
                                        </div>
                                        {note.files.length > 0 && (
                                            <div style={{ marginTop: '10px' }}>
                                                <strong style={{ fontSize: '12px', color: '#555' }}>Files:</strong>
                                                <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0 0', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {note.files.map((file) => (
                                                        <li key={file.id} style={{ display: 'flex', gap: '4px' }}>
                                                            <button onClick={() => handleNoteFileClick(file)} style={{ padding: '3px 10px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                                                {file.filename} ({(file.size / 1024).toFixed(2)} KB)
                                                            </button>
                                                            {file.previewUrl && (
                                                                <button onClick={() => handleFilePreview(file.previewUrl)} style={{ padding: '3px 10px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Preview</button>
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
                    )}
                </div>

                {/* ── Expenses ── */}
                {accessLevel >= 2 && <div style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <div
                        style={accordionHeaderStyle(openSection.has('expenses'))}
                        onClick={() => toggleSection('expenses')}
                    >
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: '700' }}>Expenses</div>
                            {!openSection.has('expenses') && (
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                    {expenses.length > 0
                                        ? `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} · $${expensesTotal.toFixed(2)}`
                                        : 'No expenses'}
                                </div>
                            )}
                        </div>
                        <span style={{ color: '#888' }}>{openSection.has('expenses') ? '▲' : '▼'}</span>
                    </div>
                    {openSection.has('expenses') && (
                        <div style={sectionBodyStyle}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                                <button
                                    onClick={() => setShowExpenseForm(prev => !prev)}
                                    style={{ padding: '7px 14px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                                >
                                    {showExpenseForm ? 'Cancel' : '+ Add Expense'}
                                </button>
                            </div>
                            {showExpenseForm && (
                                <form onSubmit={handleCreateExpense} style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <input type="text" placeholder="Description *" value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} required />
                                    <input type="text" placeholder="Vendor" value={newExpense.vendor} onChange={(e) => setNewExpense({ ...newExpense, vendor: e.target.value })} />
                                    <input type="number" placeholder="Amount *" step="0.01" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} required />
                                    <input type="date" placeholder="Date *" value={newExpense.expense_date} onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })} required />
                                    <input type="text" placeholder="Category" value={newExpense.category} onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })} />
                                    <input type="text" placeholder="Notes" value={newExpense.notes} onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })} />
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <button type="submit" style={{ backgroundColor: '#2a6b2a', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer' }}>Create Expense</button>
                                    </div>
                                </form>
                            )}
                            {expenses.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {expenses.map(expense => (
                                        <div key={expense.id} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '12px', backgroundColor: '#fafaf8', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#888' }}>
                                                Description
                                                <input type="text" value={expense.description} onChange={(e) => handleExpenseFieldChange(expense.id, 'description', e.target.value)} style={{ fontSize: '13px', padding: '4px 6px' }} />
                                            </label>
                                            <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#888' }}>
                                                Vendor
                                                <input type="text" value={expense.vendor || ''} onChange={(e) => handleExpenseFieldChange(expense.id, 'vendor', e.target.value)} style={{ fontSize: '13px', padding: '4px 6px' }} />
                                            </label>
                                            <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#888' }}>
                                                Amount
                                                <input type="number" step="0.01" value={expense.amount} onChange={(e) => handleExpenseFieldChange(expense.id, 'amount', e.target.value)} style={{ fontSize: '13px', padding: '4px 6px' }} />
                                            </label>
                                            <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#888' }}>
                                                Date
                                                <input type="date" value={expense.expense_date ? expense.expense_date.split('T')[0] : ''} onChange={(e) => handleExpenseFieldChange(expense.id, 'expense_date', e.target.value)} style={{ fontSize: '13px', padding: '4px 6px' }} />
                                            </label>
                                            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                <button onClick={() => handleUpdateExpense(expense)} style={{ flex: 1, backgroundColor: '#2a6b2a', color: '#fff', border: 'none', padding: '7px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Save</button>
                                                <button onClick={() => handleDeleteExpense(expense.id)} style={{ flex: 1, backgroundColor: '#f44336', color: 'white', border: 'none', padding: '7px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: '#666', fontSize: '13px' }}>No expenses recorded for this job.</p>
                            )}
                        </div>
                    )}
                </div>}

            </div>

            {/* ── Footer Action Bar ── */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
                backgroundColor: '#f0f0ec', borderTop: '1.5px solid #ddd',
                padding: '8px 16px', display: 'flex', gap: '8px', alignItems: 'center',
            }}>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowExportMenu(p => !p)}
                        style={{ padding: '8px 14px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                        Export ▾
                    </button>
                    {showExportMenu && (
                        <div style={{
                            position: 'absolute', bottom: 'calc(100% + 4px)', left: 0,
                            backgroundColor: '#fff', border: '1px solid #ddd',
                            borderRadius: '6px', boxShadow: '0 -4px 12px rgba(0,0,0,0.12)',
                            zIndex: 200, minWidth: '180px', overflow: 'hidden',
                        }}>
                            {[
                                ['Quote', 'exportQuote'],
                                ['Order', 'exportOrder'],
                                ['Shop Order', 'exportShopOrder'],
                                ['Invoice', 'exportInvoice'],
                                ['Packing List', 'exportPackList'],
                                ['Shipping', 'exportShipping'],
                            ].map(([label, action]) => (
                                <button key={action} onClick={() => { triggerExport(action); setShowExportMenu(false); }}
                                    style={{ display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderBottom: '1px solid #1e4f1e', cursor: 'pointer', fontSize: '13px' }}>
                                    {label}
                                </button>
                            ))}
                            <button onClick={() => { handlePopulateSheet(); setShowExportMenu(false); }}
                                style={{ display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>
                                Populate Google Sheet
                            </button>
                        </div>
                    )}
                </div>
                {accessLevel >= 2 && (
                    <button
                        onClick={handleUpdateInvoiceAndIncrement}
                        style={{ padding: '8px 14px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                        Update Invoice
                    </button>
                )}
                <button
                    onClick={isCurrentJobStarred ? handleUnstarJob : handleStarJob}
                    style={{ padding: '8px 14px', backgroundColor: '#2a6b2a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', marginLeft: 'auto' }}
                >
                    {isCurrentJobStarred ? '☆ Unstar' : '⭐ Star'}
                </button>
            </div>

            {/* ── Add Part Modal ── */}
            {showAddPartModal && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1000,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                    }}
                    onClick={() => setShowAddPartModal(false)}
                >
                    <div
                        style={{
                            backgroundColor: 'white', padding: '20px', borderRadius: '8px',
                            maxWidth: '600px', maxHeight: '80vh', overflow: 'auto', position: 'relative',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setShowAddPartModal(false)}
                            style={{
                                position: 'absolute', top: '10px', right: '10px',
                                backgroundColor: '#f44336', color: 'white', border: 'none',
                                borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontSize: '16px',
                            }}
                        >
                            ×
                        </button>
                        <AddPart
                            jobId={id}
                            onPartAdded={(newPart) => {
                                handlePartAdded(newPart);
                                setShowAddPartModal(false);
                                fetchJobDetails();
                            }}
                        />
                    </div>
                </div>
            )}

        </div>
    );
};

export default Job;
