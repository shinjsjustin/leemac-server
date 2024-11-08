import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import '../Styling/RequestDetails.css';
import Navbar from "../Navbar";

const RequestDetails = () => {
    const token = localStorage.getItem('token');
    const { id } = useParams();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('');
    const [title, setTitle] = useState('');
    const [created, setCreated] = useState('');
    const [files, setFiles] = useState([]);

    const navigate = useNavigate();

    useEffect(() => {
        fetchQuoteRequest();
        fetchFiles();
    }, [id]);

    const fetchQuoteRequest = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/requests/id?id=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error('Fetching Request Error');
            } else {
                const details = data[0];
                setName(details.name);
                setDescription(details.description);
                setEmail(details.email);
                setPhone(details.phone);
                setStatus(details.status);
                setTitle(details.title);
                setCreated(new Date(details.created_at).toLocaleDateString());

                console.log('status: ', status, 'detailed status: ', details.status)
                if(details.status === 'new'){
                    console.log('itsrunning')
                    updateStatusToViewed();
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchFiles = async () => {
        try {
            // Fetch the list of file IDs
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/requests/files?quoteID=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            
            if (!response.ok) {
                throw new Error('Fetching Files Error');
            }
    
            const fileList = await response.json();
    
            // Iterate over each fileID and fetch detailed info
            const fileDetails = await Promise.all(
                fileList.map(async (file) => {
                    const fileResponse = await fetch(`${process.env.REACT_APP_URL}/internal/requests/file?fileID=${file.fileID}`, {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });
    
                    if (!fileResponse.ok) {
                        throw new Error(`Error fetching file details for fileID: ${file.fileID}`);
                    }
    
                    const fileData = await fileResponse.json();
                    return {
                        ...fileData[0],
                        fileID: file.fileID,
                      };
                })
            );
    
            console.log(fileDetails);
            setFiles(fileDetails); 
        } catch (e) {
            console.error(e);
        }
    };

    const handleFileClick = async (file) => {
        console.log("File clicked:", file);
        console.log("File ID:", file.fileID);
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/requests/file/download?fileID=${file.fileID}`, {
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

    // const downloadFile = async (fileID, file_path) => {
    //     try {
    //         const response = await fetch(`${process.env.REACT_APP_URL}/internal/requests/file/download?fileID=${fileID}`, {
    //             method: 'GET',
    //             headers: {},
    //         });
    //         if (response.ok) {
    //             console.log('response: ', response.headers)

    //             const blob = await response.blob(); // Convert the response to a Blob
    //             const url = window.URL.createObjectURL(blob); // Create a URL from the Blob                

    //             const filename = file_path;

    //             const link = document.createElement('a'); // Create a link element
    //             link.href = url;
    //             link.download = filename; // Set the download attribute with the filename
    //             document.body.appendChild(link);
    //             link.click(); // Trigger the download
    //             link.remove(); // Remove the link after download
    //         } else {
    //             console.log(response)
    //             throw new Error('Download Failed');
    //         }
    //     } catch (e) {
    //         console.error(e);
    //     }
    // };

    const updateStatusToViewed = async () => {
        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/requests/update`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({id: id, column:  'status', value:  'viewed'})
            });
            const data = await response.json();
            console.log(data)
            if(response.ok){
                setStatus('viewed')
            }
        }catch(e){
            console.log(e)
        }
    }

    return (
        <div className="request-details">
            <Navbar/>
            <button onClick={() => navigate(-1)}>Back</button>
            <h2>Request Details</h2>
            <p><strong>Title:</strong> {title}</p>
            <p><strong>Name:</strong> {name}</p>
            <p><strong>Email:</strong> {email}</p>
            <p><strong>Phone:</strong> {phone}</p>
            <p><strong>Description:</strong> {description}</p>
            <p><strong>Status:</strong> {status}</p>
            <p><strong>Created At:</strong> {created}</p>

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

export default RequestDetails;