import { intro, guides } from './guideContent';

const allText = () => {
  const parts = [];
  const walk = (v) => {
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(intro);
  walk(guides);
  return parts.join('\n');
};

describe('guideContent', () => {
  it('has exactly 17 guides with unique ids and titles and at least one step each', () => {
    expect(guides).toHaveLength(17);
    expect(new Set(guides.map((g) => g.id)).size).toBe(17);
    expect(new Set(guides.map((g) => g.title)).size).toBe(17);
    guides.forEach((g) => {
      expect(g.id).toBeTruthy();
      expect(g.title).toBeTruthy();
      expect(g.steps.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(g.tips)).toBe(true);
    });
  });

  it('gives every image a source, alt text and caption', () => {
    const shots = guides.flatMap((g) => g.shots);
    expect(shots.length).toBe(20);
    shots.forEach((s) => {
      expect(s.src).toBeTruthy();
      expect(s.alt.trim()).not.toBe('');
      expect(s.caption.trim()).not.toBe('');
    });
  });

  it('never mentions prices or the old Quick New Parts List', () => {
    expect(allText()).not.toMatch(/price/i);
    expect(allText()).not.toContain('Quick New Parts List');
  });

  it('uses the shipped wording', () => {
    const text = allText();
    [
      'Your Leemac client portal invite',
      'Confirm new password',
      'Back to job',
      'Remove from',
      'Switch job',
    ].forEach((phrase) => expect(text).toContain(phrase));
  });

  it('teaches the QC drawing tools without the old new-tab step', () => {
    const drawings = guides.find((g) => g.id === 'drawings');
    expect(drawings.title).toBe("Open a part's drawings");
    const text = JSON.stringify(drawings.steps.concat(drawings.tips));
    ['Point', 'Line', 'Box', 'Erase note', 'Remove marking', 'Show photos', 'Ping Leemac'].forEach(
      (phrase) => expect(text).toContain(phrase)
    );
    expect(text).not.toMatch(/new tab/i);
    expect(drawings.shots).toHaveLength(3);
  });

  it('lists the current contact details in order', () => {
    expect(intro.contact).toBe(
      'Leemac · leemac@leemac.co · (650) 787-8483 · 1980 Hartog Drive, San Jose, CA 95131'
    );
  });

  it('never shows the dead phone number', () => {
    expect(allText()).not.toContain('857-8984');
  });

  it('tells clients to email or call us', () => {
    expect(intro.body).toContain('email or call us');
  });

  it('holds plain strings only, no HTML', () => {
    expect(allText()).not.toMatch(/<\/?[a-z][^>]*>/i);
  });
});
