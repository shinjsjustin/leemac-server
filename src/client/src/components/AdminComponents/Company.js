import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const Company = () => {
    const token = localStorage.getItem('token');
    const [companies, setCompanies] = useState([]);
    const [newCompany, setNewCompany] = useState({ code: '', name: '', address_line1: '', address_line2: '' });
    const navigate = useNavigate();

    const fetchCompanies = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/company/getcompanies`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                setCompanies(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    useEffect(() => {
        fetchCompanies();
    }, [fetchCompanies]);

    const handleAddCompany = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/company/createcompany`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newCompany),
            });
            const data = await response.json();
            if (response.status === 201) {
                alert('Company added successfully!');
                setNewCompany({ code: '', name: '', address_line1: '', address_line2: '' });
                fetchCompanies();
            } else {
                console.error(data);
                alert('Failed to add company.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while adding the company.');
        }
    };

    const handleEditCompany = async (id, updatedCompany) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/company/editcompany/${id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedCompany),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Company updated successfully!');
                fetchCompanies();
            } else {
                console.error(data);
                alert('Failed to update company.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while updating the company.');
        }
    };

    return (
        <div>
            <Navbar />
            <button onClick={() => navigate(-1)}>Back</button>
            <div className="requests">
                <h2>Companies</h2>
                <div>
                    <h3>Add New Company</h3>
                    <input
                        type="text"
                        placeholder="Code"
                        value={newCompany.code}
                        onChange={(e) => setNewCompany({ ...newCompany, code: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Name"
                        value={newCompany.name}
                        onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Address Line 1"
                        value={newCompany.address_line1}
                        onChange={(e) => setNewCompany({ ...newCompany, address_line1: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Address Line 2"
                        value={newCompany.address_line2}
                        onChange={(e) => setNewCompany({ ...newCompany, address_line2: e.target.value })}
                    />
                    <button onClick={handleAddCompany}>Add Company</button>
                </div>
                <div>
                    <h3>Company List</h3>
                    <table className="requests-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Address Line 1</th>
                                <th>Address Line 2</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {companies.map((company) => (
                                <tr key={company.id}>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.code}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, code: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.name}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, name: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.address_line1}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, address_line1: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.address_line2}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, address_line2: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <button onClick={() => handleEditCompany(company.id, company)}>Save</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Company;
