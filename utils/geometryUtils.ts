
import { Point } from '../types';
import { VEC } from './vectorUtils';

export const distanceToSegment = (p: Point, v: Point, w: Point): { distance: number, projection: Point } => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return { distance: VEC.len(VEC.sub(p, v)), projection: v };
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return { distance: VEC.len(VEC.sub(p, projection)), projection };
};
