import { useEffect, useState } from 'react';
import { saveProcessSteps } from '../../api/partInfoApi';
import { canWrite } from '../../config/access';
import '../Styling/PartInfo.css';

const MAX_STEPS_LENGTH = 5000;

const ProcessSteps = ({ partId, steps, accessLevel, onSaved }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(steps);
    const [error, setError] = useState('');

    useEffect(() => { setDraft(steps); }, [steps]);

    const save = async () => {
        const res = await saveProcessSteps(partId, draft);
        if (!res.ok) {
            setError(res.error.message);
            return;
        }
        setError('');
        setIsEditing(false);
        onSaved(draft);
    };

    return (
        <section className="part-info-section">
            <h3>Process Steps</h3>
            {isEditing ? (
                <>
                    <textarea
                        className="part-steps-input"
                        value={draft}
                        maxLength={MAX_STEPS_LENGTH}
                        rows={8}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    {error && <p className="part-info-error">{error}</p>}
                    <button type="button" className="part-info-button" onClick={save}>Save</button>
                    <button type="button" className="part-info-button" onClick={() => { setIsEditing(false); setDraft(steps); setError(''); }}>Cancel</button>
                </>
            ) : (
                <>
                    <div className="part-steps-text">{steps || 'No process steps yet'}</div>
                    {canWrite(accessLevel) && (
                        <button type="button" className="part-info-button" onClick={() => setIsEditing(true)}>Edit</button>
                    )}
                </>
            )}
        </section>
    );
};

export default ProcessSteps;
