const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../Styling/PortalJob.css'), 'utf8');

describe('portal Job CSS', () => {
  test('has no style for the removed parts hint', () => {
    expect(css).not.toContain('portal-job-parts-hint');
  });
});
