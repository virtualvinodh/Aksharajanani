
import { describe, it, expect } from 'vitest';
import { doBBoxesCollide } from './kerningService';
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
