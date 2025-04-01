import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route } from "react-router-dom";

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
        <Route path="/partlist" element = {
          <ProtectedRoute><PartList/></ProtectedRoute>
        } />
        <Route path="/joblist" element = {
          <ProtectedRoute><JobList/></ProtectedRoute>
        } />
        <Route path="/part/:id" element = {
          <ProtectedRoute><Part/></ProtectedRoute>
        } />
        <Route path="/job/:id" element = {
          <ProtectedRoute><Job/></ProtectedRoute>
        } />
        <Route path="/add-part" element = {
          <ProtectedRoute><AddPart/></ProtectedRoute>
        } />
        <Route path="/add-job" element = {
          <ProtectedRoute><AddJob/></ProtectedRoute>
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
