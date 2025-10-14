import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import AddPart from './AddPart';
import '../Styling/Job.css';
import { jwtDecode } from 'jwt-decode';
import TopBar from './TopBar';
import NotesSection from './NotesSection';

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

    // Task-related state
    const [partTasks, setPartTasks] = useState({}); // Store tasks for each job_part_id
    const [newTask, setNewTask] = useState({
        job_part_id: null,
        name: '',
        numerator: '',
        denominator: '',
        note: ''
    });
    const [showTaskForm, setShowTaskForm] = useState(null); // Track which part's form is shown

    // Add part modal state
    const [showAddPartModal, setShowAddPartModal] = useState(false);

    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;
    const userId = decodedToken?.id;
    const [starredJobs, setStarredJobs] = useState([]);

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

    const fetchStarredJobs = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/getstarredjobs`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await res.json();
            if (res.status === 200) {
                setStarredJobs(data.map(job => job.job_id));
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

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

    useEffect(() => {
        fetchJobDetails();
        fetchStarredJobs();
    }, [fetchJobDetails, fetchStarredJobs]);

    useEffect(() => {
        // Fetch files for each part when parts are loaded
        parts.forEach(part => {
            fetchPartFiles(part.id);
        });
    }, [parts, fetchPartFiles]);

    // Task management functions
    const fetchTasks = useCallback(async (jobPartId) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/tasks/gettasks?job_part_id=${jobPartId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                setPartTasks(prev => ({
                    ...prev,
                    [jobPartId]: data
                }));
            } else {
                console.error('Failed to fetch tasks');
            }
        } catch (e) {
            console.error('Error fetching tasks:', e);
        }
    }, [token]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        
        if (!newTask.name.trim()) {
            alert('Task name is required');
            return;
        }

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/tasks/newtask`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    job_part_id: newTask.job_part_id,
                    name: newTask.name,
                    numerator: newTask.numerator ? parseInt(newTask.numerator) : null,
                    denominator: newTask.denominator ? parseInt(newTask.denominator) : null,
                    note: newTask.note || null
                }),
            });

            if (response.ok) {
                alert('Task created successfully');
                setNewTask({ job_part_id: null, name: '', numerator: '', denominator: '', note: '' });
                setShowTaskForm(null);
                fetchTasks(newTask.job_part_id);
            } else {
                const errorData = await response.json();
                alert(`Failed to create task: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error creating task:', e);
            alert('Error creating task');
        }
    };

    const handleUpdateTaskProgress = async (jobPartId, taskId, currentNumerator, denominator) => {
        const newNumerator = prompt(`Update progress for this task (current: ${currentNumerator}/${denominator}):`);
        
        if (newNumerator === null) return; // User cancelled
        
        const numeratorValue = parseInt(newNumerator);
        
        if (isNaN(numeratorValue) || numeratorValue < 0) {
            alert('Please enter a valid number greater than or equal to 0');
            return;
        }

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/tasks/updateprogress`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    job_part_id: jobPartId,
                    task_id: taskId,
                    numerator: numeratorValue
                }),
            });

            if (response.ok) {
                alert('Task progress updated successfully');
                fetchTasks(jobPartId);
            } else {
                const errorData = await response.json();
                alert(`Failed to update progress: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error updating task progress:', e);
            alert('Error updating task progress');
        }
    };

    const handleDeleteTask = async (jobPartId, taskId, taskName) => {
        if (!window.confirm(`Are you sure you want to delete the task "${taskName}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/tasks/deletetask?job_part_id=${jobPartId}&task_id=${taskId}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                alert('Task deleted successfully');
                fetchTasks(jobPartId);
            } else {
                const errorData = await response.json();
                alert(`Failed to delete task: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error deleting task:', e);
            alert('Error deleting task');
        }
    };

    const calculateProgress = (numerator, denominator) => {
        if (!numerator || !denominator || denominator === 0) return 0;
        return Math.round((numerator / denominator) * 100);
    };

    useEffect(() => {
        // Fetch tasks for each part when parts are loaded
        parts.forEach(part => {
            if (part.job_part_id) {
                fetchTasks(part.job_part_id);
            }
        });
    }, [parts, fetchTasks]);

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
            // Format the title
            const eventTitle = `${jobData.job_number}_${jobData.attention}`;
            
            // Format the description with attention and part numbers
            let eventDescription = jobData.attention || '';
            if (partsData && partsData.length > 0) {
                eventDescription += '\n\nParts:\n';
                partsData.forEach(part => {
                    eventDescription += `${part.number}\n`;
                });
            }

            // Format dates for all-day events (YYYY-MM-DD format)
            const formatDateForCalendar = (dateString) => {
                if (!dateString) return null;
                const date = new Date(dateString);
                return date.toISOString().split('T')[0]; // Get YYYY-MM-DD format
            };

            const startDate = formatDateForCalendar(poDate);
            const endDate = formatDateForCalendar(dueDate);

            if (!startDate || !endDate) {
                console.warn('PO Date or Due Date missing, skipping calendar event creation');
                return;
            }

            // Create calendar event
            const eventData = {
                summary: eventTitle,
                description: eventDescription,
                startDate: startDate,
                endDate: endDate,
                allDay: true,
                calendarId: 'primary'
            };

            console.log('Creating calendar event:', eventData);

            const response = await fetch(`${process.env.REACT_APP_URL}/internal/calendar/events`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(eventData),
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Calendar event created successfully:', result);
                return result;
            } else {
                const errorData = await response.json();
                console.error('Failed to create calendar event:', errorData);
                // Don't throw error - calendar creation is optional
            }
        } catch (error) {
            console.error('Error creating calendar event:', error);
            // Don't throw error - calendar creation is optional
        }
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
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 201) {
                alert('Job starred successfully!');
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
                setStarredJobs((prev) => prev.filter((jobId) => jobId !== id));
            } else {
                console.error(data);
                alert('Failed to unstar the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while unstarring the job.');
        }
    };

    const handleUpdateJobPartJoin = async (partId, newQuantity, newPrice, newRev, newDetails) => {
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
                    details: newDetails
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
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    if (!job) return (
        <div>
            <Navbar />
            <div className="centered-button-container">
                <button onClick={() => navigate('/')}>Session expired, click to return home</button>
            </div>
        </div>
    );

    return (
        <div className="job-page">
            <Navbar />
            <TopBar 
                accessLevel={accessLevel} 
                job={job} 
                parts={parts} 
                token={token} 
            />
            <button className="top-bar-button" onClick={handleCosts}>Costs 가격</button>
            {accessLevel >= 2 && (
                <div>
                    <button className="top-bar-button" onClick={handleUpdateInvoiceAndIncrement}>Update Invoice</button>
                    {starredJobs.includes(id) ? (
                        <button className="top-bar-button" onClick={handleUnstarJob}>Unstar Job</button>
                    ) : (
                        <button className="top-bar-button" onClick={handleStarJob}>Star Job</button>
                    )}
                    <button 
                        className="top-bar-button" 
                        onClick={() => setShowAddPartModal(true)}
                        style={{ backgroundColor: '#4CAF50' }}
                    >
                        Add Part
                    </button>
                </div>
            )}
            <div className="job-notes-container">
                <div className="job-details">
                    <h2>직무번호 Job #{job.job_number}</h2>
                    <p><strong>Attention 담당자:</strong> {job.attention}</p>
                    <p><strong>Company 회사:</strong> {job.company_name}</p>
                    <p><strong>Created 생성 날짜:</strong> {formatDate(job.created_at)}</p>
                    <p><strong>PO Number:</strong> {job.po_number || '—'}</p>
                    <p><strong>PO Date:</strong> {formatDate(job.po_date) || '—'}</p>
                    <p><strong>Due Date 만기일:</strong> {formatDate(job.due_date) || '—'}</p>
                    <p><strong>Tax Code:</strong> {job.tax_code || '—'}</p>
                    <p><strong>Tax:</strong> {job.tax || '—'}</p>
                    <p><strong>Tax Percent:</strong> {job.tax_percent || '—'}</p>
                    <p><strong>Invoice Number:</strong> {job.invoice_number || '—'}</p>
                    <p><strong>Invoice Date:</strong> {formatDate(job.due_date) || '—'}</p>
                    <p><strong>Subtotal:</strong> {job.subtotal || '—'}</p>
                    <p><strong>Total:</strong> {job.total_cost || '—'}</p>
                </div>
                <NotesSection 
                    jobId={id} 
                    userId={userId} 
                    token={token} 
                    accessLevel={accessLevel} 
                />
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
                <h3>Parts in Job 부분품</h3>
                <div style={{ display: 'grid', gap: '20px' }}>
                    {parts.map(part => (
                        <div key={part.id} style={{ 
                            border: '1px solid #ddd', 
                            borderRadius: '8px', 
                            padding: '20px',
                            backgroundColor: '#fff',
                            display: 'grid',
                            gridTemplateColumns: '300px 1fr 200px',
                            gap: '20px',
                            alignItems: 'start'
                        }}>
                            {/* Left Column - Part Details */}
                            <div>
                                <h4 style={{ margin: '0 0 15px 0', cursor: 'pointer' }} onClick={() => handlePartClick(part.id)}>
                                    {part.number}
                                </h4>
                                
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    <div>
                                        <strong>Rev:</strong>
                                        {accessLevel >= 1 ? (
                                            <input
                                                type="text"
                                                defaultValue={part.rev}
                                                onChange={(e) => part.newRev = e.target.value}
                                                style={{ width: '80px', marginLeft: '10px' }}
                                            />
                                        ) : (
                                            <span style={{ marginLeft: '10px' }}>{part.rev}</span>
                                        )}
                                    </div>
                                    
                                    <div>
                                        <strong>Details:</strong>
                                        {accessLevel >= 1 ? (
                                            <input
                                                type="text"
                                                defaultValue={part.details}
                                                onChange={(e) => part.newDetails = e.target.value}
                                                style={{ width: '200px', marginLeft: '10px' }}
                                            />
                                        ) : (
                                            <span style={{ marginLeft: '10px' }}>{part.details}</span>
                                        )}
                                    </div>
                                    
                                    <div>
                                        <strong>Qty:</strong>
                                        {accessLevel >= 1 ? (
                                            <input
                                                type="number"
                                                defaultValue={part.quantity}
                                                min="1"
                                                onChange={(e) => part.newQuantity = parseInt(e.target.value, 10)}
                                                style={{ width: '60px', marginLeft: '10px' }}
                                            />
                                        ) : (
                                            <span style={{ marginLeft: '10px' }}>{part.quantity}</span>
                                        )}
                                    </div>
                                    
                                    <div>
                                        <strong>Unit Price:</strong>
                                        {accessLevel >= 1 ? (
                                            <input
                                                type="number"
                                                step="0.01"
                                                defaultValue={part.price}
                                                onChange={(e) => part.newPrice = parseFloat(e.target.value)}
                                                style={{ width: '80px', marginLeft: '10px' }}
                                            />
                                        ) : (
                                            <span style={{ marginLeft: '10px' }}>${part.price}</span>
                                        )}
                                    </div>
                                    {accessLevel >= 1 && (
                                    <button
                                        className="update-quantity-button"
                                        onClick={() => handleUpdateJobPartJoin(
                                            part.id, 
                                            part.newQuantity || part.quantity,
                                            part.newPrice || part.price,
                                            part.newRev || part.rev,
                                            part.newDetails || part.details
                                        )}
                                        style={{ fontSize: '12px', padding: '8px 12px' }}
                                    >
                                        Update 변화
                                    </button>
                                )}
                                </div>
                            </div>

                            {/* Middle Column - Tasks */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                    <h5 style={{ margin: 0 }}>Tasks</h5>
                                    <button 
                                        onClick={() => {
                                            if (showTaskForm === part.job_part_id) {
                                                setShowTaskForm(null);
                                            } else {
                                                setShowTaskForm(part.job_part_id);
                                                setNewTask({ ...newTask, job_part_id: part.job_part_id });
                                            }
                                        }}
                                        style={{ 
                                            backgroundColor: '#4CAF50', 
                                            color: 'white',
                                            border: 'none',
                                            padding: '5px 10px',
                                            borderRadius: '3px',
                                            fontSize: '12px'
                                        }}
                                    >
                                        {showTaskForm === part.job_part_id ? 'Cancel' : 'Add Task'}
                                    </button>
                                </div>

                                {/* Add Task Form */}
                                {showTaskForm === part.job_part_id && (
                                    <form onSubmit={handleCreateTask} style={{ 
                                        backgroundColor: '#f9f9f9', 
                                        padding: '15px', 
                                        borderRadius: '5px', 
                                        marginBottom: '15px' 
                                    }}>
                                        <div style={{ display: 'grid', gap: '10px' }}>
                                            <input
                                                type="text"
                                                placeholder="Task Name *"
                                                value={newTask.name}
                                                onChange={(e) => setNewTask({...newTask, name: e.target.value})}
                                                required
                                                style={{ fontSize: '12px' }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Current Progress"
                                                value={newTask.numerator}
                                                onChange={(e) => setNewTask({...newTask, numerator: e.target.value})}
                                                min="0"
                                                style={{ fontSize: '12px' }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Total Goal"
                                                value={newTask.denominator}
                                                onChange={(e) => setNewTask({...newTask, denominator: e.target.value})}
                                                min="1"
                                                style={{ fontSize: '12px' }}
                                            />
                                            <textarea
                                                placeholder="Notes (optional)"
                                                value={newTask.note}
                                                onChange={(e) => setNewTask({...newTask, note: e.target.value})}
                                                rows="2"
                                                style={{ fontSize: '12px' }}
                                            />
                                        </div>
                                        <button type="submit" style={{ 
                                            backgroundColor: '#4CAF50', 
                                            color: 'white',
                                            border: 'none',
                                            padding: '5px 10px',
                                            borderRadius: '3px',
                                            fontSize: '12px',
                                            marginTop: '10px'
                                        }}>
                                            Create Task
                                        </button>
                                    </form>
                                )}

                                {/* Tasks List */}
                                {partTasks[part.job_part_id] && partTasks[part.job_part_id].length > 0 ? (
                                    <div style={{ display: 'grid', gap: '10px' }}>
                                        {partTasks[part.job_part_id].map((task) => (
                                            <div key={task.id} style={{ 
                                                border: '1px solid #eee', 
                                                borderRadius: '5px', 
                                                padding: '10px',
                                                backgroundColor: '#fafafa',
                                                fontSize: '12px'
                                            }}>
                                                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{task.name}</div>
                                                
                                                {task.numerator !== null && task.denominator !== null && (
                                                    <div style={{ marginBottom: '5px' }}>
                                                        <div style={{ 
                                                            backgroundColor: '#e0e0e0', 
                                                            borderRadius: '10px', 
                                                            height: '15px',
                                                            position: 'relative'
                                                        }}>
                                                            <div style={{
                                                                backgroundColor: '#4CAF50',
                                                                height: '100%',
                                                                borderRadius: '10px',
                                                                width: `${calculateProgress(task.numerator, task.denominator)}%`,
                                                                transition: 'width 0.3s ease'
                                                            }}></div>
                                                            <span style={{
                                                                position: 'absolute',
                                                                top: '50%',
                                                                left: '50%',
                                                                transform: 'translate(-50%, -50%)',
                                                                fontSize: '10px',
                                                                fontWeight: 'bold'
                                                            }}>
                                                                {task.numerator}/{task.denominator}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {task.note && (
                                                    <div style={{ color: '#666', fontStyle: 'italic', marginBottom: '5px' }}>
                                                        {task.note}
                                                    </div>
                                                )}
                                                
                                                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                                                    {task.denominator && (
                                                        <button 
                                                            onClick={() => handleUpdateTaskProgress(part.job_part_id, task.id, task.numerator || 0, task.denominator)}
                                                            style={{ 
                                                                backgroundColor: '#2196F3', 
                                                                color: 'white', 
                                                                border: 'none', 
                                                                padding: '3px 6px',
                                                                borderRadius: '3px',
                                                                fontSize: '10px'
                                                            }}
                                                        >
                                                            Update
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleDeleteTask(part.job_part_id, task.id, task.name)}
                                                        style={{ 
                                                            backgroundColor: '#f44336', 
                                                            color: 'white', 
                                                            border: 'none', 
                                                            padding: '3px 6px',
                                                            borderRadius: '3px',
                                                            fontSize: '10px'
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>No tasks</p>
                                )}
                            </div>

                            {/* Right Column - Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                
                                
                                <button 
                                    className="remove-part-button" 
                                    onClick={() => handleRemovePart(part.id)}
                                    style={{ fontSize: '12px', padding: '8px 12px' }}
                                >
                                    Remove 삭제
                                </button>
                                
                                {partFiles[part.id] && partFiles[part.id]
                                    .filter(file => file.mimetype === 'application/pdf' && file.previewUrl)
                                    .map((file, index) => (
                                        <button 
                                            key={index}
                                            className="preview-button"
                                            onClick={() => handleFilePreview(file.previewUrl)}
                                            style={{ fontSize: '10px', padding: '4px 8px' }}
                                        >
                                            Preview {file.filename}
                                        </button>
                                    ))}
                            </div>
                        </div>
                    ))}
                </div>
                
                {/* Add Part Modal */}
                {showAddPartModal && (
                    <div 
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 1000,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                        onClick={() => setShowAddPartModal(false)}
                    >
                        <div 
                            style={{
                                backgroundColor: 'white',
                                padding: '20px',
                                borderRadius: '8px',
                                maxWidth: '600px',
                                maxHeight: '80vh',
                                overflow: 'auto',
                                position: 'relative'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowAddPartModal(false)}
                                style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    backgroundColor: '#f44336',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '30px',
                                    height: '30px',
                                    cursor: 'pointer',
                                    fontSize: '16px'
                                }}
                            >
                                ×
                            </button>
                            <AddPart 
                                jobId={id} 
                                onPartAdded={(newPart) => {
                                    handlePartAdded(newPart);
                                    setShowAddPartModal(false);
                                    fetchJobDetails(); // Refresh the job details to show the new part
                                }} 
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Job;
