import React, { useEffect, useRef, useState } from 'react';
import { copyText } from './copyLink';

const NOTE_MS = 2000;

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
        <span className='copy-link'>
            <button type='button' className='search-button' onClick={copy}>{label}</button>
            {result === 'copied' && <small>Copied</small>}
            {result === 'manual' && (
                <>
                    <input
                        className='search-input'
                        readOnly
                        value={link}
                        aria-label={label}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                    />
                    <small>Press Ctrl+C or Cmd+C to copy</small>
                </>
            )}
        </span>
    );
};

export default CopyLinkButton;
