import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import '../Styling/Form.css'

const AdminRegister = () => {
    const [name, setName] = useState('');
    const [title, setTitle] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();

    const registerUser = async(e) =>{
        e.preventDefault();
        console.log('Block 1: ', `${process.env.REACT_APP_URL}/admin/register`)

        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/admin/register`,{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({name, email, password, title}),
            });
            const data = await response.json();
            console.log('Register user response data: \n', data);
    
            if(response.status === 201){
                navigate("/login-admin")
            }else if(response.status === 409){
                setError('A user with that email already exists, please try another')
            }else{
                setError('Server side error')
            }
        }catch(err){
            setError(`${err}`)
            console.error(err)
        }
    }

  return (
    <div className='container'>
        <h1 className='header'>Admin Register</h1>
        <form className='container-form' onSubmit={registerUser}>
            <input 
                type="name"
                placeholder='Name'
                value={name}
                onChange={(e) => setName(e.target.value)} 
                required
            />
            <input 
                type="title"
                placeholder='Title'
                value={title}
                onChange={(e) => setTitle(e.target.value)} 
            />
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
            <button type='submit'>Register</button>
            <Link to="/login-admin">Login</Link>
            <Link to="/">Home</Link>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default AdminRegister;