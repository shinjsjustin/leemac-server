import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {jwtDecode} from 'jwt-decode';

import '../Styling/Form.css'

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async(e) => {
        e.preventDefault();
        setError('');

        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/admin/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({email, password}),
            });
            const data = await response.json();
            // console.log('Login request data: ', data);
    
            if(response.status === 200){
                localStorage.setItem('token', data.token);
                const decodedToken = jwtDecode(data.token);
                const accessLevel = decodedToken.access || 0;

                if (accessLevel === 1) {
                    navigate('/client-joblist');
                } else if (accessLevel > 1) {
                    navigate('/starred-jobs');
                }
            }else if(response.status === 404){
                setError('No users found with that email.  Register?')
            }else if(response.status === 404){
                setError('Invalid Password')
            }else{
                setError('Server side error')
            }
        }catch(err){
            setError(`${err}`);
            console.error(err)
        }
    };

  return (
    <div className='container'>
        <h1 className='header'>Log In</h1>
        <form className='container-form'onSubmit={handleLogin}>
            <input 
                type="email"
                placeholder='Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)} 
                required
            />
            <input 
                type="password"
                placeholder='Password'
                value={password}
                onChange={(e)=> setPassword(e.target.value)}
                required
            />
            <button type='submit'>Login</button>
            <Link to='/register-admin'>Register</Link>
            <Link to="/">Home</Link>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default Login;