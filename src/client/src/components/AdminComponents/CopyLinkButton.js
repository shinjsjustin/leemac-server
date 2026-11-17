import React, { useEffect, useRef, useState } from 'react';
import { copyText } from './copyLink';

const NOTE_MS = 2000;

// The note floats under the button so showing it never moves the header row; it carries its own colours
// because admin pages inherit a light text colour from the dark shell.
const WRAP_STYLE = { position: 'relative', display: 'inline-block' };
const PANEL_STYLE = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '4px 8px',
    background: '#ffffff',
    color: '#333333',
    border: '1px solid #d0d4da',
    borderRadius: '4px',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
    whiteSpace: 'nowrap',
};
const INPUT_STYLE = { minWidth: '220px', color: '#333333', background: '#ffffff' };

const CopyLinkButton = ({ label = 'Copy client link', link }) => {
    const [result, setResult] = useState(null);
    const timer = useRef(null);

    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = async () => {
        clearTimeout(timer.current);
        const outcome = await copyText(link);
        setResult(outcome);
        if (outcome === 'copied') {
            timer.current = setTimeout(() => setResult(null), NOTE_MS);
        }
    };

    return (
        <span className='copy-link' style={WRAP_STYLE}>
            <button type='button' className='search-button' onClick={copy}>{label}</button>
            {result === 'copied' && (
                <span style={PANEL_STYLE} role='status'><small>Copied</small></span>
            )}
            {result === 'manual' && (
                <span style={PANEL_STYLE}>
                    <input
                        className='search-input'
                        style={INPUT_STYLE}
                        readOnly
                        value={link}
                        aria-label={label}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                    />
                    <small>Press Ctrl+C or Cmd+C to copy</small>
                </span>
            )}
        </span>
    );
};

export default CopyLinkButton;
