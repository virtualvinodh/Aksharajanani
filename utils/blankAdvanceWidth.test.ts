import { describe, it, expect } from 'vitest';
import { getBlankAdvanceWidth } from './glyphUtils';

const metrics = { unitsPerEm: 1000, spaceAdvanceWidth: 250 };

describe('getBlankAdvanceWidth', () => {
    it('uses a width stored on the character (e.g. from an imported font)', () => {
        expect(getBlankAdvanceWidth(0x00A0, { advWidth: 333 }, metrics)).toBe(333);
        expect(getBlankAdvanceWidth(0x200B, { advWidth: '12' }, metrics)).toBe(12);
        expect(getBlankAdvanceWidth(0x0041, { advWidth: 600 }, metrics)).toBe(600);
    });

    it('ignores unusable stored widths', () => {
        expect(getBlankAdvanceWidth(0x200B, { advWidth: '' }, metrics)).toBe(0);
        expect(getBlankAdvanceWidth(0x200B, { advWidth: 'abc' }, metrics)).toBe(0);
        expect(getBlankAdvanceWidth(0x200B, { advWidth: -5 }, metrics)).toBe(0);
    });

    it('gives format and control characters zero width', () => {
        expect(getBlankAdvanceWidth(0x200B, undefined, metrics)).toBe(0); // zero-width space
        expect(getBlankAdvanceWidth(0x2060, undefined, metrics)).toBe(0); // word joiner
        expect(getBlankAdvanceWidth(0xFEFF, undefined, metrics)).toBe(0); // zero-width no-break space
        expect(getBlankAdvanceWidth(0x0000, undefined, metrics)).toBe(0); // NULL
    });

    it('gives tab and carriage return the space width', () => {
        expect(getBlankAdvanceWidth(0x09, undefined, metrics)).toBe(250);
        expect(getBlankAdvanceWidth(0x0D, undefined, metrics)).toBe(250);
    });

    it('sizes spaces by convention, falling back to the space width', () => {
        expect(getBlankAdvanceWidth(0x00A0, undefined, metrics)).toBe(250); // no-break space
        expect(getBlankAdvanceWidth(0x2003, undefined, metrics)).toBe(1000); // em space
        expect(getBlankAdvanceWidth(0x2002, undefined, metrics)).toBe(500); // en space
        expect(getBlankAdvanceWidth(0x2009, undefined, metrics)).toBe(200); // thin space
        expect(getBlankAdvanceWidth(0x2003, undefined, { unitsPerEm: 2048, spaceAdvanceWidth: 500 })).toBe(2048);
    });

    it('leaves ordinary letters to the default width', () => {
        expect(getBlankAdvanceWidth(0x0B85, undefined, metrics)).toBeUndefined();
        expect(getBlankAdvanceWidth(0x0041, {}, metrics)).toBeUndefined();
    });
});
