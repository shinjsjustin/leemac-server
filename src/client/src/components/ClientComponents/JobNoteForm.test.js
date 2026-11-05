import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { render } from '../../testUtils/render';
import JobNoteForm from './JobNoteForm';
import { addNote, editNote } from '../../api/portalNotesApi';

jest.mock('../../api/portalNotesApi', () => ({ addNote: jest.fn(), editNote: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const note = (id, content, mine) => ({ id, content, mine, author: mine ? 'Pat' : 'Sam', is_client: true, created_at: '2026-10-01T00:00:00Z' });
const LEEMAC = { id: 9, content: 'We will ship Friday', mine: false, author: 'Leemac', is_client: false, created_at: '2026-10-02T00:00:00Z' };

let view;
let onClose;
let onNoteAdded;
const mount = (props) => {
  view = render(<JobNoteForm jobId={7} jobNumber="J-7" notes={[]} onClose={onClose} onNoteAdded={onNoteAdded} {...props} />);
  return view.container;
};
const field = (c) => c.querySelector('textarea');
const saveButton = (c) => [...c.querySelectorAll('button')].find((b) => b.textContent === 'Save');
const typeInto = (input, value) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const save = (c) => act(async () => { saveButton(c).click(); });

beforeEach(() => {
  onClose = jest.fn();
  onNoteAdded = jest.fn();
  addNote.mockReset().mockResolvedValue({ ok: true, data: { id: 1 } });
  editNote.mockReset().mockResolvedValue({ ok: true, data: { id: 1 } });
});
afterEach(() => view && view.unmount());

describe('JobNoteForm', () => {
  it('opens filled with the latest of the client\'s own notes', () => {
    const c = mount({ notes: [note(1, 'old', true), LEEMAC, note(2, 'latest', true)] });
    expect(field(c).value).toBe('latest');
  });

  it('saves an existing note with editNote, then refreshes and closes', async () => {
    const c = mount({ notes: [note(1, 'old', true), note(2, 'latest', true)] });
    typeInto(field(c), 'changed');
    await save(c);
    expect(editNote).toHaveBeenCalledWith(2, 'changed');
    expect(addNote).not.toHaveBeenCalled();
    expect(onNoteAdded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves a first note with addNote for the job', async () => {
    const c = mount({ notes: [LEEMAC] });
    expect(field(c).value).toBe('');
    typeInto(field(c), 'Hello');
    await save(c);
    expect(addNote).toHaveBeenCalledWith({ job_id: 7 }, 'Hello');
    expect(editNote).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows other notes read-only without a reply box', () => {
    const c = mount({ notes: [note(1, 'mine', true), LEEMAC, note(3, 'a colleague', false)] });
    const texts = [...c.querySelectorAll('.portal-pin-text')].map((p) => p.textContent);
    expect(texts).toEqual(['We will ship Friday', 'a colleague']);
    expect(c.querySelectorAll('textarea')).toHaveLength(1);
  });

  it('keeps the text, shows the error and stays open when saving fails', async () => {
    editNote.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Too long' } });
    const c = mount({ notes: [note(1, 'old', true)] });
    typeInto(field(c), 'my edit');
    await save(c);
    expect(c.querySelector('[role="alert"]').textContent).toBe('Too long');
    expect(field(c).value).toBe('my edit');
    expect(onNoteAdded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables Save when blank and limits the text to 255 characters', () => {
    const c = mount();
    expect(saveButton(c).disabled).toBe(true);
    typeInto(field(c), '   ');
    expect(saveButton(c).disabled).toBe(true);
    typeInto(field(c), 'x');
    expect(saveButton(c).disabled).toBe(false);
    expect(field(c).maxLength).toBe(255);
  });

  it('closes on Escape and on a backdrop click', () => {
    const c = mount();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => { c.querySelector('.portal-note-form-backdrop').click(); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps what was typed when the notes refresh underneath it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const form = (notes) => <JobNoteForm jobId={7} jobNumber="J-7" notes={notes} onClose={onClose} onNoteAdded={onNoteAdded} />;
    act(() => root.render(form([note(1, 'old', true)])));
    typeInto(field(container), 'half typed');
    act(() => root.render(form([note(1, 'old', true), LEEMAC])));
    expect(field(container).value).toBe('half typed');
    act(() => root.unmount());
    container.remove();
  });
});
