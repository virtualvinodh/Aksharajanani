
import { Point } from '../types';

// --- Vector Math Helper Functions ---
export const VEC = {
  add: (p1: Point, p2: Point): Point => ({ x: p1.x + p2.x, y: p1.y + p2.y }),
  sub: (p1: Point, p2: Point): Point => ({ x: p1.x - p2.x, y: p1.y - p2.y }),
  scale: (p: Point, s: number): Point => ({ x: p.x * s, y: p.y * s }),
  len: (p: Point): number => Math.sqrt(p.x * p.x + p.y * p.y),
  normalize: (p: Point): Point => {
    const l = VEC.len(p);
    return l > 1e-6 ? VEC.scale(p, 1 / l) : { x: 0, y: 0 };
  },
  perp: (p: Point): Point => ({ x: -p.y, y: p.x }),
  dot: (p1: Point, p2: Point): number => p1.x * p2.x + p1.y * p2.y,
  rotate: (p: Point, angle: number): Point => ({
    x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
  }),
};
