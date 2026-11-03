import React from 'react';
import ProtectedRoute from './config/ProtectedRoute';
import SimpleOverview from './components/Simple/SimpleOverview';
import SimpleQuoted from './components/Simple/SimpleQuoted';

const SIMPLE_LEVEL = 2;

const simpleRoutes = [
  { path: '/simple-overview', element: <ProtectedRoute requiredAccessLevel={SIMPLE_LEVEL}><SimpleOverview /></ProtectedRoute> },
  { path: '/quoted', element: <ProtectedRoute requiredAccessLevel={SIMPLE_LEVEL}><SimpleQuoted /></ProtectedRoute> },
];

export default simpleRoutes;
