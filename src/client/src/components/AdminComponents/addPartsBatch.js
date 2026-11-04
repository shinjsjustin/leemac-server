// Rules for the batch add-parts form, kept free of React so they can be tested alone.

let nextKey = 0;

export const emptyPartRow = () => ({ key: `part-row-${nextKey++}`, number: '', description: '', files: [], error: '' });

const isRowEmpty = (row) => !row.number.trim() && !row.description.trim() && row.files.length === 0;

const stemOf = (name) => {
  const dot = name.lastIndexOf('.');
  return (dot < 0 ? name : name.slice(0, dot)).trim();
};
const baseOf = (name) => stemOf(name).toLowerCase();

const rowOwnsBase = (row, base) =>
  row.number.trim().toLowerCase() === base || row.files.some((f) => baseOf(f.name) === base);

const withFile = (rows, file) => {
  const base = baseOf(file.name);
  const matchIndex = rows.findIndex((row) => rowOwnsBase(row, base));
  if (matchIndex >= 0) {
    if (rows[matchIndex].files.some((f) => f.name === file.name)) return rows;
    return rows.map((row, i) => (i === matchIndex ? { ...row, files: [...row.files, file] } : row));
  }
  const fresh = { number: stemOf(file.name), files: [file] };
  const emptyIndex = rows.findIndex(isRowEmpty);
  if (emptyIndex >= 0) return rows.map((row, i) => (i === emptyIndex ? { ...row, ...fresh } : row));
  return [...rows, { ...emptyPartRow(), ...fresh }];
};

export const addDroppedFiles = (rows, files) => files.reduce(withFile, rows);

const addRow = async (row, api) => {
  const number = row.number.trim();
  const added = await api.addPoolPart(number, row.description.trim());
  if (!added.ok) return { kept: { ...row, error: `Part ${number}: ${added.error.message}` }, messages: [] };
  const messages = [];
  for (const file of row.files) {
    const uploaded = await api.uploadPoolFile(added.data.id, file);
    if (!uploaded.ok) messages.push(`Part ${number} was added, but ${file.name} was not: ${uploaded.error.message}`);
  }
  return { added: true, messages };
};

export const runBatch = async (rows, api, onProgress) => {
  const kept = [];
  const messages = [];
  let addedCount = 0;
  for (const [index, row] of rows.entries()) {
    if (isRowEmpty(row)) {
      // nothing to send
    } else if (!row.number.trim()) {
      kept.push({ ...row, error: 'Part number is required.' });
    } else {
      const outcome = await addRow(row, api);
      if (outcome.added) addedCount += 1;
      else kept.push(outcome.kept);
      messages.push(...outcome.messages);
    }
    onProgress(index + 1, rows.length);
  }
  return { rows: kept, addedCount, messages };
};
