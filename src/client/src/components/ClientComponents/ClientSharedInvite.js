import { jwtDecode } from 'jwt-decode';
import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { isAllowed } from '../../config/access';
import { previewSharedList, joinSharedList } from '../../api/portalListsApi';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';

const decodeStored = () => {
  try {
    return jwtDecode(localStorage.getItem('token'));
  } catch {
    return null;
  }
};

function InvitePreview({ token }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading' });
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    previewSharedList(token).then((result) => {
      if (!isCurrent) return;
      if (!result.ok) {
        setState({ status: result.error.kind === 'not_found' ? 'not_found' : 'error' });
      } else {
        setState(result.data ? { status: 'ready', list: result.data } : { status: 'not_found' });
      }
    });
    return () => { isCurrent = false; };
  }, [token]);

  const join = async () => {
    setJoinError('');
    const result = await joinSharedList(token);
    if (!result.ok || !result.data) {
      setJoinError('We could not join this list. Please try again.');
      return;
    }
    navigate(`/client-parts/shared/${state.list.id}`);
  };

  const { status, list } = state;
  return (
    <PortalLayout title={list ? list.name : 'Shared list'}>
      {status === 'loading' && <PortalMessage kind="loading" />}
      {status === 'error' && <PortalMessage kind="error" />}
      {status === 'not_found' && (
        <PortalMessage kind="not_found" heading="We couldn't find that list" message="The link may have expired or been turned off." />
      )}
      {status === 'ready' && (
        <>
          <ul>
            {list.parts.map((part) => (
              <li key={part.part_id}>
                {part.part_number} {part.part_description}
                {part.files.map((file) => (
                  <a key={file.id} href={file.url} target="_blank" rel="noreferrer"> {file.filename}</a>
                ))}
              </li>
            ))}
          </ul>
          {list.joined
            ? <Link className="portal-button" to={`/client-parts/shared/${list.id}`}>Open list</Link>
            : <button type="button" className="portal-button" onClick={join}>Join list</button>}
          {joinError && <p className="portal-error" role="alert">{joinError}</p>}
        </>
      )}
    </PortalLayout>
  );
}

// Not wrapped in ProtectedRoute: a logged-out visitor is sent to login and brought back here.
export default function ClientSharedInvite() {
  const { token } = useParams();
  const decoded = decodeStored();

  if (isAllowed(decoded, { role: 'client' })) return <InvitePreview token={token} />;
  if (isAllowed(decoded, { role: 'admin' })) return <Navigate to="/access-denied" />;

  // UnprotectedRoute bounces any stored token away from login, so drop a dead one.
  localStorage.removeItem('token');
  return <Navigate to={`/client-login?next=${encodeURIComponent(`/client-shared/${token}`)}`} replace />;
}
