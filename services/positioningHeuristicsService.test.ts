import { describe, it, expect } from 'vitest';
import { getAttachmentPointCoords, isGsubPositioningPair } from './positioningHeuristicsService';
import { getAttachmentPointCoords as renderGetAttachmentPointCoords } from './glyphRenderService';
import { AttachmentPoint, BoundingBox, PositioningRules } from '../types';

describe('positioningHeuristicsService', () => {
    describe('getAttachmentPointCoords', () => {
        const bbox: BoundingBox = { x: 10, y: 20, width: 100, height: 200 };

        it('calculates center as the bbox centre', () => {
            expect(getAttachmentPointCoords(bbox, 'center')).toEqual({ x: 60, y: 120 });
        });

        it('matches the glyphRenderService copy for every point', () => {
            const points: AttachmentPoint[] = [
                'topLeft', 'topCenter', 'topRight',
                'midLeft', 'center', 'midRight',
                'bottomLeft', 'bottomCenter', 'bottomRight',
            ];
            for (const p of points) {
                expect(getAttachmentPointCoords(bbox, p)).toEqual(renderGetAttachmentPointCoords(bbox, p));
            }
        });
    });

    describe('isGsubPositioningPair', () => {
        const groups = { cons: ['ka', 'kha'], vowelSigns: ['i', 'u'] };
        const rules: PositioningRules[] = [
            { base: ['$cons'], mark: ['$vowelSigns'], gsub: 'akhn', gpos: 'abvm' },
            { base: ['ka'], mark: ['virama'], gpos: 'blwm' },
        ];

        it('is true when the base and mark are both covered by a rule with gsub', () => {
            expect(isGsubPositioningPair(rules, 'ka', 'u', groups)).toBe(true);
        });

        it('checks the mark against rule.mark, not the base', () => {
            // The base name never appears in rule.mark, so the old base-vs-mark check returned false here.
            expect(isGsubPositioningPair(rules, 'kha', 'i', groups)).toBe(true);
            expect(isGsubPositioningPair(rules, 'kha', 'kha', groups)).toBe(false);
        });

        it('is false for a GPOS-only rule', () => {
            expect(isGsubPositioningPair(rules, 'ka', 'virama', groups)).toBe(false);
        });

        it('is false when no rule covers the pair, or there are no rules', () => {
            expect(isGsubPositioningPair(rules, 'ga', 'u', groups)).toBe(false);
            expect(isGsubPositioningPair(null, 'ka', 'u', groups)).toBe(false);
        });
    });
});
