
import { describe, it, expect } from 'vitest';
import { distanceToSegment } from './geometryUtils';

describe('geometryUtils', () => {
  describe('distanceToSegment', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };

    it('calculates distance to a point directly on the line segment', () => {
      const p = { x: 5, y: 0 };
      const result = distanceToSegment(p, start, end);
      expect(result.distance).toBe(0);
      expect(result.projection).toEqual({ x: 5, y: 0 });
    });

    it('calculates distance to a point above the line segment', () => {
      const p = { x: 5, y: 5 };
      const result = distanceToSegment(p, start, end);
      expect(result.distance).toBe(5);
      expect(result.projection).toEqual({ x: 5, y: 0 });
    });

    it('calculates distance when projection is beyond the start point (clamped to start)', () => {
      const p = { x: -5, y: 5 };
      const result = distanceToSegment(p, start, end);
      // Distance to (0,0) is sqrt(5^2 + 5^2) = sqrt(50) approx 7.071
      expect(result.distance).toBeCloseTo(7.071, 3);
      expect(result.projection).toEqual(start);
    });

    it('calculates distance when projection is beyond the end point (clamped to end)', () => {
      const p = { x: 15, y: 0 };
      const result = distanceToSegment(p, start, end);
      expect(result.distance).toBe(5);
      expect(result.projection).toEqual(end);
    });

    it('handles zero-length segments', () => {
      const p = { x: 5, y: 5 };
      const sameStart = { x: 0, y: 0 };
      const sameEnd = { x: 0, y: 0 };
      const result = distanceToSegment(p, sameStart, sameEnd);
      expect(result.distance).toBeCloseTo(7.071, 3);
      expect(result.projection).toEqual(sameStart);
    });
  });
});
