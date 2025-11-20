
import { describe, it, expect } from 'vitest';
import { VEC } from './vectorUtils';

describe('VEC (Vector Utilities)', () => {
  it('add: correctly adds two vectors', () => {
    const p1 = { x: 10, y: 20 };
    const p2 = { x: 5, y: 5 };
    expect(VEC.add(p1, p2)).toEqual({ x: 15, y: 25 });
  });

  it('sub: correctly subtracts vectors', () => {
    const p1 = { x: 10, y: 20 };
    const p2 = { x: 5, y: 5 };
    expect(VEC.sub(p1, p2)).toEqual({ x: 5, y: 15 });
  });

  it('scale: scales a vector by a scalar', () => {
    const p = { x: 2, y: 3 };
    expect(VEC.scale(p, 3)).toEqual({ x: 6, y: 9 });
  });

  it('len: calculates magnitude correctly', () => {
    // 3-4-5 triangle
    const p = { x: 3, y: 4 };
    expect(VEC.len(p)).toBe(5);
  });

  it('dot: calculates dot product', () => {
    const p1 = { x: 1, y: 0 };
    const p2 = { x: 0, y: 1 };
    // Perpendicular vectors should have 0 dot product
    expect(VEC.dot(p1, p2)).toBe(0);

    const p3 = { x: 2, y: 0 };
    const p4 = { x: 3, y: 0 };
    // Parallel vectors
    expect(VEC.dot(p3, p4)).toBe(6);
  });

  it('normalize: converts to unit vector', () => {
    const p = { x: 10, y: 0 };
    const normalized = VEC.normalize(p);
    expect(normalized).toEqual({ x: 1, y: 0 });
    expect(VEC.len(normalized)).toBe(1);
  });

  it('normalize: handles zero vector gracefully', () => {
    const p = { x: 0, y: 0 };
    expect(VEC.normalize(p)).toEqual({ x: 0, y: 0 });
  });

  it('perp: calculates perpendicular vector', () => {
    const p = { x: 1, y: 0 };
    // Rotates 90 degrees counter-clockwise
    expect(VEC.perp(p)).toEqual({ x: 0, y: 1 });
  });
});
