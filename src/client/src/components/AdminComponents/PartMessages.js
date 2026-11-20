import { useCallback, useEffect, useState } from 'react';
import { listPartNotes, setNoteShared } from '../../api/partInfoApi';
import { messageMeta } from './partMessageMeta';
import '../Styling/PartInfo.css';

const PartMessages = ({ partId }) => {
    const [notes, setNotes] = useState([]);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const res = await listPartNotes(partId);
        if (res.ok) {
            setNotes(res.data);
            setError('');
        } else {
            setError(res.error.message);
        }
    }, [partId]);

    useEffect(() => { load(); }, [load]);

    const toggleShared = async (note) => {
        const res = await setNoteShared(note.id, !note.shared);
        if (!res.ok) {
            setError(res.error.message);
            return;
        }
        load();
    };

    return (
        <section className="part-info-section">
            <h3>Messages</h3>
            {error && <p className="part-info-error">{error}</p>}
            {notes.length === 0 && !error && <p className="part-info-empty">No messages yet</p>}
            {notes.map((note) => {
                const meta = messageMeta(note);
                return (
                    <div key={note.id} className="part-message">
                        <div className="part-message-meta">
                            {meta.job === 'Part only' ? meta.job : `Job #${meta.job}`} · {meta.author} · {meta.visibility}
                        </div>
                        <div className="part-message-body">{note.content}</div>
                        {!note.is_client && (
                            <button type="button" className="part-info-button" onClick={() => toggleShared(note)}>
                                {note.shared ? 'Unshare' : 'Share'}
                            </button>
                        )}
                    </div>
                );
            })}
        </section>
    );
};

export default PartMessages;
