import { clientPartLink, clientJobLink, copyText } from './copyLink';

const setClipboard = (writeText) => {
    Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true });
};

describe('links', () => {
    it('builds client part and job links', () => {
        expect(clientPartLink('https://x.test', 5)).toBe('https://x.test/client-part/5');
        expect(clientJobLink('https://x.test', 3)).toBe('https://x.test/client-job/3');
    });
});

describe('copyText', () => {
    afterEach(() => {
        setClipboard(undefined);
        delete document.execCommand;
    });

    it('resolves copied when the clipboard api succeeds', async () => {
        const writeText = jest.fn().mockResolvedValue();
        setClipboard(writeText);
        expect(await copyText('hi')).toBe('copied');
        expect(writeText).toHaveBeenCalledWith('hi');
    });

    it('falls back to execCommand and removes the textarea', async () => {
        setClipboard(jest.fn().mockRejectedValue(new Error('no')));
        let copiedValue;
        document.execCommand = jest.fn(() => {
            copiedValue = document.querySelector('textarea').value;
            return true;
        });
        expect(await copyText('hello')).toBe('copied');
        expect(document.execCommand).toHaveBeenCalledWith('copy');
        expect(copiedValue).toBe('hello');
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('falls back when clipboard api is missing', async () => {
        setClipboard(undefined);
        document.execCommand = jest.fn(() => true);
        expect(await copyText('a')).toBe('copied');
    });

    it('resolves manual when execCommand returns false', async () => {
        setClipboard(undefined);
        document.execCommand = jest.fn(() => false);
        expect(await copyText('a')).toBe('manual');
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('resolves manual and does not throw when execCommand throws', async () => {
        setClipboard(jest.fn().mockRejectedValue(new Error('no')));
        document.execCommand = jest.fn(() => { throw new Error('boom'); });
        expect(await copyText('a')).toBe('manual');
        expect(document.querySelector('textarea')).toBeNull();
    });
});
