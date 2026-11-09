import { SIZE_MIN, SIZE_MAX, hint } from './qcEditor';

// Pure description of the QC toolbar so every state is testable without a DOM.
const toolItem = (state, id, icon) => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  icon,
  iconOnly: false,
  action: { type: 'pickTool', tool: id },
  pressed: state.tool === id,
});

export function toolbarModel(state, side, status) {
  const ping = { id: 'ping', label: 'Ping Leemac', icon: 'send', iconOnly: false, variant: 'primary', command: 'ping' };
  return {
    groups: [
      [
        { id: 'zoomOut', label: 'Zoom out', icon: 'minus', iconOnly: true, action: { type: 'zoom', direction: 'out' } },
        { id: 'zoom', label: `${Math.round(state.zoom * 100)}%`, icon: 'fit', iconOnly: false, action: { type: 'fit' } },
        { id: 'zoomIn', label: 'Zoom in', icon: 'plus', iconOnly: true, action: { type: 'zoom', direction: 'in' } },
        toolItem(state, 'pan', 'hand'),
      ],
      [
        toolItem(state, 'point', 'point'),
        toolItem(state, 'line', 'line'),
        toolItem(state, 'box', 'box'),
      ],
      [
        { id: 'save', label: 'Save', icon: 'save', iconOnly: false, command: 'save', dirty: state.dirty },
        { id: 'clear', label: 'Clear', icon: 'bin', iconOnly: false, variant: 'danger', command: 'clear' },
        ...(side === 'client' ? [ping] : []),
      ],
    ],
    width: state.tool === 'point' ? { min: SIZE_MIN, max: SIZE_MAX, value: state.size, preview: state.size } : null,
    hint: status || hint(state),
  };
}
