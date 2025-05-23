import { jwtDecode } from 'jwt-decode';
import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, requiredAccessLevel = 2 }) => {
  const token = localStorage.getItem('token');
  const decoded = jwtDecode(token);

  // console.log('token: ', token, ', access level: ', decoded.access)

  if (!token || decoded.access < requiredAccessLevel) {
    // console.log('token: ', token, ', access level: ', decoded.access)
    return <Navigate to="/access-denied" />;
  }

  return children;
};

export default ProtectedRoute;