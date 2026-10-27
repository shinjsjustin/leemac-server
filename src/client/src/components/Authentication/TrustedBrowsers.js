import React, { useState, useEffect, useCallback } from 'react';
import {
    listTrustedBrowsers,
    revokeTrustedBrowser,
    revokeAllTrustedBrowsers,
} from '../../api/trustedDevices';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '');

const TrustedBrowsers = ({ adminId }) => {
    const [devices, setDevices] = useState([]);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setDevices(await listTrustedBrowsers(adminId));
            setError('');
        } catch (err) {
            setError(err.message);
        }
    }, [adminId]);

    useEffect(() => {
        load();
    }, [load]);

    const confirmThenRun = async (message, action) => {
        if (!window.confirm(message)) return;
        try {
            await action();
        } catch (err) {
            setError(err.message);
            return;
        }
        await load();
    };

    return (
        <div>
            <h3>Trusted browsers</h3>
            {error && <div style={{ color: 'red', fontSize: '12px' }}>{error}</div>}
            {devices.length === 0 ? (
                <p>No trusted browsers.</p>
            ) : (
                <>
                    <table>
                        <thead>
                            <tr>
                                <th>Browser</th>
                                <th>Trusted</th>
                                <th>Last used</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map((device) => (
                                <tr key={device.id}>
                                    <td>{device.label}</td>
                                    <td>{formatDate(device.created_at)}</td>
                                    <td>{formatDate(device.last_used_at)}</td>
                                    <td>
                                        <button
                                            type="button"
                                            onClick={() => confirmThenRun(
                                                `Revoke ${device.label}?`,
                                                () => revokeTrustedBrowser(device.id, adminId)
                                            )}
                                        >
                                            Revoke
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button
                        type="button"
                        onClick={() => confirmThenRun(
                            'Revoke all trusted browsers?',
                            () => revokeAllTrustedBrowsers(adminId)
                        )}
                    >
                        Revoke all
                    </button>
                </>
            )}
        </div>
    );
};

export default TrustedBrowsers;
