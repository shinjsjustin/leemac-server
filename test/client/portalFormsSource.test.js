const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/Authentication');
const pages = ['ClientLogin', 'ClientTwoFactor', 'AcceptInvite', 'ClientUpdateCredentials'];
const files = [...pages, 'ClientTwoFactorSettings'];
const read = (name) => fs.readFileSync(path.join(dir, `${name}.js`), 'utf8');

for (const name of files) {
  test(`${name}: every input has id, autoComplete and a matching label`, () => {
    const src = read(name);
    const inputs = src.match(/<input\b[\s\S]*?\/>/g) || [];
    assert.ok(inputs.length > 0, 'expected at least one input');
    for (const input of inputs) {
      const id = input.match(/\bid=["']([^"']+)["']/);
      assert.ok(id, `input without id: ${input}`);
      assert.match(input, /\bautoComplete=/);
      assert.ok(src.includes(`htmlFor="${id[1]}"`) || src.includes(`htmlFor='${id[1]}'`), `no label for ${id[1]}`);
    }
    assert.strictEqual((src.match(/<input\b/g) || []).length, inputs.length);
  });

  test(`${name}: no Navbar, Form.css or inline style`, () => {
    const src = read(name);
    assert.doesNotMatch(src, /import\s+Navbar\b/);
    assert.doesNotMatch(src, /Form\.css/);
    assert.doesNotMatch(src, /\bstyle=/);
  });
}

for (const name of pages) {
  test(`${name}: uses PortalLayout`, () => {
    assert.match(read(name), /import\s+PortalLayout\b/);
  });
}
