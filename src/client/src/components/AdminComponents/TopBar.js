import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const TopBar = ({ accessLevel, job, parts, token }) => {
    const navigate = useNavigate();

    const handleGoBack = () => {
        navigate('/joblist');
    };

    const handlePopulateSheet = async () => {
        try {
            // Clear the sheet first
            const clearResponse = await fetch(`${process.env.REACT_APP_URL}/internal/sheet/clear`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (clearResponse.status !== 200) {
                alert('Failed to clear Google Sheet.');
                return;
            }

            // Populate the sheet
            const populateResponse = await fetch(`${process.env.REACT_APP_URL}/internal/sheet/populate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ job, parts }),
            });

            const data = await populateResponse.json();
            if (populateResponse.status === 200) {
                alert('Google Sheet populated successfully!');
            } else {
                console.error(data);
                alert('Failed to populate Google Sheet.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while populating Google Sheet.');
        }
    };

    const triggerExport = useCallback(
        async (actionType) => {
            try {
                await handlePopulateSheet();

                const res = await fetch(
                    'https://script.google.com/macros/s/AKfycbwBmp0MlpTcBaczJXCUyo9_mQ3DPZMpeH4lmGOBRqW6QQ5JHKcCoUhTpFNfpGvrUmMh/exec',
                    {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ action: actionType }),
                    }
                );

                console.log('Request sent. Response may not be accessible due to no-cors mode.');
            } catch (e) {
                console.error('Network or fetch error:', e);
            }
        },
        [token, handlePopulateSheet]
    );


    if (accessLevel < 2) {
        return (
            <div className="top-bar">
                <button className="top-bar-button" onClick={handleGoBack}>Back</button>
            </div>
        );
    }

    return (
        <div className="top-bar">
            <button className="top-bar-button" onClick={handleGoBack}>Back</button>
            <button className="top-bar-button" onClick={handlePopulateSheet}>Populate Google Sheet</button>
            <button className="top-bar-button" onClick={() => triggerExport('exportQuote')}>Export Quote</button>
            <button className="top-bar-button" onClick={() => triggerExport('exportOrder')}>Export Order</button>
            <button className="top-bar-button" onClick={() => triggerExport('exportInvoice')}>Export Invoice</button>
            <button className="top-bar-button" onClick={() => triggerExport('exportPackList')}>Export Packing List</button>
            <button className="top-bar-button" onClick={() => triggerExport('exportShipping')}>Export Shipping</button>
        </div>
    );
};

export default TopBar;
