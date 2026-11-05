import { addableParts, removableParts } from './sharedListActions';

const list = {
  id: 3,
  name: 'Spring',
  parts: [
    { part_id: 1, part_number: 'PN-1', can_remove: true },
    { part_id: 2, part_number: 'PN-2', can_remove: false },
  ],
};

describe('addableParts', () => {
  it('drops portal parts already on the shared list', () => {
    const portalParts = [{ part_id: 1 }, { part_id: 2 }, { part_id: 3 }, { part_id: 4 }];
    expect(addableParts(portalParts, list)).toEqual([{ part_id: 3 }, { part_id: 4 }]);
  });

  it('returns every portal part when the list is empty', () => {
    const portalParts = [{ part_id: 5 }];
    expect(addableParts(portalParts, { ...list, parts: [] })).toEqual(portalParts);
  });

  it('returns nothing when every portal part is already listed', () => {
    expect(addableParts([{ part_id: 1 }, { part_id: 2 }], list)).toEqual([]);
  });
});

describe('removableParts', () => {
  it('keeps only parts with can_remove', () => {
    expect(removableParts(list).map((p) => p.part_id)).toEqual([1]);
  });

  it('returns nothing when no part can be removed', () => {
    expect(removableParts({ ...list, parts: [list.parts[1]] })).toEqual([]);
  });
});
