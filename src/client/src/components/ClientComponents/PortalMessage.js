import React from 'react';
import { Link } from 'react-router-dom';
import '../Styling/ClientPortal.css';

const STATES = {
  empty: { heading: 'Nothing here yet', text: 'There is nothing to show right now. Check back soon.' },
  not_found: {
    heading: "We couldn't find that job",
    text: 'It may have been removed, or it may belong to a different account.',
    link: { to: '/client-home', label: 'Back to your jobs' },
  },
  signed_out: {
    heading: 'You are signed out',
    text: 'Your session has ended. Please sign in to continue.',
    link: { to: '/client-login', label: 'Sign in again' },
  },
  busy: { heading: 'We are a little busy', text: 'Too many requests at once. Please wait a moment and try again.' },
  error: { heading: 'Something went wrong', text: 'We could not load this page. Please try again.' },
  loading: { heading: 'Loading', text: 'One moment while we fetch your information.' },
};

const PortalMessage = ({ kind, message, heading: headingOverride }) => {
  const { heading, text, link } = STATES[kind];
  const body = message ? message : text;
  return (
    <div className="portal-message" role={kind === 'error' ? 'alert' : 'status'}>
      <h2>{headingOverride || heading}</h2>
      <p>{body}</p>
      {link && <Link className="portal-button" to={link.to}>{link.label}</Link>}
    </div>
  );
};

export default PortalMessage;
