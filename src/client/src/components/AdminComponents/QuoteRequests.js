import React, { useState, useEffect } from 'react';
import {useNavigate} from 'react-router-dom';
import '../Styling/RequestTable.css'
import { jwtDecode } from 'jwt-decode';

const QuoteRequestsTable = () => {
    const token = localStorage.getItem('token');
    const decoded = jwtDecode(token);
    const [quoteRequests, setQuoteRequests] = useState([]);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortDirection, setSortDirection] = useState('asc');
    const [filterStatus, setFilterStatus] = useState('');
    const [searchTerm, setSearchTerm] = useState(''); // For input value
    const [searchQuery, setSearchQuery] = useState(''); // Triggers search when changed

    const navigate = useNavigate();

    useEffect(() => {
        fetchQuoteRequests();
    }, [sortBy, sortDirection, filterStatus, searchQuery]); // searchQuery triggers fetch

    const fetchQuoteRequests = async () => {
        try {
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/requests/all?sortBy=${sortBy}&sortDirection=${sortDirection}&filterStatus=${filterStatus}&searchTerm=${searchQuery}`, // Use searchQuery instead of searchTerm
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            const data = await response.json();
            if (response.status === 200) {
                setQuoteRequests(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortDirection('asc');
        }
    };

    const handleFilterStatus = () => {
        if (filterStatus === '') {
            setFilterStatus('new');
        } else if (filterStatus === 'new') {
            setFilterStatus('viewed');
        } else if (filterStatus === 'viewed') {
            setFilterStatus('in_progress');
        } else if (filterStatus === 'in_progress') {
            setFilterStatus('completed');
        } else if (filterStatus === 'completed') {
            setFilterStatus('');
        }
    };

    const handleRowClick = (id) => {
        navigate(`/requests/${id}`);
    };

    const handleSearch = () => {
        setSearchQuery(searchTerm); // Trigger fetch when user clicks Search button
    };

    return (
        <div className='requests'>
            <h2>Requests</h2>
            <div className="search-container">
                <input
                    type="text"
                    placeholder="FILE SEARCH"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)} // Update input value
                    className="search-input"
                />
                <button onClick={handleSearch} className="search-button">
                    Search
                </button>
            </div>
            <table className='requests-table'>
                <thead>
                    <tr>
                        <th
                            onClick={() => handleSort('name')}
                            className={`sortable ${sortBy === 'name' ? 'sorted' : ''}`}
                        >
                            Name
                        </th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Description</th>
                        <th
                            onClick={() => handleSort('title')}
                            className={`sortable ${sortBy === 'title' ? 'sorted' : ''}`}
                        >
                            Title
                        </th>
                        <th
                            onClick={() => handleFilterStatus()}
                            className={`filterable ${filterStatus === 'pending' ? 'filtered' : ''}`}
                        >
                            Status {filterStatus}
                        </th>
                        <th
                            onClick={() => handleSort('created_at')}
                            className={`sortable ${sortBy === 'created_at' ? 'sorted' : ''}`}
                        >
                            Created At
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {quoteRequests.map((request) => (
                        <tr
                            key={request.id}
                            className='table-row'
                            onClick={() => handleRowClick(request.id)}
                        >
                            <td>{request.name}</td>
                            <td>{request.email}</td>
                            <td>{request.phone}</td>
                            <td>{request.description}</td>
                            <td>{request.title}</td>
                            <td>{request.status}</td>
                            <td>{new Date(request.created_at).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default QuoteRequestsTable;