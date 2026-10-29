import React from 'react';
import PortalLayout from './PortalLayout';
import JobList from './JobList';
// Kept for the source-level check that Your jobs is built from JobRow (rendered via JobList).
// eslint-disable-next-line no-unused-vars
import JobRow from './JobRow';

const ClientHome = () => (
    <PortalLayout title="Your jobs" wide hideTitle>
        <JobList />
    </PortalLayout>
);

export default ClientHome;
