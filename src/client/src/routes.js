import About from './components/About';
import RequestQuote from './components/RequestQuote';
import AccessDenied from './components/Authentication/AccessDenied';
import Part from './components/AdminComponents/Part';
import Job from './components/AdminComponents/Job';
import Login from './components/Authentication/Login';
import AdminRegister from './components/Authentication/AdminRegister';
import ClientRegister from './components/Authentication/ClientRegister';
import PartList from './components/AdminComponents/PartList';
import JobList from './components/AdminComponents/JobList';
import AddPart from './components/AdminComponents/AddPart';
import AddJob from './components/AdminComponents/AddJob';
import GoogleSheet from './components/GoogleSheet';

import ProtectedRoute from './config/ProtectedRoute';
import UnprotectedRoute from './config/UnprotectedRoute';

const routes = [
  { path: "/", element: <About /> },
  { path: "/access-denied", element: <AccessDenied /> },
  { path: "/request-quote", element: <RequestQuote /> },
  { path: "/login-admin", element: <UnprotectedRoute><Login code={0} /></UnprotectedRoute> },
  { path: "/login-client", element: <UnprotectedRoute><Login code={1} /></UnprotectedRoute> },
  { path: "/register-admin", element: <UnprotectedRoute><AdminRegister /></UnprotectedRoute> },
  { path: "/register-client", element: <UnprotectedRoute><ClientRegister /></UnprotectedRoute> },
  { path: "/partlist", element: <ProtectedRoute><PartList /></ProtectedRoute> },
  { path: "/joblist", element: <ProtectedRoute><JobList /></ProtectedRoute> },
  { path: "/part/:id", element: <ProtectedRoute><Part /></ProtectedRoute> },
  { path: "/job/:id", element: <ProtectedRoute><Job /></ProtectedRoute> },
  { path: "/add-part", element: <ProtectedRoute><AddPart /></ProtectedRoute> },
  { path: "/add-job", element: <ProtectedRoute><AddJob /></ProtectedRoute> },
  { path: "/google-sheet", element: <ProtectedRoute><GoogleSheet /></ProtectedRoute> },
];

export default routes;
