import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import '../Styling/RequestDetails.css';
import Navbar from "../Navbar";

const Part = () => {
    const token = localStorage.getItem('token');
    const { id } = useParams();
    const [files, setFiles] = useState([]);
    const [newFiles, setNewFiles] = useState([]);
    const [details, setDetails] = useState({ number: '', description: '', price: '', company: '' });
    const [previewFile, setPreviewFile] = useState(null);

    const navigate = useNavigate();

    useEffect(() => {
        fetchFiles();
        fetchDetails();
    }, [id]);

    const fetchFiles = async () => {
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
                        // Decode base64 to binary and create Blob
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
                console.log({
                    filename: file.filename,
                    previewUrl,
                });
    
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
    };

    const fetchDetails = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/getpart?id=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await response.json();
            setDetails(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleDetailChange = (e) => {
        const { name, value } = e.target;
        setDetails((prev) => ({ ...prev, [name]: value }));
    };

    const handleDetailSave = async () => {
        try {
            await fetch(`${process.env.REACT_APP_URL}/internal/part/updatepart`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id, ...details }),
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
        setPreviewFile(url);
    }

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
            <input type="text" name="number" value={details.number} onChange={handleDetailChange} placeholder="Part Number" />
            <textarea name="description" value={details.description} onChange={handleDetailChange} placeholder="Description" />
            <input type="number" name="price" value={details.price} onChange={handleDetailChange} placeholder="Price" />
            <input type="text" name="company" value={details.company} onChange={handleDetailChange} placeholder="Company" />
            <button onClick={handleDetailSave}>Save Details</button>

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
            {previewFile && (
                <div style={{ marginTop: '20px' }}>
                    <h3>PDF Preview</h3>
                    <iframe
                        src={previewFile}
                        width="100%"
                        height="600px"
                        style={{ border: '1px solid #ccc' }}
                        title="PDF Preview"
                    />
                </div>
            )}
        </div>
    );
};

export default Part;
