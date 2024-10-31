import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import '../Styling/Form.css'

const Login = ({code}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const [endpoint, setEndpoint] = useState('');
    const [redirectPath, setRedirectPath] = useState('');
    const [headerText, setHeaderText] = useState('');
    const [linkToRegister, setLinkToRegister] = useState('');

    useEffect(()=>{
        if(code === 0){
            setEndpoint('admin');
            setRedirectPath('/admin');
            setHeaderText('Admin Login');
            setLinkToRegister('/register-admin');
        }else if(code === 1){
            setEndpoint('employee');
            setRedirectPath('/employee');
            setHeaderText('Login');
            setLinkToRegister('/register-client');
        }
    }, [])

    const handleLogin = async(e) => {
        e.preventDefault();
        setError('');

        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/${endpoint}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({email, password}),
            });
            const data = await response.json();
            console.log('Login request data: ', data);
    
            if(response.status === 200){
                localStorage.setItem('token', data.token);
                navigate(redirectPath);
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
        <h1 className='header'>{headerText}</h1>
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
            <Link to={linkToRegister}>Register</Link>
            <Link to="/">Home</Link>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default Login;