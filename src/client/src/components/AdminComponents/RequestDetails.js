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
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/requests/file?quoteID=${id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error('Fetching Files Error');
            } else {
                console.log(data);
                setFiles(data);
            }
        } catch (e) {
            console.error(e);
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
            
        </div>
    );
};

export default RequestDetails;