
import { describe, it, expect } from 'vitest';
import { getAttachmentPointCoords, BoundingBox } from './glyphRenderService';

describe('glyphRenderService', () => {
    describe('getAttachmentPointCoords', () => {
        const bbox: BoundingBox = { x: 10, y: 20, width: 100, height: 200 };

        it('calculates topLeft', () => {
            expect(getAttachmentPointCoords(bbox, 'topLeft')).toEqual({ x: 10, y: 20 });
        });

        it('calculates topCenter', () => {
            // x + width/2, y
            expect(getAttachmentPointCoords(bbox, 'topCenter')).toEqual({ x: 60, y: 20 });
        });

        it('calculates topRight', () => {
            // x + width, y
            expect(getAttachmentPointCoords(bbox, 'topRight')).toEqual({ x: 110, y: 20 });
        });

        it('calculates midLeft', () => {
            // x, y + height/2
            expect(getAttachmentPointCoords(bbox, 'midLeft')).toEqual({ x: 10, y: 120 });
        });

        it('calculates midRight', () => {
            // x + width, y + height/2
            expect(getAttachmentPointCoords(bbox, 'midRight')).toEqual({ x: 110, y: 120 });
        });

        it('calculates center', () => {
            // x + width/2, y + height/2
            expect(getAttachmentPointCoords(bbox, 'center')).toEqual({ x: 60, y: 120 });
        });

        it('calculates bottomCenter', () => {
            // x + width/2, y + height
            expect(getAttachmentPointCoords(bbox, 'bottomCenter')).toEqual({ x: 60, y: 220 });
        });
    });
});

describe('generateCompositeGlyphData', () => {
    // Malayalam സ്റ്റ had its offsets written as text ("x": "-20"): "0" + "-20" made "0-20", every
    // point became NaN, and the export's anchors on it broke the whole feature file.
    it('reads transform numbers written as text', async () => {
        const { generateCompositeGlyphData } = await import('./glyphRenderService');
        const line = (id: string) => ({ id, type: 'line' as const, points: [{ x: 400, y: 300 }, { x: 600, y: 600 }] });
        const sa = { unicode: 1, name: 'A', glyphClass: 'base' as const };
        const ra = { unicode: 2, name: 'B', glyphClass: 'base' as const };
        const lig = {
            unicode: 3, name: 'AB', glyphClass: 'ligature' as const, link: ['A', 'B'],
            compositeTransform: [{ x: 0, y: 0, scale: 1, mode: 'absolute' }, { scale: 0.6, y: '20', x: '-20', mode: 'absolute' }],
        };
        const data = generateCompositeGlyphData({
            character: lig as never,
            allCharsByName: new Map([['A', sa], ['B', ra], ['AB', lig]] as never),
            allGlyphData: new Map([[1, { paths: [line('a')] }], [2, { paths: [line('b')] }]]),
            settings: { strokeThickness: 15 } as never,
            metrics: { unitsPerEm: 1000, topLineY: 460, baseLineY: 660, defaultLSB: 50, defaultRSB: 50 } as never,
            markAttachmentRules: null,
            allCharacterSets: [],
        });
        const pts = data!.paths.flatMap(p => p.points);
        expect(pts.length).toBeGreaterThan(0);
        for (const pt of pts) { expect(Number.isFinite(pt.x)).toBe(true); expect(Number.isFinite(pt.y)).toBe(true); }
    });
});
