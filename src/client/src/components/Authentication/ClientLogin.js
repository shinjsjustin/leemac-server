import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import '../Styling/Form.css'

const ClientLogin = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async(e) => {
        e.preventDefault();
        setError('');

        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/client/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({username, password}),
            });
            const data = await response.json();
            // console.log('Login request data: ', data);
    
            if(response.status === 200){
                localStorage.setItem('token', data.token);
                navigate('/client-home');
            }else if(response.status === 404){
                setError('No users found with that username.  Register?')
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
        <h1 className='header'>Client Log In</h1>
        <form className='container-form'onSubmit={handleLogin}>
            <input 
                type="text"
                placeholder='Username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
            <Link to="/">Home</Link>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default ClientLogin;