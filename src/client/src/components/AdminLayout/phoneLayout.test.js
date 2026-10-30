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

const outsidePhone = (css) => phoneBlocks(css).reduce(
  (rest, b) => rest.replace(b, ''), css);

// Declarations of the rule whose selector list is exactly `selector`.
function ruleBody(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

const layoutCss = read('../Styling/AdminLayout.css');
const layoutPhone = phoneBlocks(layoutCss).join('\n');

describe('AdminLayout.css phone block', () => {
  test('tab bar is a fixed bottom bar of 3 equal columns', () => {
    const body = ruleBody(layoutPhone, '.admin-tabbar');
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/bottom:\s*0/);
    expect(body).toMatch(/display:\s*grid/);
    expect(body).toMatch(/grid-template-columns:\s*repeat\(3,\s*1fr\)/);
    expect(body).toMatch(/height:\s*64px/);
  });

  test('main is padded so the bar covers nothing', () => {
    expect(ruleBody(layoutPhone, '.admin-main')).toMatch(/padding-bottom:\s*(6[4-9]|[7-9]\d)px/);
  });

  test('top bar wraps with 12px side padding and search on its own row', () => {
    const top = ruleBody(layoutPhone, '.admin-top');
    expect(top).toMatch(/height:\s*auto/);
    expect(top).toMatch(/flex-wrap:\s*wrap/);
    expect(top).toMatch(/padding:\s*8px 12px/);
    expect(ruleBody(layoutPhone, '.admin-search')).toMatch(/flex:\s*1 1 100%/);
  });

  test('search results span the viewport edges', () => {
    const body = ruleBody(layoutPhone, '.admin-search-results');
    expect(body).toMatch(/width:\s*auto/);
    expect(body).toMatch(/left:\s*0/);
    expect(body).toMatch(/right:\s*0/);
  });

  test('main tables scroll inside', () => {
    const body = ruleBody(layoutPhone, '.admin-main table');
    expect(body).toMatch(/display:\s*block/);
    expect(body).toMatch(/max-width:\s*100%/);
    expect(body).toMatch(/overflow-x:\s*auto/);
  });
});

describe('tab bar outside the phone block', () => {
  test('is hidden', () => {
    expect(ruleBody(outsidePhone(layoutCss), '.admin-tabbar')).toMatch(/display:\s*none/);
  });
});

describe('job page phone rules', () => {
  test('.jp-grid is one column under 600px', () => {
    const phone = phoneBlocks(read('../JobPage/jobPage.css')).join('\n');
    expect(ruleBody(phone, '.admin-shell .jp-grid')).toMatch(/grid-template-columns:\s*1fr/);
  });

  test('.jp-part is one column under 600px', () => {
    const phone = phoneBlocks(read('../JobPage/jobParts.css')).join('\n');
    expect(ruleBody(phone, '.admin-shell .jp-part')).toMatch(/grid-template-columns:\s*1fr(;|\s*$)/);
  });
});
