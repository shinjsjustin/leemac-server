import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import AdminLayout from '../AdminLayout/AdminLayout';
import Emails from './Emails';
import JobHeader from '../JobPage/JobHeader';
import JobStageStrip from '../JobPage/JobStageStrip';
import JobParts from '../JobPage/JobParts';
import JobBilling from '../JobPage/JobBilling';
import JobExpenses from '../JobPage/JobExpenses';
import JobNotes from '../JobPage/JobNotes';
import JobFiles from '../JobPage/JobFiles';
import '../JobPage/jobPage.css';
import { apiFetch } from '../../api/apiFetch';

const Job = () => {
    const { id } = useParams();
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;
    const userId = decodedToken?.id;

    const [job, setJob] = useState(null);
    const [parts, setParts] = useState([]);
    const [stages, setStages] = useState([]);
    const [expensesTotal, setExpensesTotal] = useState(0);
    const [filesKey, setFilesKey] = useState(0);
    const [isCurrentJobStarred, setIsCurrentJobStarred] = useState(false);

    const fetchJobDetails = useCallback(async () => {
        try {
            const res = await apiFetch(`/internal/job/jobsummary?id=${id}`);
            const data = await res.json();
            if (res.status === 200) {
                setJob(data.job);
                setParts(data.parts);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [id]);

    const fetchStages = useCallback(async () => {
        try {
            const res = await apiFetch(`/internal/job/jobstages?id=${id}`);
            if (res.ok) setStages((await res.json()).stages);
        } catch (e) {
            console.error('Error fetching job stages:', e);
        }
    }, [id]);

    const checkCurrentJobStarred = useCallback(async () => {
        try {
            const response = await apiFetch(`/internal/job/checkjobstarred?jobId=${id}`);
            if (response.ok) {
                setIsCurrentJobStarred((await response.json()).isStarred);
            } else {
                console.error('Failed to check starred status');
                setIsCurrentJobStarred(false);
            }
        } catch (e) {
            console.error('Error checking starred status:', e);
            setIsCurrentJobStarred(false);
        }
    }, [id]);

    useEffect(() => {
        fetchJobDetails();
        fetchStages();
        checkCurrentJobStarred();
    }, [fetchJobDetails, fetchStages, checkCurrentJobStarred]);

    const handleStarJob = async () => {
        if (parts.length === 0) {
            return alert('No parts to star. Please add parts to this job first.');
        }
        try {
            await Promise.all(parts.map(part =>
                apiFetch('/internal/job/starjob', {
                    method: 'POST',
                    body: { jobPartId: part.job_part_id, attention: job.attention },
                })
            ));
            alert('Job starred successfully!');
            setIsCurrentJobStarred(true);
            fetchStages();
        } catch (e) {
            console.error(e);
            alert('An error occurred while starring the job.');
        }
    };

    const handleUnstarJob = async () => {
        try {
            await Promise.all(parts.map(part =>
                apiFetch('/internal/job/unstarjob', {
                    method: 'DELETE',
                    body: { jobPartId: part.job_part_id },
                })
            ));
            alert('Job unstarred successfully!');
            setIsCurrentJobStarred(false);
            fetchStages();
        } catch (e) {
            console.error(e);
            alert('An error occurred while unstarring the job.');
        }
    };

    // Billing and cost edits pass the changed fields; part edits pass nothing and refetch.
    const handleJobChanged = (patch) => {
        if (patch) setJob((prev) => ({ ...prev, ...patch }));
        else fetchJobDetails();
    };

    const handleFilesChanged = () => setFilesKey((k) => k + 1);

    if (!job) {
        return <AdminLayout current="jobs" crumb="Jobs"><p>Loading…</p></AdminLayout>;
    }

    return (
        <AdminLayout current="jobs" crumb={`Jobs › ${job.job_number}`}>
            <JobHeader
                job={job}
                jobId={id}
                parts={parts}
                expensesTotal={expensesTotal}
                accessLevel={accessLevel}
                isStarred={isCurrentJobStarred}
                onStar={handleStarJob}
                onUnstar={handleUnstarJob}
                onEdited={fetchJobDetails}
                onFilesChanged={handleFilesChanged}
            />
            <JobStageStrip parts={parts} stages={stages} />
            <div className="jp-grid">
                <div className="jp-main">
                    <JobParts
                        jobId={id}
                        job={job}
                        parts={parts}
                        setParts={setParts}
                        stages={stages}
                        accessLevel={accessLevel}
                        onStagesChanged={fetchStages}
                        onJobChanged={handleJobChanged}
                    />
                    <JobBilling jobId={id} job={job} accessLevel={accessLevel} onJobChanged={handleJobChanged} />
                    <JobExpenses jobId={id} job={job} accessLevel={accessLevel} onTotal={setExpensesTotal} />
                </div>
                <aside className="jp-side">
                    <JobNotes jobId={id} userId={userId} accessLevel={accessLevel} />
                    <JobFiles jobId={id} refreshKey={filesKey} />
                    <Emails jobId={id} />
                </aside>
            </div>
        </AdminLayout>
    );
};

export default Job;
