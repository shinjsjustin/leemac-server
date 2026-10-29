import React from 'react';
import './priceSheet.css';

const isEmpty = (line) => line.price === null || line.price === undefined || String(line.price).trim() === '';

// Newest past price across the line's matched parts, or null when it has no history.
const lastPrice = (lineMatches = []) => {
    const history = lineMatches.flatMap((match) => match.history);
    const newest = history.reduce(
        (best, job) => (!best || new Date(job.created_at) > new Date(best.created_at) ? job : best),
        null,
    );
    return newest ? String(newest.price) : null;
};

const PriceSheet = ({ lines, matches = {}, onPrice, disabled = false }) => {
    const missing = lines.filter(isEmpty);

    const fill = (line) => {
        const price = lastPrice(matches[line.id]);
        if (price !== null) onPrice(line.id, price);
    };

    return (
        <section className="price-sheet">
            <header>
                <h3>Price sheet</h3>
                <button type="button" disabled={disabled} onClick={() => missing.forEach(fill)}>
                    Use last price on matched lines
                </button>
            </header>
            {lines.map((line) => (
                <div className="ps" key={line.id}>
                    <b className="mono">{line.part_number}</b>
                    <span>×{line.quantity}</span>
                    <input
                        className={`field${isEmpty(line) ? ' empty' : ''}`}
                        aria-label={line.part_number}
                        type="number"
                        step="0.01"
                        placeholder="$"
                        value={line.price ?? ''}
                        disabled={disabled}
                        onChange={(event) => onPrice(line.id, event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && isEmpty(line)) fill(line);
                        }}
                    />
                </div>
            ))}
            <div className="ps-foot">
                {`${lines.length} lines · ${lines.length - missing.length} priced · ${missing.length} needs a price`}
                {missing.length > 0 && ` (${missing.map((line) => line.part_number).join(', ')})`}
            </div>
        </section>
    );
};

export default PriceSheet;
