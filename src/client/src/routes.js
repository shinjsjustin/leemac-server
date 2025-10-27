import About from './components/About';
import RequestQuote from './components/RequestQuote';
import AccessDenied from './components/Authentication/AccessDenied';
import Part from './components/AdminComponents/Part';
import Job from './components/AdminComponents/Job';
import Login from './components/Authentication/Login';
import AdminRegister from './components/Authentication/AdminRegister';
import PartList from './components/AdminComponents/PartList';
import JobList from './components/AdminComponents/JobList';
import AddPart from './components/AdminComponents/AddPart';
import AddJob from './components/AdminComponents/AddJob';
import StarredJobs from './components/AdminComponents/StarredJobs';
import Company from './components/AdminComponents/Company';
import Admins from './components/AdminComponents/Admins';
import AdminsDetails from './components/AdminComponents/AdminsDetails';
import NoteList from './components/AdminComponents/NoteList';
import PostRegisterPage from './components/Authentication/PostRegisterPage';
import ClientHome from './components/ClientComponents/ClientHome';
import ClientLogin from './components/Authentication/ClientLogin';
import ClientRegister from './components/Authentication/ClientRegister';
import Invoices from './components/AdminComponents/Invoices';

import ProtectedRoute from './config/ProtectedRoute';
import UnprotectedRoute from './config/UnprotectedRoute';

const routes = [
  { path: "/", element: <About /> },
  { path: "/access-denied", element: <AccessDenied /> },
  { path: "/request-quote", element: <RequestQuote /> },
  { path: "/login-admin", element: <UnprotectedRoute><Login /></UnprotectedRoute> },
  { path: "/register-admin", element: <UnprotectedRoute><AdminRegister /></UnprotectedRoute> },
  { path: "/partlist", element: <ProtectedRoute><PartList /></ProtectedRoute> },
  { path: "/part/:id", element: <ProtectedRoute requiredAccessLevel={1}><Part /></ProtectedRoute> },
  { path: "/joblist", element: <ProtectedRoute><JobList /></ProtectedRoute> },
  { path: "/job/:id", element: <ProtectedRoute requiredAccessLevel={1}><Job /></ProtectedRoute> },
  { path: "/add-part", element: <ProtectedRoute requiredAccessLevel={1}><AddPart /></ProtectedRoute> },
  { path: "/add-job", element: <ProtectedRoute requiredAccessLevel={1}><AddJob /></ProtectedRoute> },
  { path: "/starred-jobs", element: <ProtectedRoute><StarredJobs /></ProtectedRoute> },
  { path: "/company", element: <ProtectedRoute><Company /></ProtectedRoute> },
  { path: "/admins", element: <ProtectedRoute requiredAccessLevel={3}><Admins /></ProtectedRoute> },
  { path: "/admins/:id", element: <ProtectedRoute requiredAccessLevel={3}><AdminsDetails /></ProtectedRoute> },
  { path: "/notelist", element: <ProtectedRoute requiredAccessLevel={1}><NoteList /></ProtectedRoute> },
  { path: "/post-register", element: <PostRegisterPage /> },
  { path: "/client-home", element: <ProtectedRoute><ClientHome /></ProtectedRoute> },
  { path: "/client-login", element: <UnprotectedRoute><ClientLogin /></UnprotectedRoute> },
  { path: "/client-register", element: <ProtectedRoute requiredAccessLevel={3}><ClientRegister /></ProtectedRoute> },
  { path: "/invoices", element: <ProtectedRoute requiredAccessLevel={3}><Invoices /></ProtectedRoute> },
];

export default routes;
