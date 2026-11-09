import React from 'react';

const svg = (children) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">{children}</svg>
);
const stroke = { fill: 'none', stroke: 'currentColor' };

// Keyed by the icon names in qcToolbarModel. The zoom percentage button has no icon.
export const QC_ICONS = {
  minus: svg(<><circle cx="7" cy="7" r="4.5" {...stroke} strokeWidth="1.6" /><path d="M5 7h4M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.6" /></>),
  plus: svg(<><circle cx="7" cy="7" r="4.5" {...stroke} strokeWidth="1.6" /><path d="M5 7h4M7 5v4M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.6" /></>),
  hand: svg(<path d="M8 1.5v13M1.5 8h13M8 1.5L6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2" {...stroke} strokeWidth="1.5" />),
  point: svg(<><circle cx="8" cy="8" r="5" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /></>),
  line: svg(<><path d="M3 12.5L13 3.5" stroke="currentColor" strokeWidth="1.6" /><circle cx="3" cy="12.5" r="2" fill="currentColor" /><circle cx="13" cy="3.5" r="2" fill="currentColor" /></>),
  box: svg(<rect x="2.5" y="3.5" width="11" height="9" rx="1" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.6" />),
  save: svg(<path d="M2.5 2.5h9l2 2v9h-11z M5 2.5v4h6v-4M5 13.5v-4h6v4" {...stroke} strokeWidth="1.4" />),
  bin: svg(<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" {...stroke} strokeWidth="1.4" />),
  send: svg(<path d="M2 8l12-5.5-4 11-2.5-4.5z M7.5 9L14 2.5" {...stroke} strokeWidth="1.5" strokeLinejoin="round" />),
};
