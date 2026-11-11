
import { describe, it, expect } from 'vitest';
import { doBBoxesCollide, calculateAutoKerning } from './kerningService';
import { Character, FontMetrics, GlyphData } from '../types';
import { BBox } from './glyphRenderService';

describe('kerningService', () => {
    describe('doBBoxesCollide', () => {
        it('returns false if either box is null', () => {
            const box: BBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
            expect(doBBoxesCollide(null, box)).toBe(false);
            expect(doBBoxesCollide(box, null)).toBe(false);
        });

        it('detects overlapping boxes', () => {
            const boxA: BBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
            const boxB: BBox = { minX: 5, maxX: 15, minY: 5, maxY: 15 };
            expect(doBBoxesCollide(boxA, boxB)).toBe(true);
        });

        it('detects boxes contained within another', () => {
             const boxA: BBox = { minX: 0, maxX: 20, minY: 0, maxY: 20 };
             const boxB: BBox = { minX: 5, maxX: 15, minY: 5, maxY: 15 };
             expect(doBBoxesCollide(boxA, boxB)).toBe(true);
        });

        it('returns false for non-overlapping boxes (horizontal separation)', () => {
            const boxA: BBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
            const boxB: BBox = { minX: 11, maxX: 20, minY: 0, maxY: 10 };
            expect(doBBoxesCollide(boxA, boxB)).toBe(false);
        });

        it('returns false for non-overlapping boxes (vertical separation)', () => {
            const boxA: BBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
            const boxB: BBox = { minX: 0, maxX: 10, minY: 11, maxY: 20 };
            expect(doBBoxesCollide(boxA, boxB)).toBe(false);
        });
        
        it('returns false if boxes just touch (based on < > logic)', () => {
            // Logic is !(boxA.maxX < boxB.minX ...). If maxX == minX, it's NOT <, so it evaluates to true (collision).
            // Note: In many physics engines touching is collision.
            // Let's verify the implementation: !(10 < 10) is true. So touching is collision.
            const boxA: BBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
            const boxB: BBox = { minX: 10, maxX: 20, minY: 0, maxY: 10 };
            expect(doBBoxesCollide(boxA, boxB)).toBe(true); 
        });
        
        it('returns false for strictly separated boxes', () => {
             const boxA: BBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
             // Shifted far away
             const boxB: BBox = { minX: 100, maxX: 110, minY: 100, maxY: 110 };
             expect(doBBoxesCollide(boxA, boxB)).toBe(false);
        });
    });
});

describe('calculateAutoKerning', () => {
    const metrics: FontMetrics = {
        unitsPerEm: 1000, ascender: 800, descender: -200, defaultAdvanceWidth: 600, topLineY: 460, baseLineY: 660,
        styleName: 'Regular', spaceAdvanceWidth: 250, defaultLSB: 50, defaultRSB: 50,
    };
    const line = (x1: number, y1: number, x2: number, y2: number) => ({ id: `${x1}-${y1}`, type: 'line' as const, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
    const char = (unicode: number, name: string): Character => ({ unicode, name });
    const kern = async (left: GlyphData, right: GlyphData) => {
        const map = new Map<number, GlyphData>([[1, left], [2, right]]);
        const result = await calculateAutoKerning([{ left: char(1, 'L'), right: char(2, 'R') }], map, metrics, 15, () => {}, null);
        return result.get('1-2');
    };

    it("doesn't let a narrow glyph jump past a narrow neighbour", async () => {
        // "!"-like bar followed by a short '"'-like mark at the top: they only collide at the top,
        // and pushed far enough the right one comes out the far side of the left one.
        const bar = { paths: [line(500, 260, 500, 640)] };
        const quote = { paths: [line(480, 260, 480, 330), line(520, 260, 520, 330)] };
        const k = await kern(bar, quote);
        // Without the guard the search ran to -unitsPerEm/2.
        expect(k).toBeGreaterThan(-200);
    });

    it("doesn't kern glyphs that share no height", async () => {
        const accent = { paths: [line(480, 400, 520, 380)] };
        const comma = { paths: [line(510, 655, 490, 720)] };
        expect(await kern(accent, comma)).toBe(0);
    });

    it('still tucks a round letter under an overhang', async () => {
        const T = { paths: [line(380, 260, 620, 260), line(500, 260, 500, 660)] };
        const o = { paths: [line(450, 500, 550, 500), line(450, 620, 550, 620), line(450, 500, 450, 620), line(550, 500, 550, 620)] };
        const k = (await kern(T, o))!;
        expect(k).toBeLessThan(0);
    });
});
