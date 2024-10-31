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

    useEffect(() =>{
        if(token){
            setAuthorized(true)
            const decoded = jwtDecode(token);
            // console.log('Decoded token: ', decoded); 
      
            // setEmail(decoded.email);
            // setAccess(decoded.access_level);
            // setId(decoded.id);
        }
    }, [token]);

    const profileClick = () =>{
        if(!authorized){
            navigate("/login-admin")
        }else{
            setOpenPanel(!openPanel)
        }
    }
    const adminHomeClick = () =>{
        if(!authorized){
            navigate('/login-admin')
        }else{
            navigate('/admin')
        }
    }

    return (
        <div>
            <div className="profile-icon">
                <img src={profileicon} alt="User Profile" onClick={profileClick}/>
                {
                    openPanel && (
                        <div className='profile-background'>
                            <div className='profile-panel'>
                                <button className='industrial-button' onClick={adminHomeClick}>Home</button>
                                <Logout/>
                            </div>
                        </div>
                    )
                }
            </div>
            {/* {!token && (
                <div className="admin-portal">
                    <Link to="login-admin">Admin Portal</Link>
                </div>
            )} */}
        </div>
    );
};

export default Navbar;