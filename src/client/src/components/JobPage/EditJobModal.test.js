import { act } from 'react';
import { render } from '../../testUtils/render';
import EditJobModal from './EditJobModal';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/jobDocumentsApi', () => ({}));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const respond = (status, body) => ({ status, json: async () => body });

async function submit(updateResponse) {
  apiFetch.mockImplementation(async (path) =>
    path.includes('getcompanies') ? respond(200, []) : updateResponse);
  const onEdited = jest.fn();
  let view;
  await act(async () => {
    view = render(<EditJobModal job={{}} jobId={7} accessLevel={3} onClose={jest.fn()} onEdited={onEdited} />);
  });
  await act(async () => {
    view.container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  return { onEdited };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.alert = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('alerts the server error text when the update fails', async () => {
  const { onEdited } = await submit(respond(409, { error: 'Invoice number INV-5 is already used' }));
  expect(window.alert).toHaveBeenCalledWith('Invoice number INV-5 is already used');
  expect(onEdited).not.toHaveBeenCalled();
});

test.each([
  ['missing', {}],
  ['empty', { error: '' }],
  ['not a string', { error: { code: 1 } }],
])('alerts the old message when the error is %s', async (_name, body) => {
  await submit(respond(500, body));
  expect(window.alert).toHaveBeenCalledWith('Failed to update job details.');
});

test('alerts success and calls onEdited on 200', async () => {
  const { onEdited } = await submit(respond(200, {}));
  expect(window.alert).toHaveBeenCalledWith('Job details updated successfully!');
  expect(onEdited).toHaveBeenCalledTimes(1);
});
