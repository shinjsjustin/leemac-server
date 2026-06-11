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

    // Determine user type based on token properties
    const isAdmin = decodedToken && decodedToken.access !== undefined;
    const isClient = decodedToken && decodedToken.company_id !== undefined;

    // Green styling shared with the "job done" indicator (matches Add Job button)
    const GREEN_BUTTON_STYLE = { backgroundColor: '#4CAF50', color: 'white' };

    // Client-side "Add Job" flow: create a job for the client's company, star it,
    // then navigate to the new job page. Mirrors the previous ClientHome behavior.
    const handleClientAddJob = async () => {
        const currentToken = localStorage.getItem('token');
        if (!currentToken) { navigate('/login-admin'); return; }
        const decoded = jwtDecode(currentToken);
        const companyId = decoded.company_id;
        const clientName = decoded.name;

        try {
            const numRes = await fetch(`${process.env.REACT_APP_URL}/internal/job/currentjobnum`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
            });
            const numData = await numRes.json();
            if (numRes.status !== 200) { console.error(numData); alert('Failed to get next job number'); return; }
            const nextJobNumber = parseInt(numData.current_job_num, 10) + 1;

            const createJobResponse = await fetch(`${process.env.REACT_APP_URL}/internal/job/newjob`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobNum: nextJobNumber, companyId, attention: clientName }),
            });
            const jobData = await createJobResponse.json();

            if (createJobResponse.status === 201) {
                const jobId = jobData.id;

                await fetch(`${process.env.REACT_APP_URL}/internal/job/updatejobnum`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: nextJobNumber }),
                });

                await fetch(`${process.env.REACT_APP_URL}/internal/job/starjob`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId, attention: clientName }),
                });

                navigate(`/job/${jobId}`);
            } else {
                console.error(jobData);
                alert('Failed to create job');
            }
        } catch (e) {
            console.error('Error creating job:', e);
            alert('Error creating job');
        }
    };

    // Admin button configuration
    const adminButtonConfig = [
        // { label: 'Tasks', path: '/tasks', minAccess: 1 },
        { label: 'Shop Update', path: '/shop-update', minAccess: 1 },
        { label: 'Starred Jobs', path: '/starred-jobs', minAccess: 1 },
        { label: 'Jobs', path: '/joblist', minAccess: 2 },
        { label: 'Notes', path: '/notelist', minAccess: 1 },
        { label: 'Parts', path: '/partlist', minAccess: 2 },
        { label: 'Finances', path: '/finances', minAccess: 3 },
        { label: 'Companies', path: '/company', minAccess: 2 },
        { label: 'Admins', path: '/admins', minAccess: 3 },
        { label: 'Register Clients', path: '/client-register', minAccess: 3 },
        { label: 'Update Credentials', path: '/admin-update-credentials', minAccess: 0 },
        { label: 'Add Job', path: '/add-job', minAccess: 2, style: GREEN_BUTTON_STYLE },
    ];

    // Client button configuration
    const clientButtonConfig = [
        { label: 'Add Job', minAccess: 0, style: GREEN_BUTTON_STYLE, onClick: handleClientAddJob },
        { label: 'My Jobs', path: '/client-home', minAccess: 0 },
        { label: 'My Parts', path: '/client-parts', minAccess: 0 },
        { label: 'Update Credentials', path: '/client-update-credentials', minAccess: 0, },
    ];

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
            navigate("/login-admin");
        } else {
            setOpenPanel(!openPanel)
        }
    }

    const handleGoogleLogin = () => {
        // Remove /api from REACT_APP_URL since /auth is at root level
        const baseUrl = process.env.REACT_APP_URL ? process.env.REACT_APP_URL.replace('/api', '') : 'http://localhost:3001';
        window.location.href = `${baseUrl}/auth/google`;
    }

    const navigateTo = (path) => {
        if (!authorized) {
            navigate('/login-admin');
        } else {
            navigate(path);
        }
    };

    // Get the appropriate button configuration based on user type
    const getButtonConfig = () => {
        if (isClient) {
            return clientButtonConfig;
        } else if (isAdmin) {
            return adminButtonConfig;
        }
        return [];
    };

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
                    >
                        ADMIN ONLY
                    </button>
                )}
                {openPanel && (
                    <div className='profile-background'>
                        <div className='profile-panel'>
                            {getButtonConfig()
                                .filter(({ minAccess, maxAccess }) => 
                                    accessLevel >= minAccess && 
                                    (maxAccess === undefined || accessLevel <= maxAccess)
                                )
                                .map(({ label, path, style, onClick }) => (
                                    <button 
                                        key={label} 
                                        className='industrial-button' 
                                        onClick={() => {
                                            setOpenPanel(false);
                                            if (onClick) {
                                                onClick();
                                            } else {
                                                navigateTo(path);
                                            }
                                        }}
                                        style={style}
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