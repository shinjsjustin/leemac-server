import React, { useState, useEffect, useCallback, useRef } from 'react';
import { jarvisFetch } from './jarvisApi';

const POLL_INTERVAL_MS = 30000;

const formatTimestamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const RejectModal = ({ onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (action) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ reason, action });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h4>Reject Request</h4>
        <textarea
          placeholder="Reason for rejection (optional)..."
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="modal-btn retry"
            onClick={() => handleAction('retry')}
            disabled={isSubmitting}
          >
            Try Again
          </button>
          <button
            className="modal-btn finish"
            onClick={() => handleAction('finish')}
            disabled={isSubmitting}
          >
            Finish
          </button>
        </div>
      </div>
    </div>
  );
};

const RequestsApp = () => {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresConfirm, setRequiresConfirm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await jarvisFetch('/approvals?status=pending');
      const data = await res.json();
      if (res.ok) {
        setRequests(data);
      } else {
        setError(data.error || 'Failed to load approvals.');
      }
    } catch (err) {
      setError('Network error loading approvals.');
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    pollRef.current = setInterval(fetchApprovals, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchApprovals]);

  const removeRequest = (id) => {
    setRequests(prev => prev.filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSubmit = async (confirmFlag = false) => {
    if (!selectedId || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const body = confirmFlag ? { confirm: true } : {};
      const res = await jarvisFetch(`/approvals/${selectedId}/submit`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        if (data.requiresConfirm) {
          setRequiresConfirm(true);
        } else {
          setRequiresConfirm(false);
          removeRequest(selectedId);
        }
      } else {
        setError(data.error || 'Failed to submit approval.');
      }
    } catch (err) {
      setError('Network error submitting approval.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmedSubmit = () => {
    setRequiresConfirm(false);
    handleSubmit(true);
  };

  const handleRejectSubmit = async ({ reason, action }) => {
    if (!selectedId) return;
    setError(null);
    try {
      const res = await jarvisFetch(`/approvals/${selectedId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason, action }),
      });
      if (res.ok) {
        setShowRejectModal(false);
        removeRequest(selectedId);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to reject approval.');
        setShowRejectModal(false);
      }
    } catch (err) {
      setError('Network error rejecting approval.');
      setShowRejectModal(false);
    }
  };

  const selected = requests.find(r => r.id === selectedId) || null;

  const handleSelectRequest = (id) => {
    setSelectedId(id);
    setRequiresConfirm(false);
    setError(null);
  };

  return (
    <div className="requests-layout">
      {/* Sidebar */}
      <div className="requests-sidebar">
        <div className="requests-sidebar-header">
          <h4>Pending ({requests.length})</h4>
          <button
            className="requests-btn"
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={fetchApprovals}
          >
            Refresh
          </button>
        </div>

        {requests.length === 0 ? (
          <p className="requests-empty" style={{ padding: '20px 14px' }}>
            No pending requests.
          </p>
        ) : (
          requests.map(req => (
            <div
              key={req.id}
              className={`requests-item${selectedId === req.id ? ' selected' : ''}`}
              onClick={() => handleSelectRequest(req.id)}
            >
              <div className="requests-item-title">
                {req.title || `Request #${req.id}`}
              </div>
              <div className="requests-item-time">
                {formatTimestamp(req.created_at || req.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail panel */}
      <div className="requests-detail">
        {!selected ? (
          <p className="requests-empty">Select a request to review.</p>
        ) : (
          <>
            <h3>{selected.title || `Request #${selected.id}`}</h3>
            <p className="requests-detail-time">
              {formatTimestamp(selected.created_at || selected.createdAt)}
            </p>

            {selected.description && (
              <p className="requests-detail-desc">{selected.description}</p>
            )}

            {selected.requestPayload && (
              <div className="requests-payload-block">
                {JSON.stringify(selected.requestPayload, null, 2)}
              </div>
            )}

            {error && (
              <div style={{ color: '#dc3545', fontSize: '13px', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            {requiresConfirm && (
              <div className="requests-confirm-box">
                <p>This action requires confirmation. Proceed?</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="requests-btn submit"
                    onClick={handleConfirmedSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Confirming...' : 'Confirm & Submit'}
                  </button>
                  <button
                    className="requests-btn"
                    style={{ background: '#6c757d', color: '#fff' }}
                    onClick={() => setRequiresConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!requiresConfirm && (
              <div className="requests-actions">
                <button
                  className="requests-btn submit"
                  onClick={() => handleSubmit(false)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
                <button
                  className="requests-btn reject"
                  onClick={() => setShowRejectModal(true)}
                  disabled={isSubmitting}
                >
                  Reject
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showRejectModal && (
        <RejectModal
          onClose={() => setShowRejectModal(false)}
          onSubmit={handleRejectSubmit}
        />
      )}
    </div>
  );
};

export default RequestsApp;
