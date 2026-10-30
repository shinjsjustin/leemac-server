import React, { useEffect, useRef, useState } from 'react';
import { addNote } from '../../api/portalNotesApi';
import '../Styling/PortalPins.css';

const HOVER_DELAY_MS = 300;
const CARD_WIDTH_PX = 300;
const PHONE_QUERY = '(max-width: 599px)';

const isPhone = () => Boolean(window.matchMedia?.(PHONE_QUERY).matches);

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map((word) => word[0].toUpperCase()).join('').slice(0, 2);
}

function NoteItem({ note }) {
  return (
    <li className="portal-pin-note">
      <div className="portal-pin-by">
        <b className={`portal-pin-note-tag${note.is_client ? '' : ' portal-pin-note-tag--leemac'}`}>
          {note.is_client ? initials(note.author) : 'LEEMAC'}
        </b>
        <em>{note.author}</em>
        <time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time>
      </div>
      <p className="portal-pin-text">{note.content}</p>
    </li>
  );
}

function Reply({ target, onAdded, placeholder = 'Reply', inputRef }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setIsSending(true);
    const result = await addNote(target, text);
    setIsSending(false);
    if (!result.ok) return setError(result.error.message);
    setError(null);
    setText('');
    onAdded?.();
  };

  return (
    <form className="portal-pin-reply" onSubmit={submit}>
      <textarea
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {error && <p className="portal-pin-error" role="alert">{error}</p>}
      {text.trim() && <button type="submit" disabled={isSending}>Send</button>}
    </form>
  );
}

export function Thread({ notes, target, onAdded, allowReply, placeholder, inputRef }) {
  return (
    <>
      <ul className="portal-pin-thread">
        {notes.map((note) => <NoteItem key={note.id} note={note} />)}
      </ul>
      {allowReply && <Reply target={target} onAdded={onAdded} placeholder={placeholder} inputRef={inputRef} />}
    </>
  );
}

/** Wraps a row or card: the whole wrapper is the hover area for its notes pin. */
export function NoteTarget({ notes = [], target, onAdded, allowReply = true, label = 'Notes', children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [side, setSide] = useState('right');
  const wrapperRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (notes.length === 0 && !allowReply) return <>{children}</>;

  const open = () => {
    const { right } = wrapperRef.current.getBoundingClientRect();
    setSide(window.innerWidth - right < CARD_WIDTH_PX ? 'left' : 'right');
    setIsOpen(true);
  };
  const close = () => {
    clearTimeout(timerRef.current);
    setIsOpen(false);
  };
  const handleEnter = () => {
    if (isPhone()) return;
    timerRef.current = setTimeout(open, HOVER_DELAY_MS);
  };
  const handleFocus = () => {
    if (!isPhone()) open();
  };
  const handleBlur = (event) => {
    if (!wrapperRef.current.contains(event.relatedTarget)) close();
  };
  const handleTap = () => {
    if (isPhone()) setIsSheetOpen(true);
  };

  const hasLeemacNote = notes.some((note) => !note.is_client);
  const thread = <Thread notes={notes} target={target} onAdded={onAdded} allowReply={allowReply} />;

  return (
    <div
      ref={wrapperRef}
      className={`portal-pin-target${isOpen ? ' portal-pin-target--hot' : ''}`}
      onMouseEnter={handleEnter}
      onMouseLeave={close}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
      {notes.length > 0 && (
        <button
          type="button"
          className={`portal-pin${hasLeemacNote ? ' portal-pin--leemac' : ''}`}
          aria-label={`${notes.length} notes`}
          onClick={handleTap}
        >
          {notes.length}
        </button>
      )}
      {notes.length === 0 && allowReply && isPhone() && (
        <button type="button" className="portal-pin portal-pin--empty" aria-label="Add a note" onClick={handleTap}>
          +
        </button>
      )}
      {isOpen && <div className="portal-pin-card" data-side={side}>{thread}</div>}
      {isSheetOpen && (
        <>
          <div className="portal-pin-backdrop" onClick={() => setIsSheetOpen(false)} />
          <div className="portal-pin-sheet" role="dialog" aria-label={label}>
            <button type="button" className="portal-pin-close" aria-label="Close notes" onClick={() => setIsSheetOpen(false)}>
              Close
            </button>
            <h3 className="portal-pin-sheet-title">{label}</h3>
            {notes.length === 0 && <p className="portal-pin-empty">No notes yet</p>}
            {thread}
          </div>
        </>
      )}
    </div>
  );
}
