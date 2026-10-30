const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

// Returns the body of every '@media (max-width: 600px)' block, found by brace matching.
function phoneBlocks(css) {
  const blocks = [];
  const re = /@media\s*\(\s*max-width\s*:\s*600px\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth && i < css.length) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') depth -= 1;
      i += 1;
    }
    blocks.push(css.slice(re.lastIndex, i - 1));
  }
  return blocks;
}

// Declarations of the rule whose selector list is exactly `selector`.
function ruleBody(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

const phone = (file) => phoneBlocks(read(file)).join('\n');

describe('phone Job page CSS', () => {
  test('side cards keep an 8px side margin and the head wraps', () => {
    const css = phone('jobSide.css');
    expect(ruleBody(css, '.admin-shell .js-card')).toMatch(/margin:\s*14px 8px/);
    expect(ruleBody(css, '.admin-shell .js-head')).toMatch(/flex-wrap:\s*wrap/);
  });

  test('document cards stay one column and actions wrap as a row', () => {
    const css = phone('jobCards.css');
    expect(ruleBody(css, '.admin-shell .jc-grid')).toMatch(/grid-template-columns:\s*1fr(;|\s|$)/);
    const actions = ruleBody(css, '.admin-shell .jc-actions');
    expect(actions).toMatch(/flex-direction:\s*row/);
    expect(actions).toMatch(/flex-wrap:\s*wrap/);
  });

  test('job grid stays one column', () => {
    expect(ruleBody(phone('jobPage.css'), '.admin-shell .jp-grid'))
      .toMatch(/grid-template-columns:\s*1fr(;|\s|$)/);
  });

  test('header facts are 3 equal columns and summaries wrap', () => {
    const css = phone('jobHeader.css');
    expect(ruleBody(css, '.admin-shell .jh-facts')).toMatch(/grid-template-columns:\s*repeat\(3,\s*1fr\)/);
    expect(ruleBody(read('jobHeader.css'), '.admin-shell .jh-sums')).toMatch(/flex-wrap:\s*wrap/);
  });

  test('part actions wrap', () => {
    expect(ruleBody(phone('jobParts.css'), '.admin-shell .jp-acts')).toMatch(/flex-wrap:\s*wrap/);
  });
});
