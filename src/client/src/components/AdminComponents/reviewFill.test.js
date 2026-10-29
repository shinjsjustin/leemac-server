import { fillFromPart, fillFromJob } from './reviewFill';

const line = {
    id: 7,
    quantity: 5,
    part_number: 'OLD',
    description: 'old desc',
    rev: 'A',
    material: 'steel',
    finish: 'anodize',
    price: 3,
    note: 'keep',
};
const part = { number: 'P-100', description: 'Bracket' };
const job = { rev: 'C', material: 'alu', finish: 'raw', price: 12.5 };

describe('fillFromPart', () => {
    it('sets part_number and description and leaves other fields', () => {
        expect(fillFromPart(line, part)).toEqual({
            ...line,
            part_number: 'P-100',
            description: 'Bracket',
        });
    });

    it('keeps the existing description when the part has a blank one', () => {
        const out = fillFromPart(line, { number: 'P-100', description: '   ' });
        expect(out.part_number).toBe('P-100');
        expect(out.description).toBe('old desc');
    });

    it('keeps the existing part_number when the part number is null', () => {
        expect(fillFromPart(line, { number: null, description: 'X' }).part_number).toBe('OLD');
    });

    it('does not mutate the input line', () => {
        const copy = { ...line };
        fillFromPart(line, part);
        expect(line).toEqual(copy);
    });
});

describe('fillFromJob', () => {
    it('sets part fields and job fields, leaving quantity, id and others', () => {
        expect(fillFromJob(line, part, job)).toEqual({
            ...line,
            part_number: 'P-100',
            description: 'Bracket',
            rev: 'C',
            material: 'alu',
            finish: 'raw',
            price: 12.5,
        });
    });

    it('skips null, undefined and blank job values', () => {
        const out = fillFromJob(line, part, { rev: null, material: '  ', price: undefined });
        expect(out.rev).toBe('A');
        expect(out.material).toBe('steel');
        expect(out.finish).toBe('anodize');
        expect(out.price).toBe(3);
    });

    it('uses a price of 0', () => {
        expect(fillFromJob(line, part, { ...job, price: 0 }).price).toBe(0);
    });

    it('does not mutate the input line', () => {
        const copy = { ...line };
        fillFromJob(line, part, job);
        expect(line).toEqual(copy);
    });
});
