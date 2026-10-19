import { jwtDecode } from 'jwt-decode';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAllowed } from './access';

const ProtectedRoute = ({ children, role = 'admin', requiredAccessLevel = 2 }) => {
  const token = localStorage.getItem('token');
  let decoded = null;
  try {
    decoded = jwtDecode(token);
  } catch (e) {
    decoded = null;
  }

  if (!isAllowed(decoded, { role, minLevel: requiredAccessLevel })) {
    return <Navigate to="/access-denied" />;
  }

  return children;
};

export default ProtectedRoute;
