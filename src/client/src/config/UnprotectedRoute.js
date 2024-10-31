import React from 'react';
import { Navigate } from 'react-router-dom';

const UnprotectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  // If token is found, redirect to home
  if (token) {
    return <Navigate to="/" />;
  }

  // If no token exists, render the children (protected content)
  return children;
};

export default UnprotectedRoute;