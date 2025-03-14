import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import '../Styling/RequestDetails.css';
import Navbar from "../Navbar";

const Part = () => {
    const token = localStorage.getItem('token');
    const { id } = useParams();
    const [files, setFiles] = useState([]);

    const navigate = useNavigate();

    useEffect(() => {
        fetchFiles();
    }, [id]);

    const fetchFiles = async () => {
        try {
            // Fetch files directly using partID
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/getblob?partID=${id}`, {
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
    
            // Map the files to include fileID if needed
            const mappedFiles = fileDetails.map((file) => ({
                ...file,
                fileID: file.id, // Ensure consistency if fileID is expected in frontend
            }));
    
            console.log(mappedFiles);
            setFiles(mappedFiles);
        } catch (e) {
            console.error(e);
        }
    };

    const handleFileClick = async (file) => {
        console.log("File clicked:", file);
        console.log("File ID:", file.fileID);
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/blob/download?fileID=${file.fileID}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`, // Add this if your route requires authentication
                },
            });
    
            if (!response.ok) {
                throw new Error('Failed to download file');
            }
    
            const blob = await response.blob(); // Get the file as a blob
            const url = window.URL.createObjectURL(blob); // Create a URL for the blob
    
            const filename = file.filename;

            // Create a temporary anchor tag to trigger the download
            const link = document.createElement('a');
            link.href = url;
            link.download = filename; // Set the filename

            document.body.appendChild(link); // Append to the DOM temporarily
            link.click(); // Trigger the download
            console.log('link: ', link)
            link.remove(); // Clean up the DOM
            window.URL.revokeObjectURL(url); // Revoke the blob URL to free memory
        } catch (error) {
            console.error('Error downloading file:', error);
            alert('Failed to download file. Please try again.');
        }
    };

    return (
        <div className="request-details">
            <Navbar/>
            <button onClick={() => navigate(-1)}>Back</button>
            <h2>Request Details</h2>

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
                    </li>
                ))}
                </ul>
            )}
            
        </div>
    );
};

export default Part;