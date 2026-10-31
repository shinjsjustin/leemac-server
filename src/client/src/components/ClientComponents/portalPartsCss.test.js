const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../Styling/PortalParts.css'), 'utf8');

// Bodies of every '@media (max-width: 599px)' block, found by brace matching.
function phoneBlocks(source) {
  const re = /@media\s*\(\s*max-width\s*:\s*599px\s*\)\s*\{/g;
  const blocks = [];
  let m = re.exec(source);
  while (m) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth && i < source.length) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') depth -= 1;
      i += 1;
    }
    blocks.push(source.slice(m.index + m[0].length, i - 1));
    m = re.exec(source);
  }
  return blocks;
}

// Declarations of the rule whose selector list is exactly `selector`.
function ruleBody(source, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\:>]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(source);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

describe('portal Parts phone CSS', () => {
  const body = phoneBlocks(css).map((b) => ruleBody(b, '.portal-shell .portal-parts-filters')).find(Boolean);
  const fade = /linear-gradient\(\s*to right,\s*#000 (8\d|85|90)%,\s*transparent\s*\)/;

  test('scrolling filter chips fade out at the right edge', () => {
    expect(body).toMatch(/overflow-x:\s*auto/);
    expect(body).toMatch(new RegExp(`(^|[\\s;])mask-image:\\s*${fade.source}`));
    expect(body).toMatch(new RegExp(`-webkit-mask-image:\\s*${fade.source}`));
  });
});
