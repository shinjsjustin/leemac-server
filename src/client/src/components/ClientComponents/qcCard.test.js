import { initialState, reduce } from './qcEditor';
import { cardModel, dismissAction } from './qcCard';

const own = { id: 7, kind: 'point', page: 1, x1: 0.1, y1: 0.2, x2: null, y2: null, size: 14, note: 'mine', is_leemac: false, mine: true };
const other = { ...own, id: 6, page: 2, mine: false, note: 'client other' };
const leemac = { id: 8, kind: 'box', page: 2, x1: 0.3, y1: 0.3, x2: 0.5, y2: 0.5, size: null, note: 'theirs', is_leemac: true, mine: false };
const at = { x: 10, y: 20 };

const make = (side = 'client', ...actions) =>
  actions.reduce(reduce, reduce(initialState(undefined, side), { type: 'load', markings: [own, other, leemac] }));
const OWN_ACTIONS = ['note', 'eraseNote', 'remove', 'showPhotos'];

describe('cardModel', () => {
  test('has no pinned card and no preview when nothing is pinned or hovered', () => {
    expect(cardModel(make(), { side: 'client', readOnly: false })).toEqual({ pinned: null, preview: null });
  });

  test('an own pinned marking is editable with every action', () => {
    const { pinned } = cardModel(make('client', { type: 'pin', id: 7, at }), { side: 'client', readOnly: false });
    expect(pinned).toMatchObject({ marking: own, number: 1, at, editable: true, tag: null, readOnlyLine: null, actions: OWN_ACTIONS });
  });

  test('number counts markings on the same page, 1-based', () => {
    const { pinned } = cardModel(make('client', { type: 'setPage', page: 2 }, { type: 'pin', id: 8, at }), { side: 'client', readOnly: false });
    expect(pinned.number).toBe(2);
  });

  test('a Leemac marking on the client side is read-only with the tag and Show photos only', () => {
    const { pinned } = cardModel(make('client', { type: 'setPage', page: 2 }, { type: 'pin', id: 8, at }), { side: 'client', readOnly: false });
    expect(pinned).toMatchObject({ editable: false, tag: 'LEEMAC', readOnlyLine: 'Read-only · added by Leemac', actions: ['showPhotos'] });
  });

  test('on the leemac side a Leemac marking is editable and a client one says added by client', () => {
    const state = make('leemac', { type: 'setPage', page: 2 }, { type: 'pin', id: 8, at });
    expect(cardModel(state, { side: 'leemac', readOnly: false }).pinned).toMatchObject({ editable: true, tag: 'LEEMAC', actions: OWN_ACTIONS });
    const client = reduce(state, { type: 'pin', id: 6, at });
    expect(cardModel(client, { side: 'leemac', readOnly: false }).pinned).toMatchObject({
      editable: false, tag: null, readOnlyLine: 'Read-only · added by client', actions: ['showPhotos'],
    });
  });

  test('readOnly makes even an own marking show photos only', () => {
    const { pinned } = cardModel(make('client', { type: 'pin', id: 7, at }), { side: 'client', readOnly: true });
    expect(pinned).toMatchObject({ editable: false, readOnlyLine: 'Read-only', actions: ['showPhotos'] });
  });

  test('preview is the hovered marking on this page with no actions and is never editable', () => {
    const { preview } = cardModel(make('client', { type: 'hover', id: 7 }), { side: 'client', readOnly: false });
    expect(preview).toMatchObject({ marking: own, number: 1, editable: false, actions: [] });
  });

  test('no preview when the hovered marking is the pinned one or on another page', () => {
    expect(cardModel(make('client', { type: 'pin', id: 7, at }, { type: 'hover', id: 7 }), { side: 'client', readOnly: false }).preview).toBeNull();
    expect(cardModel(make('client', { type: 'hover', id: 8 }), { side: 'client', readOnly: false }).preview).toBeNull();
  });

  test('a different hovered marking previews while another is pinned', () => {
    const state = make('client', { type: 'pin', id: 7, at }, { type: 'setPage', page: 2 }, { type: 'hover', id: 8 });
    expect(cardModel(state, { side: 'client', readOnly: false }).preview).toMatchObject({ marking: leemac, tag: 'LEEMAC', actions: [] });
  });
});

describe('dismissAction', () => {
  const pinned = make('client', { type: 'pin', id: 7, at });
  test.each([
    [{ key: 'Escape' }, pinned, { type: 'unpin' }],
    [{ inside: false }, pinned, { type: 'unpin' }],
    [{ inside: true }, pinned, null],
    [{ key: 'Enter' }, pinned, null],
    [{ key: 'Escape' }, make(), null],
    [{ inside: false }, make(), null],
  ])('%j -> %j', (event, state, expected) => {
    expect(dismissAction(event, state)).toEqual(expected);
  });
});
