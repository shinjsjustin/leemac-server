const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../Styling/ClientPortal.css'), 'utf8');

// Declarations of the rule whose selector list is exactly `selector`.
function ruleBody(source, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\:>]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(source);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

describe('portal header nav CSS', () => {
  test('active tab is marked by colour and underline, not weight', () => {
    const body = ruleBody(css, '.portal-shell .portal-nav-link[aria-current="page"]');
    expect(body).toMatch(/color:\s*var\(--portal-text\)/);
    expect(body).toMatch(/box-shadow:\s*inset 0 -3px 0 var\(--portal-accent\)/);
    expect(body).not.toMatch(/font-weight/);
  });

  test('no nav-link rule sets a font-weight', () => {
    const rules = css.match(/[^{}]*\.portal-nav-link[^{}]*\{[^}]*\}/g) || [];
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach((r) => expect(r).not.toMatch(/font-weight/));
  });
});
