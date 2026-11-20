export const PRIVATE_LABEL = 'Private (Leemac only)';
export const SHARED_LABEL = 'Shared with client';
export const SHOP_NOTE_LABEL = 'Shop note (Leemac only)';
export const QUOTE_DETAILS_LABEL = 'Prints on quote / invoice';

export const visibilityLabel = (note) => (note.shared ? SHARED_LABEL : PRIVATE_LABEL);

export const NOTE_TABS = [
  { key: 'all', label: 'All', filter: () => true },
  { key: 'private', label: PRIVATE_LABEL, filter: (n) => !n.shared },
  { key: 'shared', label: SHARED_LABEL, filter: (n) => !!n.shared },
];
