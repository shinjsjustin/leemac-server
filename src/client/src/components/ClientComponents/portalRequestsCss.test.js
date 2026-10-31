const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../Styling/PortalRequests.css'), 'utf8');

// Declarations of the rule whose selector list is exactly `selector`.
function ruleBody(source, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\:>]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(source);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

describe('portal Requests CSS', () => {
  test('file name list items truncate with an ellipsis on one line', () => {
    const body = ruleBody(css, '.portal-shell .portal-request-files li');
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/overflow:\s*hidden/);
    expect(body).toMatch(/text-overflow:\s*ellipsis/);
  });

  test('part name input uses the same font as the other inputs', () => {
    const body = ruleBody(css, '.portal-shell .portal-input.portal-req-partno');
    expect(body === null || !/font-family/.test(body)).toBe(true);
  });
});
