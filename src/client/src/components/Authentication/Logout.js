import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../Styling/Home.css'

const Logout = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        // Remove the token from localStorage (or sessionStorage)
        localStorage.removeItem('token');

        // Optionally, clear other user-related data
        // localStorage.removeItem('user');

        // Redirect to the login page or homepage
        navigate('/');
    };

    return (
        <button className='industrial-button' onClick={handleLogout}>
            Logout
        </button>
    );
};

export default Logout;