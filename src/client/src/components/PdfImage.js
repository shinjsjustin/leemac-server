import React, { useEffect, useState } from 'react';

// Render widths in canvas pixels — thumbnails render well above display size for sharpness.
const THUMBNAIL_RENDER_WIDTH = 1000;
const FULL_PAGE_RENDER_WIDTH = 1400;

// Lazy-load pdf.js (and its worker) in a separate chunk so the main bundle stays small.
// The worker entry assigns window.pdfjsWorker, which pdf.js picks up automatically
// (main-thread rendering, no extra webpack/worker configuration needed).
let pdfjsPromise = null;
const loadPdfjs = () => {
    if (!pdfjsPromise) {
        pdfjsPromise = Promise.all([
            import('pdfjs-dist'),
            import('pdfjs-dist/build/pdf.worker.entry'),
        ]).then(([pdfjsLib]) => pdfjsLib);
    }
    return pdfjsPromise;
};

const renderPdfPagesToImages = async (url, targetWidth, firstPageOnly) => {
    const pdfjsLib = await loadPdfjs();
    const pdf = await pdfjsLib.getDocument(url).promise;
    try {
        const pageCount = firstPageOnly ? 1 : pdf.numPages;
        const images = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            images.push(canvas.toDataURL('image/png'));
        }
        return images;
    } finally {
        pdf.destroy();
    }
};

const usePdfPageImages = (previewUrl, targetWidth, firstPageOnly) => {
    const [images, setImages] = useState([]);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setImages([]);
        setFailed(false);
        if (!previewUrl) return undefined;

        renderPdfPagesToImages(previewUrl, targetWidth, firstPageOnly)
            .then((rendered) => { if (!cancelled) setImages(rendered); })
            .catch((error) => {
                console.error('Error rendering PDF preview:', error);
                if (!cancelled) setFailed(true);
            });

        return () => { cancelled = true; };
    }, [previewUrl, targetWidth, firstPageOnly]);

    return { images, failed };
};

// Clickable preview of a PDF's first page (replaces "Preview" buttons).
// Fills the height of its flex-column parent; the drawing scales as large as
// the box allows while keeping its aspect ratio (no cropping).
export const PdfThumbnail = ({ previewUrl, onClick }) => {
    const { images, failed } = usePdfPageImages(previewUrl, THUMBNAIL_RENDER_WIDTH, true);
    const src = images[0] || null;

    return (
        <div
            onClick={onClick}
            title="Open PDF"
            style={{
                flex: '1 1 0', minHeight: 0, cursor: 'pointer',
                border: '1px solid #ccc', borderRadius: '4px',
                overflow: 'hidden', backgroundColor: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            {src ? (
                <img
                    src={src}
                    alt="PDF preview"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
            ) : (
                <div style={{
                    width: '100%', height: '100%', minHeight: '90px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                    fontSize: '11px', fontWeight: '600', padding: '4px', boxSizing: 'border-box',
                    color: failed ? '#C62828' : '#999', backgroundColor: '#f5f5f5',
                }}>
                    {failed ? 'PDF' : 'Loading…'}
                </div>
            )}
        </div>
    );
};

// Full-size render of every page of a PDF, stacked top-down.
export const PdfPageStack = ({ previewUrl, onClick }) => {
    const { images, failed } = usePdfPageImages(previewUrl, FULL_PAGE_RENDER_WIDTH, false);

    if (failed || images.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {images.map((src, index) => (
                <img
                    key={index}
                    src={src}
                    alt={`PDF page ${index + 1}`}
                    onClick={onClick}
                    title="Open PDF"
                    style={{
                        width: '100%', display: 'block', boxSizing: 'border-box',
                        border: '1px solid #dee2e6', borderRadius: '8px',
                        backgroundColor: '#fff', cursor: onClick ? 'pointer' : 'default',
                    }}
                />
            ))}
        </div>
    );
};
