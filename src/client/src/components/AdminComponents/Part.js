import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { jwtDecode } from 'jwt-decode';
import '../Styling/RequestDetails.css';
import Navbar from "../Navbar";

const Part = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;

    const { id } = useParams();
    const [files, setFiles] = useState([]);
    const [newFiles, setNewFiles] = useState([]);
    const [number, setNumber] = useState('');
    const [description, setDescription] = useState('');
    const [jobs, setJobs] = useState([]);

    const navigate = useNavigate();

    const fetchDetails = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/getpart?id=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await response.json();
            setNumber(data.number || '');
            setDescription(data.description || '');
        } catch (e) {
            console.error(e);
        }
    }, [id, token]);

    const fetchFiles = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/getblob?partID=${id}`, {
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

            setFiles(mappedFiles);
        } catch (e) {
            console.error(e);
        }
    }, [id, token]);

    const fetchJobs = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/getjobs?partId=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Ensure data is an array before setting jobs
            if (Array.isArray(data)) {
                setJobs(data);
            } else {
                console.error('Expected array but received:', data);
                setJobs([]);
            }
        } catch (e) {
            console.error('Error fetching jobs:', e);
            setJobs([]); // Set to empty array on error
        }
    }, [id, token]);

    useEffect(() => {
        fetchDetails();
        fetchFiles();
        fetchJobs();
    }, [fetchDetails, fetchFiles, fetchJobs]);

    const handleDetailSave = async () => {
        try {
            await fetch(`${process.env.REACT_APP_URL}/internal/part/updatepart`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id, number, description}),
            });
        } catch (e) {
            console.error(e);
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

    const handleFileDrop = (e) => {
        e.preventDefault();
        setNewFiles([...newFiles, ...e.dataTransfer.files]);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleFileUpload = async () => {
        try {
            for (let i = 0; i < newFiles.length; i++) {
                const formData = new FormData();
                formData.append('files', newFiles[i]);
                const fileResponse = await fetch(`${process.env.REACT_APP_URL}/internal/part/uploadblob?id=${id}`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!fileResponse.ok) {
                    throw new Error('File upload failed');
                }
            }
            setNewFiles([]);
            fetchFiles();
        } catch (error) {
            console.error('Error uploading file:', error);
            alert(`Failed to upload file. ${error.message}`);
        }
    };

    const handleFilePreview = (url) => {
        const newTab = window.open(url, '_blank');
        if (newTab) {
            newTab.focus();
        } else {
            alert('Unable to open preview. Please allow pop-ups for this site.');
        }
    }

    const handleDeletePart = async () => {
        if (window.confirm("Are you sure you want to delete this part? This action cannot be undone.")) {
            try {
                // Delete all associated files
                for (const file of files) {
                    const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/deleteblob?fileID=${file.fileID}`, {
                        method: 'DELETE',
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to delete file with ID: ${file.fileID}`);
                    }
                }

                // Delete the part
                const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/deletepart?id=${id}`, {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to delete part');
                }

                alert('Part and associated files deleted successfully');
                navigate('/partlist');
            } catch (error) {
                console.error('Error deleting part or files:', error);
                alert('Failed to delete part or associated files. Please try again.');
            }
        }
    };

    useEffect(() => {
        return () => {
            files.forEach(file => {
                if (file.previewUrl) {
                    URL.revokeObjectURL(file.previewUrl);
                }
            });
        };
    }, [files]);

    return (
        <div className="request-details" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <Navbar />
            
            {/* Header Section */}
            <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                    onClick={() => navigate(-1)}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    ← Back
                </button>
                <h2 style={{ margin: 0, color: '#333' }}>Part Details</h2>
                <div style={{ width: '80px' }}></div> {/* Spacer for centering */}
            </div>

            {/* Part Details Form */}
            <div style={{
                backgroundColor: '#f8f9fa',
                padding: '30px',
                borderRadius: '8px',
                border: '1px solid #dee2e6',
                marginBottom: '30px'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '25px', color: '#333' }}>Edit Part Information</h3>
                <form onSubmit={(e) => { e.preventDefault(); handleDetailSave(); }}>
                    <div style={{ marginBottom: '20px' }}>
                        <label 
                            htmlFor="number" 
                            style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontWeight: 'bold',
                                color: '#555'
                            }}
                        >
                            Part Number 부품 번호
                        </label>
                        <input
                            id="number"
                            type="text"
                            value={number}
                            onChange={(e) => setNumber(e.target.value)}
                            placeholder="Enter part number"
                            style={{
                                width: '100%',
                                padding: '12px',
                                fontSize: '14px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '25px' }}>
                        <label 
                            htmlFor="description" 
                            style={{ 
                                display: 'block', 
                                marginBottom: '8px', 
                                fontWeight: 'bold',
                                color: '#555'
                            }}
                        >
                            Description 설명
                        </label>
                        <textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter part description"
                            rows="4"
                            style={{
                                width: '100%',
                                padding: '12px',
                                fontSize: '14px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                boxSizing: 'border-box',
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button 
                            type="submit"
                            style={{
                                padding: '12px 24px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 'bold'
                            }}
                        >
                            Save Details 구하다
                        </button>

                        {accessLevel > 1 && (
                            <button 
                                type="button"
                                onClick={handleDeletePart} 
                                style={{ 
                                    padding: '12px 24px',
                                    backgroundColor: '#dc3545', 
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                Delete Part
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* Associated Jobs Section */}
            <div style={{
                backgroundColor: '#fff',
                padding: '30px',
                borderRadius: '8px',
                border: '1px solid #dee2e6',
                marginBottom: '30px'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Associated Jobs</h3>
                {!Array.isArray(jobs) || jobs.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>No associated jobs found</p>
                ) : (
                    <div style={{ display: 'grid', gap: '15px' }}>
                        {jobs.map((job, index) => (
                            <div key={index} style={{ 
                                border: '1px solid #ddd', 
                                borderRadius: '8px', 
                                padding: '20px',
                                backgroundColor: '#f9f9f9'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <button 
                                            onClick={() => navigate(`/job/${job.job_id}`)}
                                            style={{
                                                padding: '8px 16px',
                                                backgroundColor: '#007bff',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            Job #{job.job_number}
                                        </button>
                                    </div>
                                    <div style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                                        gap: '15px', 
                                        fontSize: '14px',
                                        flex: 1,
                                        marginLeft: '20px'
                                    }}>
                                        {job.price && (
                                            <div style={{ 
                                                padding: '8px',
                                                backgroundColor: '#e9ecef',
                                                borderRadius: '4px'
                                            }}>
                                                <strong>Price:</strong> ${job.price}
                                            </div>
                                        )}
                                        {job.quantity && (
                                            <div style={{ 
                                                padding: '8px',
                                                backgroundColor: '#e9ecef',
                                                borderRadius: '4px'
                                            }}>
                                                <strong>Quantity:</strong> {job.quantity}
                                            </div>
                                        )}
                                        {job.rev && (
                                            <div style={{ 
                                                padding: '8px',
                                                backgroundColor: '#e9ecef',
                                                borderRadius: '4px'
                                            }}>
                                                <strong>Rev:</strong> {job.rev}
                                            </div>
                                        )}
                                        {job.details && (
                                            <div style={{ 
                                                padding: '8px',
                                                backgroundColor: '#e9ecef',
                                                borderRadius: '4px'
                                            }}>
                                                <strong>Details:</strong> {job.details}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Files Section */}
            <div style={{
                backgroundColor: '#fff',
                padding: '30px',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Files</h3>
                
                {files.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>No files available</p>
                ) : (
                    <div style={{ marginBottom: '30px' }}>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {files.map((file, index) => (
                                <div key={index} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px',
                                    backgroundColor: '#f8f9fa',
                                    border: '1px solid #dee2e6',
                                    borderRadius: '5px'
                                }}>
                                    <span style={{ fontSize: '14px', color: '#333' }}>
                                        {file.filename} ({(file.size / 1024).toFixed(2)} KB)
                                    </span>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            onClick={() => handleFileClick(file)}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#17a2b8',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            Download
                                        </button>
                                        {file.previewUrl && (
                                            <button 
                                                onClick={() => handleFilePreview(file.previewUrl)}
                                                style={{
                                                    padding: '6px 12px',
                                                    backgroundColor: '#6f42c1',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px'
                                                }}
                                            >
                                                Preview
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* File Upload Section */}
                <div style={{ marginTop: '25px' }}>
                    <h4 style={{ marginBottom: '15px', color: '#333' }}>Upload New Files</h4>
                    <div
                        onDrop={handleFileDrop}
                        onDragOver={handleDragOver}
                        style={{ 
                            border: '2px dashed #007bff', 
                            padding: '40px 20px', 
                            marginBottom: '15px',
                            borderRadius: '8px',
                            textAlign: 'center',
                            backgroundColor: '#f8f9ff',
                            color: '#007bff',
                            fontSize: '16px'
                        }}
                    >
                        📁 Drag and drop new files here or click to select
                    </div>

                    {newFiles.length > 0 && (
                        <div style={{ 
                            padding: '20px',
                            backgroundColor: '#e7f3ff',
                            border: '1px solid #b3d9ff',
                            borderRadius: '5px',
                            marginBottom: '15px'
                        }}>
                            <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>Files Ready to Upload:</h4>
                            <div style={{ display: 'grid', gap: '8px', marginBottom: '15px' }}>
                                {newFiles.map((file, index) => (
                                    <div key={index} style={{ 
                                        fontSize: '14px',
                                        padding: '8px',
                                        backgroundColor: '#fff',
                                        borderRadius: '3px'
                                    }}>
                                        📄 {file.name} ({(file.size / 1024).toFixed(2)} KB)
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={handleFileUpload}
                                style={{
                                    padding: '10px 20px',
                                    backgroundColor: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                Upload Files
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Part;
