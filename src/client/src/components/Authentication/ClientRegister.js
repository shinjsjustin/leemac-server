import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import '../Styling/Form.css'
import Navbar from '../Navbar';

const ClientRegister = () => {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [company_id, setcompany_id] = useState('');
    const [error, setError] = useState('');

    const registerUser = async(e) =>{
        e.preventDefault();
        const url = `${process.env.REACT_APP_URL}/client/register`
        const body = JSON.stringify({username, name, password, company_id: parseInt(company_id)})

        console.log('url: ', url)
        console.log('body: \n', body)
        try{
            const response = await fetch(url,{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: body,
            });
            const data = await response.json();
            console.log('Register user response data: \n', data);
    
            if(response.status === 201){
                alert("Registration Successful")
                setName('');
                setUsername('');
                setPassword('');
                setcompany_id('');
            }else if(response.status === 409){
                setError('A user with that username already exists, please try another')
            }else{
                setError('Server side error')
            }
        }catch(err){
            setError('Registration error (try catch)')
            console.error(err)
        }
    }

  return (
    <div className='container'>
        <Navbar />
        <h1 className='header'>Register</h1>
        <form className='container-form' onSubmit={registerUser}>
            <input 
                type="text"
                placeholder='Username'
                value={username}
                onChange={(e) => setUsername(e.target.value)} 
                required
            />
            <input 
                type="text"
                placeholder='Name'
                value={name}
                onChange={(e) => setName(e.target.value)} 
                required
            />
            <input 
                type="password"
                placeholder='Password'
                value={password}
                onChange={(e)=> setPassword(e.target.value)}
                required
            />
            <input 
                type="number"
                placeholder='Company ID'
                value={company_id}
                onChange={(e) => setcompany_id(e.target.value)} 
                required
            />
            <button type='submit'>Register</button>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default ClientRegister;