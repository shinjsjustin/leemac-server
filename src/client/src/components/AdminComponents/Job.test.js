import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Job from './Job';
import { apiFetch } from '../../api/apiFetch';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
const mockCardProps = {};
let mockClaims = { access: 3, id: 7 };
jest.mock('jwt-decode', () => ({ jwtDecode: () => mockClaims }));
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('./Emails', () => () => <div data-testid="panel">Emails</div>);
jest.mock('../JobPage/JobHeader', () => (props) => {
    mockCardProps.Header = props;
    return <div />;
});
jest.mock('../JobPage/JobStageStrip', () => () => <div />);
jest.mock('../JobPage/JobParts', () => (props) => {
    mockCardProps.Parts = props;
    return <div data-testid="panel">Parts</div>;
});
jest.mock('../JobPage/JobBilling', () => (props) => {
    mockCardProps.Billing = props;
    return <div data-testid="panel">Billing</div>;
});
jest.mock('../JobPage/JobExpenses', () => () => <div data-testid="panel">Expenses</div>);
jest.mock('../JobPage/JobNotes', () => (props) => {
    mockCardProps.Notes = props;
    return <div data-testid="panel">Notes</div>;
});
const mockFilesProps = [];
jest.mock('../JobPage/JobFiles', () => (props) => {
    mockFilesProps.push(props);
    return <div data-testid="panel">Files</div>;
});
jest.mock('../JobPage/JobDocuments', () => () => <div data-testid="panel">Documents</div>);

// CRA resets mock implementations between tests, so set the replies here.
beforeEach(() => {
    mockClaims = { access: 3, id: 7 };
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

test('passes the token access level to the Files card', async () => {
    localStorage.setItem('token', 'x');
    await act(async () => {
        render(<Job />, { path: '/job/5', route: '/job/:id' });
    });
    expect(mockFilesProps.at(-1).accessLevel).toBe(3);
});

test.each([
    [3, { access: 3, id: 7 }],
    [2, { access: 2, id: 7 }],
    [0, { id: 7 }],
])('passes accessLevel %i to every gated card', async (expected, claims) => {
    mockClaims = claims;
    localStorage.setItem('token', 'x');
    await act(async () => {
        render(<Job />, { path: '/job/5', route: '/job/:id' });
    });
    for (const card of ['Header', 'Parts', 'Billing', 'Notes']) {
        expect(mockCardProps[card].accessLevel).toBe(expected);
    }
    expect(mockFilesProps.at(-1).accessLevel).toBe(expected);
});
