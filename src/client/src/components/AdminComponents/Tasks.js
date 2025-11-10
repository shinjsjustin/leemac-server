import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import { jwtDecode } from 'jwt-decode';
import '../Styling/Tasks.css';

const Tasks = () => {
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterCompany, setFilterCompany] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [sortBy, setSortBy] = useState('due_date');
    const [sortOrder, setSortOrder] = useState('asc');

    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;

    const fetchAllTasks = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/tasks/alltasks`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setTasks(data);
                setError(null);
            } else {
                throw new Error('Failed to fetch tasks');
            }
        } catch (e) {
            console.error('Error fetching tasks:', e);
            setError('Failed to load tasks');
        } finally {
            setLoading(false);
        }
    }, [token]);

    const handleUpdateTaskNote = async (jobPartId, taskId, newNote) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/tasks/updatetask`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    job_part_id: jobPartId,
                    task_id: taskId,
                    note: newNote
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`Failed to update task note: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error updating task note:', e);
        }
    };

    const handleCompleteTask = async (jobPartId, taskId) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/tasks/completetask`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    job_part_id: jobPartId,
                    task_id: taskId
                }),
            });

            if (response.ok) {
                // Update the task in local state
                setTasks(prev => prev.map(task => 
                    task.task_id === taskId ? 
                    { ...task, numerator: task.denominator } : 
                    task
                ));
            } else {
                const errorData = await response.json();
                alert(`Failed to complete task: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error completing task:', e);
            alert('Error completing task');
        }
    };

    const handleUpdateTaskProgress = async (jobPartId, taskId, currentNumerator, denominator, taskName) => {
        const newNumerator = prompt(`Update progress for "${taskName}" (current: ${currentNumerator}/${denominator}):`);
        
        if (newNumerator === null) return;
        
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
                // Update the task in local state
                setTasks(prev => prev.map(task => 
                    task.task_id === taskId ? 
                    { ...task, numerator: numeratorValue } : 
                    task
                ));
            } else {
                const errorData = await response.json();
                alert(`Failed to update progress: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error updating task progress:', e);
            alert('Error updating task progress');
        }
    };

    const calculateProgress = (numerator, denominator) => {
        if (!numerator || !denominator || denominator === 0) return 0;
        return Math.round((numerator / denominator) * 100);
    };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US');
    };

    // Calculate overall metrics
    const calculateMetrics = () => {
        let materialTotal = { numerator: 0, denominator: 0 };
        let programmingTotal = { numerator: 0, denominator: 0 };
        let manufacturingTotal = { numerator: 0, denominator: 0 };
        let overallTotal = { numerator: 0, denominator: 0 };

        tasks.forEach(task => {
            if (task.numerator !== null && task.denominator !== null) {
                const taskNumerator = task.numerator || 0;
                const taskDenominator = task.denominator || 0;
                
                overallTotal.numerator += taskNumerator;
                overallTotal.denominator += taskDenominator;
                
                if (task.task_name === 'Material Procurement') {
                    materialTotal.numerator += taskNumerator;
                    materialTotal.denominator += taskDenominator;
                } else if (task.task_name === 'Program Check') {
                    programmingTotal.numerator += taskNumerator;
                    programmingTotal.denominator += taskDenominator;
                } else if (task.task_name === 'Manufacture') {
                    manufacturingTotal.numerator += taskNumerator;
                    manufacturingTotal.denominator += taskDenominator;
                }
            }
        });

        return {
            material: materialTotal,
            programming: programmingTotal,
            manufacturing: manufacturingTotal,
            total: overallTotal
        };
    };

    const renderMetricBar = (label, data, color) => {
        const percentage = data.denominator > 0 ? Math.round((data.numerator / data.denominator) * 100) : 0;
        
        return (
            <div key={label} style={{ marginBottom: '15px' }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '5px' 
                }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{label}</span>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                        {data.numerator}/{data.denominator} ({percentage}%)
                    </span>
                </div>
                <div style={{ 
                    backgroundColor: '#e0e0e0', 
                    borderRadius: '10px', 
                    height: '20px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        backgroundColor: color,
                        height: '100%',
                        borderRadius: '10px',
                        width: `${percentage}%`,
                        transition: 'width 0.3s ease'
                    }}></div>
                </div>
            </div>
        );
    };

    // Filter and sort tasks
    const getFilteredAndSortedTasks = () => {
        let filteredTasks = tasks;

        // Filter by company
        if (filterCompany) {
            filteredTasks = filteredTasks.filter(task => 
                task.company_name?.toLowerCase().includes(filterCompany.toLowerCase())
            );
        }

        // Filter by status
        if (filterStatus === 'completed') {
            filteredTasks = filteredTasks.filter(task => 
                task.numerator !== null && task.denominator !== null && task.numerator >= task.denominator
            );
        } else if (filterStatus === 'pending') {
            filteredTasks = filteredTasks.filter(task => 
                task.numerator === null || task.denominator === null || task.numerator < task.denominator
            );
        }

        // Sort tasks
        filteredTasks.sort((a, b) => {
            let aVal, bVal;
            
            switch (sortBy) {
                case 'due_date':
                    aVal = new Date(a.due_date || 0);
                    bVal = new Date(b.due_date || 0);
                    break;
                case 'company':
                    aVal = a.company_name || '';
                    bVal = b.company_name || '';
                    break;
                case 'job_number':
                    aVal = a.job_number || '';
                    bVal = b.job_number || '';
                    break;
                case 'part_number':
                    aVal = a.part_number || '';
                    bVal = b.part_number || '';
                    break;
                case 'task_name':
                    aVal = a.task_name || '';
                    bVal = b.task_name || '';
                    break;
                case 'progress':
                    aVal = calculateProgress(a.numerator, a.denominator);
                    bVal = calculateProgress(b.numerator, b.denominator);
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return filteredTasks;
    };

    const metrics = calculateMetrics();
    const filteredTasks = getFilteredAndSortedTasks();

    useEffect(() => {
        fetchAllTasks();
    }, [fetchAllTasks]);

    if (loading) {
        return (
            <div>
                <Navbar />
                <div style={{ padding: '20px', textAlign: 'center' }}>Loading tasks...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <Navbar />
                <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>{error}</div>
            </div>
        );
    }

    return (
        <div className="tasks-page">
            <Navbar />
            
            <div style={{ padding: '20px' }}>
                <h1>All Tasks</h1>

                {/* Metrics Section */}
                <div style={{
                    backgroundColor: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    marginBottom: '20px'
                }}>
                    <h3 style={{ margin: '0 0 20px 0', color: '#333' }}>Overall Progress Metrics</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                        {renderMetricBar('Material', metrics.material, '#FF6B6B')}
                        {renderMetricBar('Programming', metrics.programming, '#4ECDC4')}
                        {renderMetricBar('Manufacturing', metrics.manufacturing, '#45B7D1')}
                        {renderMetricBar('Total', metrics.total, '#96CEB4')}
                    </div>
                    
                    <div style={{ 
                        marginTop: '15px', 
                        paddingTop: '15px', 
                        borderTop: '1px solid #dee2e6',
                        fontSize: '12px',
                        color: '#666'
                    }}>
                        <div>Total Tasks: {tasks.length}</div>
                        <div>Completed Tasks: {tasks.filter(task => task.numerator !== null && task.denominator !== null && task.numerator >= task.denominator).length}</div>
                    </div>
                </div>

                {/* Filters and Controls */}
                <div style={{ 
                    display: 'flex', 
                    gap: '15px', 
                    marginBottom: '20px',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                }}>
                    <input
                        type="text"
                        placeholder="Filter by company..."
                        value={filterCompany}
                        onChange={(e) => setFilterCompany(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                    
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
                    >
                        <option value="all">All Tasks</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                    </select>
                    
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
                    >
                        <option value="due_date">Due Date</option>
                        <option value="company">Company</option>
                        <option value="job_number">Job Number</option>
                        <option value="part_number">Part Number</option>
                        <option value="task_name">Task Name</option>
                        <option value="progress">Progress</option>
                    </select>
                    
                    <button
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        style={{ 
                            padding: '8px 12px', 
                            borderRadius: '4px', 
                            border: '1px solid #ddd',
                            backgroundColor: '#f8f9fa'
                        }}
                    >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>

                    <button
                        onClick={fetchAllTasks}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Refresh
                    </button>
                </div>

                {/* Tasks Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ 
                        width: '100%', 
                        borderCollapse: 'collapse',
                        backgroundColor: 'white',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8f9fa' }}>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Company</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Job</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Part</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Task</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Progress</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Notes</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Due Date</th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.map((task) => (
                                <tr key={`${task.task_id}-${task.job_part_id}`} style={{ borderBottom: '1px solid #dee2e6' }}>
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{task.company_name}</div>
                                    </td>
                                    
                                    <td style={{ padding: '12px' }}>
                                        <div 
                                            style={{ 
                                                fontSize: '14px', 
                                                fontWeight: 'bold', 
                                                cursor: 'pointer',
                                                color: '#007bff'
                                            }}
                                            onClick={() => navigate(`/job/${task.job_number}`)}
                                        >
                                            {task.job_number}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>{task.attention}</div>
                                    </td>
                                    
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{task.part_number}</div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>{task.part_description}</div>
                                    </td>
                                    
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ fontSize: '14px' }}>{task.task_name}</div>
                                    </td>
                                    
                                    <td style={{ padding: '12px', minWidth: '150px' }}>
                                        {task.numerator !== null && task.denominator !== null ? (
                                            <div>
                                                <div style={{ 
                                                    backgroundColor: '#e0e0e0', 
                                                    borderRadius: '10px', 
                                                    height: '20px',
                                                    position: 'relative',
                                                    marginBottom: '5px'
                                                }}>
                                                    <div style={{
                                                        backgroundColor: task.numerator >= task.denominator ? '#4CAF50' : '#2196F3',
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
                                                        fontSize: '12px',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {task.numerator}/{task.denominator}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '12px', textAlign: 'center' }}>
                                                    {calculateProgress(task.numerator, task.denominator)}%
                                                </div>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '12px', color: '#666' }}>No progress set</span>
                                        )}
                                    </td>
                                    
                                    <td style={{ padding: '12px', maxWidth: '200px' }}>
                                        <textarea
                                            value={task.note || ''}
                                            onChange={(e) => {
                                                setTasks(prev => prev.map(t => 
                                                    t.task_id === task.task_id ? 
                                                    { ...t, note: e.target.value } : 
                                                    t
                                                ));
                                            }}
                                            onBlur={(e) => {
                                                handleUpdateTaskNote(task.job_part_id, task.task_id, e.target.value);
                                            }}
                                            placeholder="Add notes..."
                                            rows="2"
                                            style={{ 
                                                width: '100%', 
                                                fontSize: '12px',
                                                border: '1px solid #ddd',
                                                borderRadius: '4px',
                                                padding: '6px',
                                                resize: 'vertical'
                                            }}
                                        />
                                    </td>
                                    
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ fontSize: '14px' }}>{formatDate(task.due_date)}</div>
                                    </td>
                                    
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            {task.denominator && task.numerator < task.denominator && (
                                                <button 
                                                    onClick={() => handleCompleteTask(task.job_part_id, task.task_id)}
                                                    style={{ 
                                                        backgroundColor: '#4CAF50', 
                                                        color: 'white', 
                                                        border: 'none', 
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Complete
                                                </button>
                                            )}
                                            {task.denominator && (
                                                <button 
                                                    onClick={() => handleUpdateTaskProgress(
                                                        task.job_part_id, 
                                                        task.task_id, 
                                                        task.numerator || 0, 
                                                        task.denominator,
                                                        task.task_name
                                                    )}
                                                    style={{ 
                                                        backgroundColor: '#2196F3', 
                                                        color: 'white', 
                                                        border: 'none', 
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Update
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredTasks.length === 0 && (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '40px', 
                        color: '#666',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        marginTop: '20px'
                    }}>
                        No tasks found matching your filters.
                    </div>
                )}
            </div>
        </div>
    );
};

export default Tasks;
