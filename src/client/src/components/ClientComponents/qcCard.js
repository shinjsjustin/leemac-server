// Pure model for the marking note card: what the pinned and hover cards show. No React, no DOM.
import { isOwnOn } from './qcEditor';

const OWN_ACTIONS = ['note', 'eraseNote', 'remove', 'showPhotos'];
const VIEW_ACTIONS = ['showPhotos'];

function readOnlyLine(marking, side) {
  const origin = marking.is_leemac ? ' · added by Leemac' : '';
  const fromClient = side === 'leemac' && !marking.is_leemac ? ' · added by client' : '';
  return `Read-only${origin}${fromClient}`;
}

function describe(state, marking, { side, readOnly }, at, isPreview) {
  const editable = !isPreview && !readOnly && isOwnOn(side, marking);
  const actions = isPreview ? [] : editable ? OWN_ACTIONS : VIEW_ACTIONS;
  const pageMarkings = state.markings.filter((m) => m.page === marking.page);
  return {
    marking,
    number: pageMarkings.indexOf(marking) + 1,
    at,
    editable,
    tag: marking.is_leemac ? 'LEEMAC' : null,
    readOnlyLine: editable ? null : readOnlyLine(marking, side),
    actions,
  };
}

export function cardModel(state, options) {
  const pinnedMarking = state.markings.find((m) => m.id === state.pinnedId);
  const hovered = state.markings.find((m) => m.id === state.hoveredId);
  const showPreview = hovered && hovered !== pinnedMarking && hovered.page === state.page;
  return {
    pinned: pinnedMarking ? describe(state, pinnedMarking, options, state.pinAt, false) : null,
    preview: showPreview ? describe(state, hovered, options, null, true) : null,
  };
}

export function dismissAction({ key, inside }, state) {
  if (state.pinnedId === null) return null;
  return key === 'Escape' || inside === false ? { type: 'unpin' } : null;
}
