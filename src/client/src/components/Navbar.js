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
    const adminJobListClick = () =>{
        if(!authorized){
            navigate('/login-admin')
        }else{
            navigate('/joblist')
        }
    }
    const adminPartListClick = () =>{
        if(!authorized){
            navigate('/login-admin')
        }else{
            navigate('/partlist')
        }
    }
    const adminStarredJobsClick = () =>{
        if(!authorized){
            navigate('/login-admin')
        }else{
            navigate('/starred-jobs')
        }
    }

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
                                <button className='industrial-button' onClick={adminJobListClick}>Jobs</button>
                                <button className='industrial-button' onClick={adminPartListClick}>Parts</button>
                                <button className='industrial-button' onClick={adminStarredJobsClick}>Starred Jobs</button>
                                <Logout/>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
};

export default Navbar;