import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Address from '../Address';
import '../Styling/Form.css'

const ClientRegister = () => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [payable, setPayable] = useState('');
    const [password, setPassword] = useState('');
    const [company, setCompany] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();

    const registerUser = async(e) =>{
        e.preventDefault();
        const url = `${process.env.REACT_APP_URL}/client/register`
        const body = JSON.stringify({name, email, phone, company, address, payable, password})

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
                navigate("/login-client")
            }else if(response.status === 409){
                setError('A user with that email already exists, please try another')
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
        <h1 className='header'>Register</h1>
        <form className='container-form' onSubmit={registerUser}>
            <input 
                type="name"
                placeholder='Name'
                value={name}
                onChange={(e) => setName(e.target.value)} 
                required
            />
            <input 
                type="email"
                placeholder='Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)} 
                required
            />
            <input 
                type="phone"
                placeholder='Phone'
                value={phone}
                onChange={(e) => setPhone(e.target.value)} 
            />
            <input 
                type="company"
                placeholder='Company'
                value={company}
                onChange={(e) => setCompany(e.target.value)} 
            />
            <Address onAddressSelect={(value) => setAddress(value)} />
            <input 
                type="email"
                placeholder='Payable Email'
                value={payable}
                onChange={(e) => setPayable(e.target.value)} 
            />
            <input 
                type="password"
                placeholder='Password'
                value={password}
                onChange={(e)=> setPassword(e.target.value)}
                required
            />
            <button type='submit'>Register</button>
            <Link to="/login-client">Login</Link>
            <Link to="/">Home</Link>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default ClientRegister;