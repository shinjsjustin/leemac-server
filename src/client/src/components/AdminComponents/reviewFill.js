const isBlank = (value) =>
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

// Returns a copy of line with only the non-blank entries of `values` applied.
const applyNonBlank = (line, values) => {
    const next = { ...line };
    Object.entries(values).forEach(([key, value]) => {
        if (!isBlank(value)) next[key] = value;
    });
    return next;
};

export const fillFromPart = (line, part) =>
    applyNonBlank(line, { part_number: part.number, description: part.description });

export const fillFromJob = (line, part, job) =>
    applyNonBlank(fillFromPart(line, part), {
        rev: job.rev,
        material: job.material,
        finish: job.finish,
        price: job.price,
    });
