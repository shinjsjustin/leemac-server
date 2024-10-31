import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route } from "react-router-dom";

// import Home from './components/Home'
import About from './components/About';
import RequestQuote from './components/RequestQuote';
import Admin from './components/Admin';
import AccessDenied from './components/Authentication/AccessDenied';
import RequestDetails from './components/AdminComponents/RequestDetails';
import Login from './components/Authentication/Login';
import AdminRegister from './components/Authentication/AdminRegister';
import ClientRegister from './components/Authentication/ClientRegister';
// import GoogleSheet from './components/GoogleSheet';

import ProtectedRoute from './config/ProtectedRoute';
import UnprotectedRoute from './config/UnprotectedRoute';

export default function App(){
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element = {<About/>} />
        {/* <Route path="/about" element = {<About/>} /> */}
        <Route path="/access-denied" element = {<AccessDenied/>} />
        <Route path="/request-quote" element = {<RequestQuote/>} />
        {/* <Route path="/sheets" element = {<GoogleSheet/>} /> */}
        <Route path="/login-admin" element = {
          <UnprotectedRoute><Login code={0}/></UnprotectedRoute>
          } />
        <Route path="/login-client" element = {
          <UnprotectedRoute><Login code={1}/></UnprotectedRoute>
          } />
        <Route path="/register-admin" element = {
          <UnprotectedRoute><AdminRegister/></UnprotectedRoute>
          } />
        <Route path="/register-client" element = {
          <UnprotectedRoute><ClientRegister/></UnprotectedRoute>
          } />
        <Route path="/admin" element = {
          <ProtectedRoute><Admin/></ProtectedRoute>
        } />
        <Route path="/requests/:id" element = {
          <ProtectedRoute><RequestDetails/></ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
