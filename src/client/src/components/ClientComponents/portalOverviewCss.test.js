const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../Styling/PortalOverview.css'), 'utf8');

// Returns the body of the '@media (min-width: 1200px)' block, found by brace matching.
function desktopBlock(source) {
  const m = /@media\s*\(\s*min-width\s*:\s*1200px\s*\)\s*\{/.exec(source);
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

describe('portal Overview desktop CSS', () => {
  const desktop = desktopBlock(css);

  test('schedule panel is capped at 45% of the centre and scrolls on its own', () => {
    const body = ruleBody(desktop, '.portal-shell .portal-overview-centre > .portal-overview-panel:not(.portal-overview-parts)');
    expect(body).toMatch(/max-height:\s*45%/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  test('parts grid takes the remaining height and scrolls on its own', () => {
    const body = ruleBody(desktop, '.portal-shell .portal-overview-centre > .portal-overview-parts');
    expect(body).toMatch(/flex:\s*1(;|\s|$)/);
    expect(body).toMatch(/min-height:\s*0(;|\s|$)/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });
});
