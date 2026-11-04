import { emptyPartRow, addDroppedFiles, runBatch } from './addPartsBatch';

const file = (name) => ({ name });
const row = (number = '', description = '', files = []) => ({ ...emptyPartRow(), number, description, files });

describe('emptyPartRow', () => {
  test('returns blank rows with distinct keys', () => {
    const a = emptyPartRow();
    const b = emptyPartRow();
    expect(a).toEqual({ key: a.key, number: '', description: '', files: [], error: '' });
    expect(a.key).not.toBe(b.key);
  });
});

describe('addDroppedFiles', () => {
  test('puts same-named PDF and STEP on one new row', () => {
    const pdf = file('A-100.pdf');
    const step = file('a-100.STEP');
    const rows = addDroppedFiles([], [pdf, step]);
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe('A-100');
    expect(rows[0].files).toEqual([pdf, step]);
  });

  test('matches a typed number ignoring case and outer spaces', () => {
    const typed = row(' ab 12 ');
    const other = row('zz');
    const pdf = file('AB 12.pdf');
    const rows = addDroppedFiles([other, typed], [pdf]);
    expect(rows).toHaveLength(2);
    expect(rows[1].files).toEqual([pdf]);
    expect(rows[1].number).toBe(' ab 12 ');
    expect(rows[0].files).toEqual([]);
  });

  test('fills the first fully empty row before adding a new one', () => {
    const rows = addDroppedFiles([row('X'), row(), row()], [file('N-1.pdf')]);
    expect(rows).toHaveLength(3);
    expect(rows[1].number).toBe('N-1');
    expect(rows[1].files).toHaveLength(1);
    expect(rows[2].number).toBe('');
  });

  test('appends a row when no row is empty; a row with only a description is not empty', () => {
    const rows = addDroppedFiles([row('', 'desc')], [file('N-1.pdf')]);
    expect(rows).toHaveLength(2);
    expect(rows[1].number).toBe('N-1');
  });

  test('skips a file whose exact name is already on the row', () => {
    const rows = addDroppedFiles([row('A', '', [file('A.pdf')])], [file('A.pdf'), file('A.step')]);
    expect(rows[0].files.map((f) => f.name)).toEqual(['A.pdf', 'A.step']);
  });

  test('does not mutate the input rows', () => {
    const input = [row()];
    addDroppedFiles(input, [file('A.pdf')]);
    expect(input[0].files).toEqual([]);
    expect(input[0].number).toBe('');
  });
});

describe('runBatch', () => {
  const okApi = () => {
    let id = 0;
    return {
      addPoolPart: jest.fn(async (number) => ({ ok: true, data: { id: ++id, number } })),
      uploadPoolFile: jest.fn(async () => ({ ok: true, data: {} })),
    };
  };

  test('adds parts then uploads their files in order, skipping empty rows', async () => {
    const api = okApi();
    const pdf = file('A.pdf');
    const step = file('A.step');
    const result = await runBatch([row('A', 'desc', [pdf, step]), row(), row('B')], api, jest.fn());
    expect(api.addPoolPart.mock.calls).toEqual([['A', 'desc'], ['B', '']]);
    expect(api.uploadPoolFile.mock.calls).toEqual([[1, pdf], [1, step]]);
    expect(result).toEqual({ rows: [], addedCount: 2, messages: [] });
  });

  test('reports progress as rows finish', async () => {
    const onProgress = jest.fn();
    await runBatch([row('A'), row('B')], okApi(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  test('keeps only the rejected row with a message naming its number, and still adds later rows', async () => {
    const api = okApi();
    api.addPoolPart.mockImplementationOnce(async () => ({ ok: false, error: { kind: 'invalid', message: 'Number taken' } }));
    const bad = row('A', 'd', [file('A.pdf')]);
    const result = await runBatch([bad, row('B')], api, jest.fn());
    expect(api.addPoolPart).toHaveBeenCalledTimes(2);
    expect(api.uploadPoolFile).not.toHaveBeenCalled();
    expect(result.addedCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ ...bad, error: 'Part A: Number taken' });
  });

  test('keeps the part and names part and file when an upload fails', async () => {
    const api = okApi();
    api.uploadPoolFile.mockImplementationOnce(async () => ({ ok: false, error: { kind: 'invalid', message: 'Too big' } }));
    const result = await runBatch([row('A', '', [file('a.pdf'), file('a.step')])], api, jest.fn());
    expect(api.uploadPoolFile).toHaveBeenCalledTimes(2);
    expect(result.rows).toEqual([]);
    expect(result.addedCount).toBe(1);
    expect(result.messages).toEqual(['Part A was added, but a.pdf was not: Too big']);
  });

  test('keeps a row with content but no number, and sends nothing for it', async () => {
    const api = okApi();
    const noNumber = row('  ', 'some text');
    const result = await runBatch([noNumber, row('B')], api, jest.fn());
    expect(api.addPoolPart.mock.calls).toEqual([['B', '']]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].key).toBe(noNumber.key);
    expect(result.rows[0].error).toBe('Part number is required.');
    expect(result.addedCount).toBe(1);
  });

  test('a fully empty row sends nothing and is dropped', async () => {
    const api = okApi();
    const result = await runBatch([row(), row('  ', ' ')], api, jest.fn());
    expect(api.addPoolPart).not.toHaveBeenCalled();
    expect(result).toEqual({ rows: [], addedCount: 0, messages: [] });
  });
});
