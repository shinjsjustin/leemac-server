import React, { useRef, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';

// Ported from AdminComponents/StarredJobs.js startNfcPairing, cancelNfcPairing, handleUnpairNfc.
export default function NfcPair({ jobPartId, paired, onChanged }) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  if (!('NDEFReader' in window)) return <span className="nfc-na">NFC not supported here</span>;

  const unpair = async () => {
    setError(null);
    try {
      const res = await apiFetch('/internal/job/unpairnfctag', { method: 'PUT', body: { jobPartId } });
      if (res.ok) {
        onChanged();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to disconnect NFC tag.');
    } catch {
      setError('Network error while disconnecting.');
    }
  };

  const start = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const reader = new window.NDEFReader();
      const abort = new AbortController();
      abortRef.current = abort;
      await reader.scan({ signal: abort.signal });
      reader.onreading = async (event) => {
        abort.abort();
        setIsScanning(false);
        try {
          const res = await apiFetch('/internal/job/pairnfctag', {
            method: 'PUT',
            body: { jobPartId, nfcTagId: event.serialNumber },
          });
          if (res.ok) onChanged();
          else setError((await res.json()).error || 'Pairing failed.');
        } catch {
          setError('Network error during pairing.');
        }
      };
      reader.onreadingerror = () => {
        setIsScanning(false);
        setError('Failed to read NFC tag. Try again.');
      };
    } catch (e) {
      setIsScanning(false);
      setError(e.message || 'NFC scan failed.');
    }
  };

  const cancel = () => {
    if (abortRef.current) abortRef.current.abort();
    setIsScanning(false);
  };

  if (paired) {
    return <><span className="nfc-ok">Paired</span><button type="button" onClick={unpair}>Unpair</button>{error && <span className="nfc-err">{error}</span>}</>;
  }
  if (isScanning) {
    return <><span className="nfc-scan">Scanning…</span><button type="button" onClick={cancel}>Cancel</button></>;
  }
  return <><button type="button" onClick={start}>Pair NFC</button>{error && <span className="nfc-err">{error}</span>}</>;
}
