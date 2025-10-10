import {jwtDecode} from 'jwt-decode'
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import profileicon from '../profile-icon.svg'
import './Styling/Navbar.css'
import './Styling/Home.css'

import Logout from './Authentication/Logout';

const Navbar = () => {
    const [authorized, setAuthorized] = useState(false);
    const [openPanel, setOpenPanel] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;

    useEffect(() => {
        // Check for token in URL parameters (from OAuth redirect)
        const urlParams = new URLSearchParams(location.search);
        const tokenFromUrl = urlParams.get('token');
        
        if (tokenFromUrl) {
            localStorage.setItem('token', tokenFromUrl);
            // Remove token from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.reload(); // Refresh to update state
        }

        const currentToken = localStorage.getItem('token');
        if (currentToken) {
            try {
                const decoded = jwtDecode(currentToken);
                const currentTime = Math.floor(Date.now() / 1000);
                if (decoded.exp && decoded.exp > currentTime) {
                    setAuthorized(true);
                } else {
                    localStorage.removeItem('token');
                    setAuthorized(false);
                }
            } catch (error) {
                console.error('Invalid token:', error);
                localStorage.removeItem('token');
                setAuthorized(false);
            }
        }
    }, [location, token]);

    const profileClick = () => {
        if (!authorized) {
            navigate("/login-admin")
        } else {
            setOpenPanel(!openPanel)
        }
    }

    const handleGoogleLogin = () => {
        window.location.href = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/auth/google`;
    }

    const navigateTo = (path) => {
        if (!authorized) {
            navigate('/login-admin');
        } else {
            navigate(path);
        }
    };

    const buttonConfig = [
        { label: 'Starred Jobs', path: '/starred-jobs', minAccess: 2 },
        { label: 'Jobs', path: '/joblist', minAccess: 2 },
        { label: 'Notes', path: '/notelist', minAccess: 2 },
        { label: 'Parts', path: '/partlist', minAccess: 2 },
        { label: 'Companies', path: '/company', minAccess: 2 },
        { label: 'Calendar Test', path: '/calendar-test', minAccess: 1 }, // Add calendar test
        { label: 'Admins', path: '/admins', minAccess: 3 },
        { label: 'Jobs', path: '/client-joblist', minAccess: 1, maxAccess: 1 },
    ];

    return (
        <div>
            <div className="profile-icon">
                <img 
                    src={profileicon} 
                    alt="User Profile" 
                    onClick={profileClick} 
                />
                {!authorized && (
                    <button 
                        className="google-login-btn" 
                        onClick={handleGoogleLogin}
                        style={{
                            position: 'absolute',
                            top: '60px',
                            right: '10px',
                            padding: '8px 16px',
                            backgroundColor: '#4285f4',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Login with Google
                    </button>
                )}
                {openPanel && (
                    <div className='profile-background'>
                        <div className='profile-panel'>
                            {buttonConfig
                                .filter(({ minAccess, maxAccess }) => 
                                    accessLevel >= minAccess && 
                                    (maxAccess === undefined || accessLevel <= maxAccess)
                                )
                                .map(({ label, path }) => (
                                    <button 
                                        key={label} 
                                        className='industrial-button' 
                                        onClick={() => navigateTo(path)}
                                    >
                                        {label}
                                    </button>
                                ))
                            }
                            <Logout />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Navbar;