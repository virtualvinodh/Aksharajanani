
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

/**
 * Radius a 'dot' path is drawn with. Mirrors the dot branches in
 * services/glyphRenderService.ts (renderPath and getAccurateGlyphBBox):
 * a 2-point dot uses the distance to its second point, a 1-point dot uses
 * half the stroke thickness.
 */
export const getDotRadius = (points: Point[], strokeThickness: number): number =>
    points.length > 1 ? VEC.len(VEC.sub(points[1], points[0])) : strokeThickness / 2;

/** True if `p` is within the dot's drawn radius plus `tolerance` of its centre. */
export const isPointOnDot = (p: Point, points: Point[], strokeThickness: number, tolerance: number): boolean => {
    if (points.length === 0) return false;
    return VEC.len(VEC.sub(p, points[0])) <= getDotRadius(points, strokeThickness) + tolerance;
};
