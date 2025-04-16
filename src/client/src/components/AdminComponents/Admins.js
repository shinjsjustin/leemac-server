import React, { useState, useEffect, useCallback } from 'react';
import Navbar from "../Navbar";
import { useNavigate } from 'react-router-dom';

const Admins = () => {
    const token = localStorage.getItem('token');
    const [admins, setAdmins] = useState([]);
    const navigate = useNavigate();

    const fetchAdmins = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/admins/getadmins`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                setAdmins(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    useEffect(() => {
        fetchAdmins();
    }, [fetchAdmins]);

    const handleEditAdmin = async (id, updatedAdmin) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/admins/editadmin`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id, ...updatedAdmin }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Admin updated successfully!');
                fetchAdmins();
            } else {
                console.error(data);
                alert('Failed to update admin.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while updating the admin.');
        }
    };

    return (
        <div>
            <Navbar />
            <button onClick={() => navigate(-1)}>Back</button>
            <div className="requests">
                <h2>Admins</h2>
                <div>
                    <h3>Admin List</h3>
                    <table className="requests-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Access Level</th>
                                <th>Email</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {admins.map((admin) => (
                                <tr key={admin.id}>
                                    <td>
                                        <input
                                            type="text"
                                            value={admin.name}
                                            onChange={(e) =>
                                                setAdmins(admins.map(a =>
                                                    a.id === admin.id ? { ...a, name: e.target.value } : a
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={admin.access_level}
                                            onChange={(e) =>
                                                setAdmins(admins.map(a =>
                                                    a.id === admin.id ? { ...a, access_level: e.target.value } : a
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={admin.email}
                                            onChange={(e) =>
                                                setAdmins(admins.map(a =>
                                                    a.id === admin.id ? { ...a, email: e.target.value } : a
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <button onClick={() => handleEditAdmin(admin.id, admin)}>Save</button>
                                        <button onClick={() => navigate(`/admins/${admin.id}`, { state: { adminName: admin.name } })}>Details</button>
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

export default Admins;
