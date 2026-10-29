import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

const GROUPS = [
  {
    title: 'Parts',
    field: 'parts',
    toRow: (p) => ({ id: `part-${p.part_id}`, to: `/part/${p.part_id}`, main: p.number, sub: p.description }),
  },
  {
    title: 'Jobs',
    field: 'jobs',
    toRow: (j) => ({ id: `job-${j.id}`, to: `/job/${j.id}`, main: j.job_number, sub: [j.company_name, j.attention].filter(Boolean).join(' · ') }),
  },
  {
    title: 'Invoices',
    field: 'invoices',
    toRow: (i) => ({ id: `invoice-${i.job_id}`, to: `/job/${i.job_id}`, main: i.invoice_number, sub: `Job ${i.job_number} · ${i.company_name || ''}` }),
  },
];

const groupResults = (results) =>
  GROUPS.map((g) => ({ title: g.title, rows: (results?.[g.field] || []).map(g.toRow) })).filter((g) => g.rows.length > 0);

const CommandSearch = () => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setResults(null);
      return undefined;
    }
    let isCurrent = true;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/internal/search?q=${encodeURIComponent(term)}`);
        const data = res.ok ? await res.json() : null;
        if (isCurrent) {
          setResults(data);
          setActive(0);
        }
      } catch (e) {
        if (isCurrent) setResults(null);
      }
    }, DEBOUNCE_MS);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query]);

  const groups = groupResults(results);
  const flat = groups.flatMap((g) => g.rows);

  const open = useCallback((row) => {
    setQuery('');
    navigate(row.to);
  }, [navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flat[active]) {
      open(flat[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="admin-search">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search jobs, parts, POs, invoices…"
        aria-label="Search"
      />
      <kbd>⌘K</kbd>
      {flat.length > 0 && (
        <div className="admin-search-results">
          {groups.map((g) => (
            <div key={g.title}>
              <h6>{g.title}</h6>
              {g.rows.map((row) => (
                <div
                  key={row.id}
                  className={`admin-search-res${row === flat[active] ? ' hl' : ''}`}
                  onClick={() => open(row)}
                >
                  <b>{row.main}</b> <small>{row.sub}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommandSearch;
