import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createShareLink, getShareLink, turnOffShareLink } from '../../api/shareLinksApi';
import { copyText } from './copyLink';
import { expiryText, opensText, panelActions, shareUrl } from './shareLinkView';

const NOTE_MS = 2000;
const TEXT_STYLE = { color: '#333333' };
const URL_STYLE = { color: '#333333', overflowWrap: 'anywhere', wordBreak: 'break-all' };
const INPUT_STYLE = { width: '100%', maxWidth: '100%', boxSizing: 'border-box', color: '#333333', background: '#ffffff' };
const DISABLED_STYLE = { opacity: 0.5, cursor: 'not-allowed' };

const SharePanel = ({ type, targetId, companyId, accessLevel }) => {
    const [state, setState] = useState({ link: null, ready: false });
    const [status, setStatus] = useState('');
    const [result, setResult] = useState(null);
    const timer = useRef(null);

    const load = useCallback(async () => {
        const res = await getShareLink(type, targetId, companyId);
        if (!res.ok) return setStatus(res.error.message);
        setState({ link: res.data.link, ready: res.data.ready });
    }, [type, targetId, companyId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => () => clearTimeout(timer.current), []);

    const { link, ready } = state;
    const actions = panelActions({ link, ready, accessLevel });
    const url = link ? shareUrl(window.location.origin, type, link.token) : '';

    const copy = async () => {
        clearTimeout(timer.current);
        setStatus('');
        let live = link;
        if (!live) {
            const res = await createShareLink(type, targetId, companyId);
            if (!res.ok) return setStatus(res.error.message);
            live = res.data.link;
            setState({ link: live, ready });
        }
        const outcome = await copyText(shareUrl(window.location.origin, type, live.token));
        setResult(outcome);
        if (outcome === 'copied') timer.current = setTimeout(() => setResult(null), NOTE_MS);
    };

    const turnOff = async () => {
        setStatus('');
        setResult(null);
        const res = await turnOffShareLink(link.id);
        if (!res.ok) return setStatus(res.error.message);
        await load();
    };

    return (
        <div className='share-panel' style={{ ...TEXT_STYLE, maxWidth: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
            {link && (
                <div>
                    <div style={URL_STYLE}>{url}</div>
                    <small style={TEXT_STYLE}>{expiryText(link)}. {opensText(link)}.</small>
                </div>
            )}
            {actions.copy.show && (
                <button
                    type='button'
                    className='search-button'
                    onClick={copy}
                    disabled={actions.copy.disabled}
                    title={actions.copy.reason || undefined}
                    style={actions.copy.disabled ? DISABLED_STYLE : undefined}
                >
                    Copy
                </button>
            )}
            {actions.turnOff.show && <button type='button' className='search-button' onClick={turnOff}>Turn off</button>}
            {actions.copy.disabled && actions.copy.reason && <small style={TEXT_STYLE}>{actions.copy.reason}</small>}
            {result === 'copied' && <small style={TEXT_STYLE} role='status'>Copied</small>}
            {result === 'manual' && link && (
                <span style={{ display: 'block', maxWidth: '100%' }}>
                    <input
                        className='search-input'
                        style={INPUT_STYLE}
                        readOnly
                        value={url}
                        aria-label='Share link'
                        autoFocus
                        onFocus={(e) => e.target.select()}
                    />
                    <small style={TEXT_STYLE}>Press Ctrl+C or Cmd+C to copy</small>
                </span>
            )}
            {status && <small style={{ color: '#b00020' }} role='alert'>{status}</small>}
        </div>
    );
};

export default SharePanel;
