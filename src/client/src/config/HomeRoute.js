import { jwtDecode } from 'jwt-decode';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAllowed } from './access';

// Signed-in clients skip About for their Overview. The token is never cleared
// here, so admin and stale sessions are left for their own routes to handle.
const HomeRoute = ({ children }) => {
  let decoded = null;
  try {
    decoded = jwtDecode(localStorage.getItem('token'));
  } catch (e) {
    decoded = null;
  }

  if (isAllowed(decoded, { role: 'client' })) {
    return <Navigate to="/client-overview" replace />;
  }
  return children;
};

export default HomeRoute;
