import React from 'react';
import PortalLayout from './PortalLayout';
import JobList from './JobList';

const ClientHome = () => (
    <PortalLayout title="Your jobs" wide hideTitle>
        <JobList />
    </PortalLayout>
);

export default ClientHome;
