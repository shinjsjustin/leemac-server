import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Job from './Job';
import { apiFetch } from '../../api/apiFetch';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('jwt-decode', () => ({ jwtDecode: () => ({ access: 3, id: 7 }) }));
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('./Emails', () => () => <div data-testid="panel">Emails</div>);
jest.mock('../JobPage/JobHeader', () => () => <div />);
jest.mock('../JobPage/JobStageStrip', () => () => <div />);
jest.mock('../JobPage/JobParts', () => () => <div data-testid="panel">Parts</div>);
jest.mock('../JobPage/JobBilling', () => () => <div data-testid="panel">Billing</div>);
jest.mock('../JobPage/JobExpenses', () => () => <div data-testid="panel">Expenses</div>);
jest.mock('../JobPage/JobNotes', () => () => <div data-testid="panel">Notes</div>);
jest.mock('../JobPage/JobFiles', () => () => <div data-testid="panel">Files</div>);
jest.mock('../JobPage/JobDocuments', () => () => <div data-testid="panel">Documents</div>);

// CRA resets mock implementations between tests, so set the replies here.
beforeEach(() => {
    apiFetch.mockImplementation((url) => {
        if (url.startsWith('/internal/job/jobsummary')) {
            return Promise.resolve({
                status: 200,
                ok: true,
                json: async () => ({ job: { job_number: 'J-1', attention: 'a' }, parts: [] }),
            });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ stages: [], isStarred: false }) });
    });
});

const panelsIn = (container, selector) =>
    Array.from(container.querySelector(selector).querySelectorAll('[data-testid="panel"]')).map((n) => n.textContent);

test('places Documents and Files in main and Expenses in the side column', async () => {
    localStorage.setItem('token', 'x');
    let view;
    await act(async () => {
        view = render(<Job />, { path: '/job/5', route: '/job/:id' });
    });
    const { container } = view;

    expect(panelsIn(container, '.jp-main')).toEqual(['Parts', 'Billing', 'Documents', 'Files']);
    expect(panelsIn(container, '.jp-side')).toEqual(['Notes', 'Expenses', 'Emails']);
});
