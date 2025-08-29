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
    const [price, setPrice] = useState('');
    const [details, setDetails] = useState('');
    const [rev, setRev] = useState('');
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
            setPrice(data.price || '');
            setDetails(data.details || '');
            setRev(data.rev || '');
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
                body: JSON.stringify({ id, number, description, price, details, rev }),
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
        <div className="request-details">
            <Navbar />
            <button onClick={() => navigate(-1)}>Back</button>
            <h2>Part Details</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleDetailSave(); }}>
                <label htmlFor="number">Part Number 부품 번호</label>
                <input
                    id="number"
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Part Number"
                />
                <label htmlFor="description">Description 설명</label>
                <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description"
                />
                {accessLevel > 1 ? (
                    <div>
                        <label htmlFor="price">Price 단가</label>
                        <input
                            id="price"
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="Price"
                        />
                    </div>
                ) : (
                    <div>
                        <label htmlFor="price">Price 단가</label>
                        <input
                            id="price"
                            type="number"
                            value={price}
                            readOnly
                            placeholder="Price"
                        />
                    </div>
                )}
                <label htmlFor="details">Details 세부</label>
                <input
                    id="details"
                    type="text"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Details"
                />
                <label htmlFor="rev">Revision 개정</label>
                <input
                    id="rev"
                    type="text"
                    value={rev}
                    onChange={(e) => setRev(e.target.value)}
                    placeholder="Revision"
                />
                <button type="submit">Save Details 구하다</button>
            </form>
            {accessLevel > 1 && (
                <button onClick={handleDeletePart} style={{ backgroundColor: 'red', color: 'white' }}>
                    Delete Part
                </button>
            )}

            <h3>Associated Jobs</h3>
            {!Array.isArray(jobs) || jobs.length === 0 ? (
                <p>No associated jobs found</p>
            ) : (
                <ul>
                    {jobs.map((job, index) => (
                        <li key={index}>
                            <button onClick={() => navigate(`/job/${job.job_id}`)}>
                                Job #{job.job_number} - {job.company_name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <h3>Files</h3>
            {files.length === 0 ? (
                <p>No files available</p>
            ) : (
                <ul>
                    {files.map((file, index) => (
                        <li key={index}>
                            <button onClick={() => handleFileClick(file)}>
                                {file.filename} ({file.size} bytes)
                            </button>
                            {file.previewUrl && (
                                <button onClick={() => handleFilePreview(file.previewUrl)}>Preview</button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <div
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                style={{ border: '2px dashed #ccc', padding: '20px', marginBottom: '10px' }}
            >
                Drag and drop new files here
            </div>

            {newFiles.length > 0 && (
                <div>
                    <h4>New Files to Upload:</h4>
                    <ul>
                        {newFiles.map((file, index) => (
                            <li key={index}>{file.name} ({(file.size / 1024).toFixed(2)} KB)</li>
                        ))}
                    </ul>
                    <button onClick={handleFileUpload}>Upload Files</button>
                </div>
            )}
        </div>
    );
};

export default Part;
