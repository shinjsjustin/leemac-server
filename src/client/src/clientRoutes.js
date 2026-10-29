import React from 'react';
import { Navigate } from 'react-router-dom';
import ClientOverview from './components/ClientComponents/ClientOverview';
import ClientHome from './components/ClientComponents/ClientHome';
import ClientJob from './components/ClientComponents/ClientJob';
import ClientPartsPage from './components/ClientComponents/ClientPartsPage';
import ClientPartPage from './components/ClientComponents/ClientPartPage';
import ClientRequestsPage from './components/ClientComponents/ClientRequestsPage';
import ClientRequestPage from './components/ClientComponents/ClientRequestPage';
import ProtectedRoute from './config/ProtectedRoute';

const clientRoutes = [
  { path: '/client-overview', element: <ProtectedRoute role="client"><ClientOverview /></ProtectedRoute> },
  { path: '/client-home', element: <ProtectedRoute role="client"><ClientHome /></ProtectedRoute> },
  { path: '/client-job/:id', element: <ProtectedRoute role="client"><ClientJob /></ProtectedRoute> },
  { path: '/client-parts', element: <ProtectedRoute role="client"><ClientPartsPage /></ProtectedRoute> },
  { path: '/client-part/:id', element: <ProtectedRoute role="client"><ClientPartPage /></ProtectedRoute> },
  { path: '/client-requests', element: <ProtectedRoute role="client"><ClientRequestsPage /></ProtectedRoute> },
  { path: '/client-request', element: <ProtectedRoute role="client"><Navigate to="/client-requests" replace /></ProtectedRoute> },
  { path: '/client-request/new', element: <ProtectedRoute role="client"><ClientRequestPage /></ProtectedRoute> },
  { path: '/client-request/:id', element: <ProtectedRoute role="client"><ClientRequestPage /></ProtectedRoute> },
];

export default clientRoutes;
