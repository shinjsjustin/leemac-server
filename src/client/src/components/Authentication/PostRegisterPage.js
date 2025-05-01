import React from 'react';
import { useNavigate } from 'react-router-dom';

const PostRegisterPage = () => {
    const navigate = useNavigate();

    const handleGoHome = () => {
        navigate('/');
    };

    return (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <h1>Registration Successful</h1>
            <p>Your registration is complete. Please wait for us to grant you access.</p>
            <button onClick={handleGoHome} style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px' }}>
                Go to Home
            </button>
        </div>
    );
};

export default PostRegisterPage;
