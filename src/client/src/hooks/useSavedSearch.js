import { useState, useEffect } from 'react';

const getSaved = (storageKey) => {
    try { return JSON.parse(sessionStorage.getItem(storageKey)) || {}; } catch { return {}; }
};

// Part-list search state that survives navigation via sessionStorage[storageKey].
const useSavedSearch = (storageKey) => {
    const [number, setNumber] = useState(() => getSaved(storageKey).number || '');
    const [description, setDescription] = useState(() => getSaved(storageKey).description || '');
    const [searchNum, setSearchNum] = useState(number);
    const [searchDesc, setSearchDesc] = useState(description);

    useEffect(() => {
        sessionStorage.setItem(storageKey, JSON.stringify({ number, description }));
    }, [storageKey, number, description]);

    const applyNumber = () => setNumber(searchNum);
    const applyDescription = () => setDescription(searchDesc);
    const clear = () => {
        setNumber('');
        setDescription('');
        setSearchNum('');
        setSearchDesc('');
    };

    return {
        number, description, searchNum, setSearchNum, searchDesc, setSearchDesc,
        applyNumber, applyDescription, clear,
    };
};

export default useSavedSearch;
