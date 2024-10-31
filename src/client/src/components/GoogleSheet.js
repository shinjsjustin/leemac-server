import React, { useState } from 'react';
import './Styling/Form.css'


const GoogleSheetData = () => {
    const [row, setRow] = useState('');
    const [column, setColumn] = useState('');
    const [value, setValue] = useState('');
    const [error, setError] = useState('');

    const handleClick = async(e) =>{
        e.preventDefault();
        setError('');

        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/sheet/update`,{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({row, column, value})
            });
            const data = await response.json();
            setError(`${data}`);
        }catch(e){
            console.error(e)
        }
    }

    return (
        <div className='container'>
        <h1 className='header'>Update</h1>
        <form className='container-form'onSubmit={handleClick}>
            <input 
                type="number"
                placeholder='Row'
                value={row}
                onChange={(e) => setRow(e.target.value)} 
                required
            />
            <input 
                type="text"
                placeholder='Column'
                value={column}
                onChange={(e)=> setColumn(e.target.value)}
                required
            />
            <input 
                type="text"
                placeholder='Value'
                value={value}
                onChange={(e)=> setValue(e.target.value)}
                required
            />
            <button type='submit'>Letsego</button>
        </form>
        {error && <p>{error}</p>}
    </div>
    );
};

export default GoogleSheetData;
