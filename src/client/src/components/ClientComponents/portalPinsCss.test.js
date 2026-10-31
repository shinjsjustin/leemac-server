const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../Styling/PortalPins.css'), 'utf8');

// Returns the body of the phone '@media (max-width: 599px)' block, found by brace matching.
function phoneBlock(source) {
  const m = /@media\s*\(\s*max-width\s*:\s*599px\s*\)\s*\{/.exec(source);
  if (!m) return '';
  let depth = 1;
  let i = m.index + m[0].length;
  while (depth && i < source.length) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    i += 1;
  }
  return source.slice(m.index + m[0].length, i - 1);
}

// Declarations of the rule whose selector list is exactly `selector`.
function ruleBody(source, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\:>]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(source);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

describe('portal pins phone CSS', () => {
  test('job rows wrapped by a note target reserve room for the pin on the right', () => {
    const body = ruleBody(phoneBlock(css), '.portal-shell .portal-pin-target > .portal-job-row');
    expect(body).not.toBeNull();
    const px = Number(/padding-right:\s*(\d+)px/.exec(body)[1]);
    expect(px).toBeGreaterThanOrEqual(32);
  });
});
