import { useCallback, useEffect, useState } from 'react';

const EMPTY = { jobs: [], pages: 1, extra: {} };

/** Loads one page of simple job cards through `loader` (listOverview or listQuoted). */
export default function useSimpleList(loader) {
  const [page, setPage] = useState(1);
  const [reloads, setReloads] = useState(0);
  const [state, setState] = useState(EMPTY);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    loader(page).then((result) => {
      if (!isCurrent) return;
      if (!result.ok) {
        setError(result.error.message);
        setState(EMPTY);
        return;
      }
      const { jobs, pages, page: _served, ...extra } = result.data;
      setError(null);
      setState({ jobs, pages, extra });
    });
    return () => { isCurrent = false; };
  }, [loader, page, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  return { ...state, page, error, setPage, reload };
}
