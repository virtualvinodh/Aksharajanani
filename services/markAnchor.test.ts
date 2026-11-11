import { describe, it, expect } from 'vitest';
import { computeMarkAnchorX, isZeroWidthMark } from './feaService';

// Where the attached mark's left edge ends up, measured from the base glyph's origin:
// the base anchor plus the mark's own left edge inside its glyph (0 for zero-width marks,
// since fontBuilder moves them there; LSB·scale otherwise).
const landedLeftEdge = (anchorX: number, mark: { glyphClass?: string; advWidth?: number | string; lsb?: number }, scale: number, defaultLSB: number) =>
    anchorX + (isZeroWidthMark(mark as never) ? 0 : (mark.lsb ?? defaultLSB) * scale);

describe('computeMarkAnchorX (E7)', () => {
    const scale = 1.3, defaultLSB = 50;
    // In the editor the mark's left edge sits 120 canvas units right of the base's left edge.
    const geometry = { baseBboxX: 300, markBboxX: 380, offsetX: 40, scale, defaultLSB };
    const intended = (baseLeftEdgeFont: number) => baseLeftEdgeFont + 120 * scale;

    it('base glyph + zero-width mark: unchanged behaviour', () => {
        const base = { glyphClass: 'base' as const, lsb: 60 };
        const mark = { glyphClass: 'mark' as const, advWidth: 0 };
        const x = computeMarkAnchorX({ baseChar: base, markChar: mark, ...geometry });
        expect(x).toBe(Math.round(60 * scale + 120 * scale));
        expect(Math.abs(landedLeftEdge(x, mark, scale, defaultLSB) - intended(60 * scale))).toBeLessThanOrEqual(1);
    });

    it('mark-to-mark: the base mark sits at x = 0, so its LSB is not added', () => {
        const baseMark = { glyphClass: 'mark' as const, advWidth: 0, lsb: 60 };
        const mark = { glyphClass: 'mark' as const, advWidth: 0 };
        const x = computeMarkAnchorX({ baseChar: baseMark, markChar: mark, ...geometry });
        expect(x).toBe(Math.round(120 * scale));
        expect(Math.abs(landedLeftEdge(x, mark, scale, defaultLSB) - intended(0))).toBeLessThanOrEqual(1);
    });

    it("a spacing mark's own LSB is accounted for", () => {
        const base = { glyphClass: 'base' as const, lsb: 60 };
        const spacingMark = { glyphClass: 'mark' as const, lsb: 25 };
        const x = computeMarkAnchorX({ baseChar: base, markChar: spacingMark, ...geometry });
        expect(Math.abs(landedLeftEdge(x, spacingMark, scale, defaultLSB) - intended(60 * scale))).toBeLessThanOrEqual(1);
    });
});
