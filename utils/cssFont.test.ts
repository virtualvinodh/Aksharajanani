import { describe, it, expect } from 'vitest';
import { cssString, fontFaceRule, safeFontUrl } from './cssFont';

// Braces outside CSS strings (honouring backslash escapes): what a CSS parser would treat as structure.
const structuralBraces = (css: string): string => {
  let out = '', quote: string | null = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '}') out += c;
  }
  return out;
};

describe('cssFont', () => {
  it('escapes quotes, backslashes and line breaks', () => {
    expect(cssString('Noto "Sans"\\x\n')).toBe('"Noto \\"Sans\\"\\\\x "');
  });
  it('builds a normal rule', () => {
    expect(fontFaceRule('Noto Sans Tamil', 'https://example.com/a.ttf', 'truetype'))
      .toBe('@font-face { font-family: "Noto Sans Tamil"; src: url("https://example.com/a.ttf") format("truetype"); font-display: swap; }');
  });
  it('cannot break out of the rule', () => {
    const rule = fontFaceRule('x"; } body { background: url(https://evil/) } @font-face { font-family: "y', 'https://e.com/a.ttf')!;
    expect(structuralBraces(rule)).toBe('{}'); // still exactly one block
    const viaUrl = fontFaceRule('x', "https://e.com/a.ttf') } body{color:red} x{('")!;
    expect(structuralBraces(viaUrl)).toBe('{}');
  });
  it('rejects non-web URL schemes', () => {
    expect(safeFontUrl('javascript:alert(1)')).toBeNull();
    expect(fontFaceRule('x', 'file:///etc/passwd')).toBeNull();
  });
});
