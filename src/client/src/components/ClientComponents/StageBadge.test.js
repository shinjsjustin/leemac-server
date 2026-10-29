import { render } from '../../testUtils/render';
import StageBadge from './StageBadge';

global.IS_REACT_ACT_ENVIRONMENT = true;

let view;
afterEach(() => view && view.unmount());

describe('StageBadge', () => {
  it('renders the label with a stage class', () => {
    view = render(<StageBadge stage={{ key: 'machining', label: 'Machining' }} />);
    const el = view.container.querySelector('.portal-stage--machining');
    expect(el.textContent).toBe('Machining');
  });

  it.each([['due_soon', 'Due soon'], ['overdue', 'Overdue']])('adds %s flag text', (flag, text) => {
    view = render(<StageBadge stage={{ key: 'inspection', label: 'Inspection' }} flag={flag} />);
    expect(view.container.textContent).toBe(`Inspection${text}`);
    expect(view.container.querySelector(`.portal-stage-flag--${flag}`).textContent).toBe(text);
  });

  it('shows no flag text without a flag', () => {
    view = render(<StageBadge stage={{ key: 'done', label: 'Done' }} />);
    expect(view.container.querySelector('.portal-stage-flag')).toBeNull();
  });

  it('renders nothing when stage is null', () => {
    view = render(<StageBadge stage={null} flag="overdue" />);
    expect(view.container.innerHTML).toBe('');
  });
});
