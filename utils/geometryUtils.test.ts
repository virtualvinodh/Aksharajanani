
import { describe, it, expect } from 'vitest';
import { distanceToSegment, getDotRadius, isPointOnDot } from './geometryUtils';

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

  describe('getDotRadius', () => {
    it('uses half the stroke thickness for a 1-point dot', () => {
      expect(getDotRadius([{ x: 5, y: 5 }], 20)).toBe(10);
    });

    it('uses the distance to the second point for a 2-point dot', () => {
      expect(getDotRadius([{ x: 0, y: 0 }, { x: 3, y: 4 }], 20)).toBe(5);
    });
  });

  describe('isPointOnDot', () => {
    const dot = [{ x: 100, y: 100 }];

    it('hits the centre of a 1-point dot', () => {
      expect(isPointOnDot({ x: 100, y: 100 }, dot, 20, 0)).toBe(true);
    });

    it('hits up to radius + tolerance and misses beyond it', () => {
      expect(isPointOnDot({ x: 115, y: 100 }, dot, 20, 5)).toBe(true);
      expect(isPointOnDot({ x: 115.1, y: 100 }, dot, 20, 5)).toBe(false);
    });

    it('covers the whole disc of a 2-point dot, not just the radius line', () => {
      const dragged = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
      expect(isPointOnDot({ x: -9, y: 0 }, dragged, 2, 0)).toBe(true);
      expect(isPointOnDot({ x: 0, y: 12 }, dragged, 2, 1)).toBe(false);
    });

    it('never hits an empty path', () => {
      expect(isPointOnDot({ x: 0, y: 0 }, [], 20, 100)).toBe(false);
    });
  });
});
