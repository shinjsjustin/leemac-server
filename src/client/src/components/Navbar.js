import {jwtDecode} from 'jwt-decode'
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import profileicon from '../profile-icon.svg'
import './Styling/Navbar.css'
import './Styling/Home.css'

import Logout from './Authentication/Logout';

const Navbar = () => {
    const [authorized, setAuthorized] = useState(false);
    const [openPanel, setOpenPanel] = useState(false);
    // const [email, setEmail] = useState('');
    // const [access, setAccess] = useState(0);
    // const [id, setId] = useState(null);

    const navigate = useNavigate();
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;

    useEffect(() => {
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
                if (decoded.exp && decoded.exp > currentTime) {
                    setAuthorized(true);
                } else {
                    localStorage.removeItem('token'); // Remove expired token
                    setAuthorized(false);
                }
            } catch (error) {
                console.error('Invalid token:', error);
                localStorage.removeItem('token'); // Remove invalid token
                setAuthorized(false);
            }
        }
    }, [token]);

    const profileClick = () =>{
        if(!authorized){
            navigate("/login-admin")
        }else{
            setOpenPanel(!openPanel)
        }
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
                {
                    openPanel && (
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
                    )
                }
            </div>
        </div>
    );
};

export default Navbar;