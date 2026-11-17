import React from 'react';
import { Navigate } from 'react-router-dom';
import ClientOverview from './components/ClientComponents/ClientOverview';
import ClientHome from './components/ClientComponents/ClientHome';
import ClientJob from './components/ClientComponents/ClientJob';
import ClientPartsPage from './components/ClientComponents/ClientPartsPage';
import ClientSharedList from './components/ClientComponents/ClientSharedList';
import ClientPartPage from './components/ClientComponents/ClientPartPage';
import ClientRequestsPage from './components/ClientComponents/ClientRequestsPage';
import ClientRequestPage from './components/ClientComponents/ClientRequestPage';
import ClientSharedInvite from './components/ClientComponents/ClientSharedInvite';
import ShareQuotePage from './components/ClientComponents/ShareQuotePage';
import ShareQcPage from './components/ClientComponents/ShareQcPage';
import UserGuide from './components/ClientComponents/UserGuide';
import ProtectedRoute from './config/ProtectedRoute';
import ClientLoginRoute from './config/ClientLoginRoute';

const clientRoutes = [
  { path: '/client-overview', element: <ProtectedRoute role="client"><ClientOverview /></ProtectedRoute> },
  { path: '/client-home', element: <ProtectedRoute role="client"><ClientHome /></ProtectedRoute> },
  { path: '/client-job/:id', element: <ClientLoginRoute><ClientJob /></ClientLoginRoute> },
  { path: '/client-parts', element: <ProtectedRoute role="client"><ClientPartsPage /></ProtectedRoute> },
  { path: '/client-parts/shared/:id', element: <ProtectedRoute role="client"><ClientSharedList /></ProtectedRoute> },
  { path: '/client-part/:id', element: <ClientLoginRoute><ClientPartPage /></ClientLoginRoute> },
  { path: '/client-requests', element: <ProtectedRoute role="client"><ClientRequestsPage /></ProtectedRoute> },
  { path: '/client-request', element: <ProtectedRoute role="client"><Navigate to="/client-requests" replace /></ProtectedRoute> },
  { path: '/client-request/new', element: <ProtectedRoute role="client"><ClientRequestPage /></ProtectedRoute> },
  { path: '/client-request/:id', element: <ProtectedRoute role="client"><ClientRequestPage /></ProtectedRoute> },
  { path: '/client-guide', element: <ProtectedRoute role="client"><UserGuide /></ProtectedRoute> },
  { path: '/client-shared/:token', element: <ClientSharedInvite /> },
  { path: '/share/quote/:token', element: <ShareQuotePage /> },
  { path: '/share/qc/:token', element: <ShareQcPage /> },
];

export default clientRoutes;
