import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import '../Styling/Form.css'

const PartForm = () => {
    const token = localStorage.getItem('token')

    const [number, setNumber] = useState('');
    const [revision, setRevision] = useState('');
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState(0);
    const [price, setPrice] = useState(0);
    const [finish, setFinish] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();

    useEffect(() =>{
        if(token){
            const decoded = jwtDecode(token)
            setClientID(decoded.id)
        }else{
            navigate('/login-client')
        }
    }, [token]);

    const postPart = async(e) => {
        e.preventDefault();

        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/part/new`,{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({number, revision, description, quantity, price, finish})
            });
            
            const data = await response.json();

            if(response.status ===201){
                navigate('/')
                console.log(data)
            }else{
                setError('WEEWOOWEEWOO')
                console.error(data)
            }
        }catch(e){
            setError('An error has occured during posting part')
            console.error(e)
        }
    }

    return (
        <div className='container'>
            <h1 className='header'>Part</h1>
            <form className='container-form' onSubmit={postPart}>
                <input
                    type="text"
                    placeholder='Number'
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                />
                <input
                    type="text"
                    placeholder='Revision'
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                />
                <textarea
                    type="text"
                    placeholder='Description'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
                <input
                    type='number'
                    placeholder='Quantity'
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                />
                <input
                    type='number'
                    placeholder='Price'
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                />
                <input
                    type="text"
                    placeholder='Finish'
                    value={finish}
                    onChange={(e) => setFinish(e.target.value)}
                />
                <button type='submit'>Submit</button>
            </form>
            {error && <p>{error}</p>}
        </div>
    )
}

export default PartForm;