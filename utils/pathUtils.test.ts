
import { describe, it, expect } from 'vitest';
import { simplifyPath } from './pathUtils';
import { Point } from '../types';

describe('pathUtils', () => {
    describe('simplifyPath', () => {
        it('returns original points if less than 3 points', () => {
            const points: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
            expect(simplifyPath(points, 1)).toEqual(points);
        });

        it('simplifies a perfectly straight line to start and end points', () => {
            const points: Point[] = [
                { x: 0, y: 0 },
                { x: 5, y: 5 }, // On the line
                { x: 10, y: 10 }
            ];
            const result = simplifyPath(points, 0.1);
            expect(result.length).toBe(2);
            expect(result[0]).toEqual({ x: 0, y: 0 });
            expect(result[1]).toEqual({ x: 10, y: 10 });
        });

        it('keeps points that deviate more than epsilon', () => {
            const points: Point[] = [
                { x: 0, y: 0 },
                { x: 5, y: 10 }, // Significant spike
                { x: 10, y: 0 }
            ];
            const result = simplifyPath(points, 1);
            expect(result.length).toBe(3); // Should keep the spike
            expect(result).toEqual(points);
        });
        
        it('removes points that deviate less than epsilon', () => {
             const points: Point[] = [
                { x: 0, y: 0 },
                { x: 5, y: 0.5 }, // Tiny bump, less than epsilon 1
                { x: 10, y: 0 }
            ];
            const result = simplifyPath(points, 1);
            expect(result.length).toBe(2);
        });
    });
});
