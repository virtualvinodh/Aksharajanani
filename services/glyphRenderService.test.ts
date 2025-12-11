
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

        it('calculates bottomCenter', () => {
            // x + width/2, y + height
            expect(getAttachmentPointCoords(bbox, 'bottomCenter')).toEqual({ x: 60, y: 220 });
        });
    });
});
