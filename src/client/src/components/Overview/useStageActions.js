import { useState } from 'react';
import { apiFetch } from '../../api/apiFetch';

const stageRequest = (jobPartId, status) => ({
  method: 'PUT',
  path: '/internal/job/setstarstage',
  body: { jobPartId, status },
  patch: (reply) => ({ status: reply.status }),
  undo: (reply) => stageRequest(jobPartId, reply.previous),
});

const finishRequest = (jobPartId) => ({
  method: 'POST',
  path: '/internal/job/finishpart',
  body: { jobPartId },
  patch: (reply) => ({ status: reply.status }),
  undo: (reply) => stageRequest(jobPartId, reply.previous),
});

const flagRequest = (jobPartId, flag, on) => ({
  method: 'PUT',
  path: '/internal/job/setstarflag',
  body: { jobPartId, flag, on },
  patch: () => ({ [flag]: on }),
  undo: () => flagRequest(jobPartId, flag, !on),
});

// onChange(jobPartId, patch) is called only after the server accepted the change.
export default function useStageActions(onChange) {
  const [toast, setToast] = useState(null);

  const run = async (request, canUndo = true) => {
    try {
      const res = await apiFetch(request.path, { method: request.method, body: request.body });
      const reply = await res.json();
      if (!res.ok) throw new Error(reply.error || 'Request failed');
      onChange(request.body.jobPartId, request.patch(reply));
      setToast({
        kind: 'ok',
        message: 'Client portal updated',
        ...(canUndo && { undo: () => run(request.undo(reply), false) }),
      });
    } catch (e) {
      setToast({ kind: 'error', message: `Could not update: ${e.message}` });
    }
  };

  return {
    toast,
    dismiss: () => setToast(null),
    fail: (message) => setToast({ kind: 'error', message }),
    setStage: (jobPartId, status) => run(stageRequest(jobPartId, status)),
    finish: (jobPartId) => run(finishRequest(jobPartId)),
    setFlag: (jobPartId, flag, on) => run(flagRequest(jobPartId, flag, on)),
  };
}
