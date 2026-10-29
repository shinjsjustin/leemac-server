import About from './components/About';
import AccessDenied from './components/Authentication/AccessDenied';
import Part from './components/AdminComponents/Part';
import Job from './components/AdminComponents/Job';
import Login from './components/Authentication/Login';
import AdminRegister from './components/Authentication/AdminRegister';
import PartList from './components/AdminComponents/PartList';
import JobList from './components/AdminComponents/JobList';
import AddPart from './components/AdminComponents/AddPart';
import AdminLayout from './components/AdminLayout/AdminLayout';
import AddJob from './components/AdminComponents/AddJob';
import QuoteRequestInbox from './components/AdminComponents/QuoteRequestInbox';
import QuoteRequestReview from './components/AdminComponents/QuoteRequestReview';
import StarredJobs from './components/AdminComponents/StarredJobs';
import Company from './components/AdminComponents/Company';
import Admins from './components/AdminComponents/Admins';
import AdminsDetails from './components/AdminComponents/AdminsDetails';
import NoteList from './components/AdminComponents/NoteList';
import PostRegisterPage from './components/Authentication/PostRegisterPage';
import ClientLogin from './components/Authentication/ClientLogin';
import ClientTwoFactor from './components/Authentication/ClientTwoFactor';
import ClientRegister from './components/Authentication/ClientRegister';
import Finances from './components/AdminComponents/Finances';
import AdminUpdateCredentials from './components/Authentication/AdminUpdateCredentials';
import ClientUpdateCredentials from './components/Authentication/ClientUpdateCredentials';
import ShopUpdate from './components/AdminComponents/ShopUpdate';
import Settings from './components/AdminComponents/Settings';
import ForgotPassword from './components/Authentication/ForgotPassword';
import ResetPassword from './components/Authentication/ResetPassword';
import AcceptInvite from './components/Authentication/AcceptInvite';
import VerifyEmail from './components/Authentication/VerifyEmail';
import TwoFactor from './components/Authentication/TwoFactor';

import clientRoutes from './clientRoutes';
import ProtectedRoute from './config/ProtectedRoute';
import UnprotectedRoute from './config/UnprotectedRoute';

const routes = [
  ...clientRoutes,
  { path: "/", element: <About /> },
  { path: "/access-denied", element: <AccessDenied /> },
  { path: "/login-admin", element: <UnprotectedRoute><Login /></UnprotectedRoute> },
  { path: "/register-admin", element: <ProtectedRoute requiredAccessLevel={3}><AdminRegister /></ProtectedRoute> },
  { path: "/partlist", element: <ProtectedRoute><PartList /></ProtectedRoute> },
  { path: "/part/:id", element: <ProtectedRoute requiredAccessLevel={1}><Part /></ProtectedRoute> },
  { path: "/joblist", element: <ProtectedRoute><JobList /></ProtectedRoute> },
  { path: "/job/:id", element: <ProtectedRoute requiredAccessLevel={1}><Job /></ProtectedRoute> },
  { path: "/add-part", element: <ProtectedRoute requiredAccessLevel={1}><AdminLayout current="parts" crumb="Parts › Add part"><AddPart /></AdminLayout></ProtectedRoute> },
  { path: "/add-job", element: <ProtectedRoute requiredAccessLevel={1}><AddJob /></ProtectedRoute> },
  { path: "/quote-requests", element: <ProtectedRoute requiredAccessLevel={2}><QuoteRequestInbox /></ProtectedRoute> },
  { path: "/quote-request/:id", element: <ProtectedRoute requiredAccessLevel={2}><QuoteRequestReview /></ProtectedRoute> },
  { path: "/starred-jobs", element: <ProtectedRoute requiredAccessLevel={1}><StarredJobs /></ProtectedRoute> },
  { path: "/company", element: <ProtectedRoute><Company /></ProtectedRoute> },
  { path: "/admins", element: <ProtectedRoute requiredAccessLevel={3}><Admins /></ProtectedRoute> },
  { path: "/admins/:id", element: <ProtectedRoute requiredAccessLevel={3}><AdminsDetails /></ProtectedRoute> },
  { path: "/notelist", element: <ProtectedRoute requiredAccessLevel={1}><NoteList /></ProtectedRoute> },
  { path: "/post-register", element: <PostRegisterPage /> },
  { path: "/client-login", element: <UnprotectedRoute><ClientLogin /></UnprotectedRoute> },
  { path: "/client-two-factor", element: <UnprotectedRoute><ClientTwoFactor /></UnprotectedRoute> },
  { path: "/client-register", element: <ProtectedRoute requiredAccessLevel={3}><ClientRegister /></ProtectedRoute> },
  { path: "/finances", element: <ProtectedRoute requiredAccessLevel={3}><Finances /></ProtectedRoute> },
  { path: "/admin-update-credentials", element: <ProtectedRoute><AdminUpdateCredentials /></ProtectedRoute> },
  { path: "/client-update-credentials", element: <ProtectedRoute role="client"><ClientUpdateCredentials /></ProtectedRoute> },
  { path: "/shop-update", element: <ProtectedRoute requiredAccessLevel={1}><ShopUpdate /></ProtectedRoute> },
  { path: "/settings", element: <ProtectedRoute requiredAccessLevel={1}><Settings /></ProtectedRoute> },
  { path: "/forgot-password", element: <UnprotectedRoute><ForgotPassword /></UnprotectedRoute> },
  { path: "/reset-password", element: <UnprotectedRoute><ResetPassword /></UnprotectedRoute> },
  { path: "/accept-invite", element: <UnprotectedRoute><AcceptInvite /></UnprotectedRoute> },
  { path: "/two-factor", element: <UnprotectedRoute><TwoFactor /></UnprotectedRoute> },
  { path: "/verify-email", element: <VerifyEmail /> },
];

export default routes;
