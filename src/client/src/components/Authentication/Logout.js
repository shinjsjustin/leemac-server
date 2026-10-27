import React from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import '../Styling/Home.css'

const Logout = ({ className = 'industrial-button', label = 'Logout' }) => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        // Revoke the server session; a failure must not keep the user signed in.
        try {
            const { role } = jwtDecode(localStorage.getItem('token'));
            await apiFetch(`/${role}/logout`, { method: 'POST' });
        } catch (e) {
            // ignored on purpose
        }
        localStorage.removeItem('token');

        // Redirect to the login page or homepage
        navigate('/');
    };

    return (
        <button className={className} onClick={handleLogout}>
            {label}
        </button>
    );
};

export default Logout;