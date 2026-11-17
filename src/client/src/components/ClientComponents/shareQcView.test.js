import { qcView } from './shareQcView';

const reply = () => ({
  part: { number: 'P-1', description: 'Bracket' },
  markings: [
    { id: 1, file_id: 10, page: 1 },
    { id: 2, file_id: 10, page: 2 },
    { id: 3, file_id: 11, page: 1 },
  ],
  photos: [
    { id: 5, marking_id: 1, value: '1.00', caption: 'Bore' },
    { id: 6, marking_id: 3, value: '2.00', caption: '' },
  ],
});

describe('qcView', () => {
  test('gives the part number and description', () => {
    const view = qcView(reply());
    expect(view.number).toBe('P-1');
    expect(view.description).toBe('Bracket');
  });

  test('tags every marking as Leemac and not mine', () => {
    const { markings } = qcView(reply());
    expect(markings).toHaveLength(3);
    markings.forEach((m) => {
      expect(m.is_leemac).toBe(true);
      expect(m.mine).toBe(false);
    });
    expect(markings[1]).toMatchObject({ id: 2, file_id: 10, page: 2 });
  });

  test('lists one drawing per distinct marking file', () => {
    expect(qcView(reply()).drawings).toEqual([
      { id: 10, filename: 'Drawing 1' },
      { id: 11, filename: 'Drawing 2' },
    ]);
  });

  test('puts all photos in one group with no job details', () => {
    const { photos } = qcView(reply());
    expect(photos).toHaveLength(1);
    expect(photos[0].photos.map((p) => p.id)).toEqual([5, 6]);
    expect(photos[0].job_number).toBeUndefined();
    expect(photos[0].po_number).toBeUndefined();
    expect(photos[0].quantity).toBeUndefined();
    expect(photos[0].ship_date).toBeUndefined();
  });
});
