
import { describe, it, expect } from 'vitest';
import { calculateAutoKerning } from './kerningService';
import { Character, FontMetrics, GlyphData } from '../types';

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

    // V and E as drawn by the e2e test (canvas units): the V is wide at the top, narrow at the bottom.
    const V = { paths: [line(370, 260, 500, 660), line(500, 660, 630, 260)] };
    const E = { paths: [line(610, 260, 390, 260), line(390, 260, 390, 660), line(390, 660, 610, 660), line(390, 460, 570, 460)] };
    const A = { paths: [line(370, 660, 500, 260), line(500, 260, 630, 660), line(420, 530, 580, 530)] };

    it("doesn't pull an E into the top of a V (K18)", async () => {
        // The old zone boxes only kept the gap at x-height, so the E slid in until the tops touched (-145).
        const k = (await kern(V, E))!;
        expect(k).toBeGreaterThan(-20);
    });

    it('still tucks a V and an A together', async () => {
        expect((await kern(A, V))!).toBeLessThan(-100);
        expect((await kern(V, A))!).toBeLessThan(-100);
    });
});
