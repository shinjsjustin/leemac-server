import { toolbarModel } from './qcToolbarModel';
import { initialState, reduce, hint, SIZE_MIN, SIZE_MAX } from './qcEditor';

const items = (model) => model.groups.flat();
const find = (model, id) => items(model).find((i) => i.id === id);

describe('toolbarModel', () => {
  test('gives three groups in order for the client', () => {
    const model = toolbarModel(initialState([], 'client'), 'client');
    expect(model.groups.map((g) => g.map((i) => i.id))).toEqual([
      ['zoomOut', 'zoom', 'zoomIn', 'pan'],
      ['point', 'line', 'box'],
      ['save', 'clear', 'ping'],
    ]);
  });

  test('leemac side has no ping', () => {
    const model = toolbarModel(initialState([], 'leemac'), 'leemac');
    expect(model.groups[2].map((i) => i.id)).toEqual(['save', 'clear']);
  });

  test('zoom items carry the zoom percent and reducer actions', () => {
    const state = { ...initialState(), zoom: 1.25 };
    const model = toolbarModel(state, 'client');
    expect(find(model, 'zoomOut')).toMatchObject({ iconOnly: true, action: { type: 'zoom', direction: 'out' } });
    expect(find(model, 'zoomIn')).toMatchObject({ iconOnly: true, action: { type: 'zoom', direction: 'in' } });
    expect(find(model, 'zoom')).toMatchObject({ label: '125%', action: { type: 'fit' } });
  });

  test('picking a tool presses only its item, and picking again presses none', () => {
    const picked = reduce(initialState(), find(toolbarModel(initialState(), 'client'), 'line').action);
    const model = toolbarModel(picked, 'client');
    expect(items(model).filter((i) => i.pressed).map((i) => i.id)).toEqual(['line']);
    const again = reduce(picked, find(model, 'line').action);
    expect(items(toolbarModel(again, 'client')).some((i) => i.pressed)).toBe(false);
  });

  test('tool items dispatch pickTool for their tool', () => {
    const model = toolbarModel(initialState(), 'client');
    expect(['pan', 'point', 'line', 'box'].map((id) => find(model, id).action)).toEqual([
      { type: 'pickTool', tool: 'pan' },
      { type: 'pickTool', tool: 'point' },
      { type: 'pickTool', tool: 'line' },
      { type: 'pickTool', tool: 'box' },
    ]);
  });

  test('width popover exists only for point', () => {
    expect(toolbarModel(initialState(), 'client').width).toBeNull();
    expect(toolbarModel({ ...initialState(), tool: 'box' }, 'client').width).toBeNull();
    const state = { ...initialState(), tool: 'point', size: 20 };
    expect(toolbarModel(state, 'client').width).toEqual({ min: SIZE_MIN, max: SIZE_MAX, value: 20, preview: 20 });
  });

  test('save carries dirty; clear and ping are styled commands', () => {
    const model = toolbarModel({ ...initialState(), dirty: true }, 'client');
    expect(find(model, 'save')).toMatchObject({ command: 'save', dirty: true });
    expect(find(toolbarModel(initialState(), 'client'), 'save').dirty).toBe(false);
    expect(find(model, 'clear')).toMatchObject({ command: 'clear', variant: 'danger', icon: 'bin' });
    expect(find(model, 'ping')).toMatchObject({ command: 'ping', label: 'Ping Leemac', variant: 'primary', icon: 'send' });
  });

  test('hint is the status when set, else the state hint', () => {
    const state = { ...initialState(), tool: 'point' };
    expect(toolbarModel(state, 'client', 'Saved').hint).toBe('Saved');
    expect(toolbarModel(state, 'client').hint).toBe(hint(state));
    expect(toolbarModel(state, 'client', '').hint).toBe(hint(state));
  });
});
