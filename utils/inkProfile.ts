import { GlyphData, Point } from '../types';
import { curveToPolyline, quadraticCurveToPolyline } from './strokeExpansion';

/**
 * A glyph's ink, slice by slice: for every horizontal band of ROW canvas units, the leftmost and
 * rightmost ink in it (strokes included). Auto-kerning compares two glyphs band by band, so it
 * sees where they actually come close, unlike boxes: a V's narrow bottom no longer hides its wide
 * top, which used to let V E be kerned until they touched (K18).
 */
export const ROW = 10;
export type InkProfile = Map<number, { min: number; max: number }>;

const stamp = (rows: InkProfile, x: number, y: number, r: number) => {
    for (let i = Math.floor((y - r) / ROW); i <= Math.floor((y + r) / ROW); i++) {
        const row = rows.get(i);
        if (row) { if (x - r < row.min) row.min = x - r; if (x + r > row.max) row.max = x + r; }
        else rows.set(i, { min: x - r, max: x + r });
    }
};

// Marks every band a segment passes through, sampling it finely enough not to skip one.
const stampSegment = (rows: InkProfile, a: Point, b: Point, r: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (ROW / 2)));
    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        stamp(rows, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r);
    }
};

const stampPolyline = (rows: InkProfile, pts: Point[], r: number, closed: boolean) => {
    if (pts.length === 1) stamp(rows, pts[0].x, pts[0].y, r);
    for (let i = 1; i < pts.length; i++) stampSegment(rows, pts[i - 1], pts[i], r);
    if (closed && pts.length > 2) stampSegment(rows, pts[pts.length - 1], pts[0], r);
};

export const getInkProfile = (glyph: GlyphData, strokeThickness: number): InkProfile => {
    const rows: InkProfile = new Map();
    const half = strokeThickness / 2;
    for (const path of glyph.paths) {
        if (path.type === 'outline' && path.segmentGroups) {
            // Filled shapes: their edge bounds every band, and they have no stroke around them.
            for (const group of path.segmentGroups) stampPolyline(rows, group.map(s => s.point), 0, true);
            continue;
        }
        const pts = path.points;
        if (!pts || pts.length === 0) continue;
        if (path.type === 'dot') {
            const radius = pts.length > 1 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : half;
            for (let y = -radius; y <= radius; y += ROW / 2) {
                const w = Math.sqrt(Math.max(0, radius * radius - y * y));
                stampSegment(rows, { x: pts[0].x - w, y: pts[0].y + y }, { x: pts[0].x + w, y: pts[0].y + y }, 0);
            }
            continue;
        }
        let line = pts;
        if ((path.type === 'pen' || path.type === 'calligraphy') && pts.length > 2) line = curveToPolyline(pts);
        else if (path.type === 'curve' && pts.length === 3) line = quadraticCurveToPolyline(pts);
        stampPolyline(rows, line, half, path.type === 'circle' || path.type === 'ellipse');
    }
    return rows;
};

/**
 * The tightest kerning that keeps every band where both glyphs have ink at least `target` apart.
 * Placement is the app's: the right glyph's ink starts at left.maxX + rsb + lsb + k.
 * `left`/`right` are the glyphs' full ink boxes (as used for their advance widths).
 * Never positive, never below -unitsPerEm/2, and the right glyph never starts before the left one.
 */
export const solveKernFromProfiles = (
    leftRows: InkProfile, rightRows: InkProfile,
    left: { minX: number; maxX: number }, right: { minX: number; maxX: number },
    leftRsb: number, rightLsb: number, target: number, unitsPerEm: number
): number => {
    // Gap in each shared band at k = 0.
    let minGap = Infinity;
    for (const [i, l] of leftRows) {
        const r = rightRows.get(i);
        if (!r) continue;
        const gap = (r.min - right.minX) + (left.maxX - l.max) + leftRsb + rightLsb;
        if (gap < minGap) minGap = gap;
    }
    if (minGap === Infinity) return 0; // no height in common (an accent and a comma): nothing to kern
    const needed = target - minGap;                                   // closer than this breaks the gap
    const noOvertake = left.minX - left.maxX - leftRsb - rightLsb;    // right glyph starting before the left
    const k = Math.ceil(Math.max(needed, noOvertake, -Math.round(unitsPerEm / 2)));
    return Math.min(0, k) || 0; // (no -0)
};
