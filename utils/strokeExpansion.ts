import { Point } from '../types';
import { VEC } from './vectorUtils';

/**
 * Converts a single quadratic Bézier curve into a polyline.
 * @param points An array of 3 points: [start, control, end].
 * @param density The number of line segments to use for approximation.
 * @returns An array of Points representing the flattened curve.
 */
export const quadraticCurveToPolyline = (points: Point[], density = 10): Point[] => {
    if (points.length !== 3) return points;
    const [p0, p1, p2] = points;
    const polyline: Point[] = [p0];
    const quadraticPoint = (t: number, p0: Point, p1: Point, p2: Point) => {
        const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
        const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
        return { x, y };
    };
    for (let j = 1; j <= density; j++) {
        polyline.push(quadraticPoint(j / density, p0, p1, p2));
    }
    return polyline;
};

/**
 * Converts a curve represented by control points into a polyline (an array of points).
 * @param points The control points of the curve.
 * @param density The number of line segments to use for each Bézier curve segment.
 * @returns An array of Points representing the flattened curve.
 */
export const curveToPolyline = (points: Point[], density = 15): Point[] => {
    if (points.length < 3) return points;
    const polyline: Point[] = [points[0]];
    const quadraticPoint = (t: number, p0: Point, p1: Point, p2: Point) => {
        const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
        const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
        return { x, y };
    };
    let p0 = points[0];
    for (let i = 1; i < points.length - 2; i++) {
        const p1 = points[i];
        const p2 = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
        for (let j = 1; j <= density; j++) {
            polyline.push(quadraticPoint(j / density, p0, p1, p2));
        }
        p0 = p2;
    }
    const lastIndex = points.length - 1;
    const p1 = points[lastIndex - 1];
    const p2 = points[lastIndex];
    for (let j = 1; j <= density; j++) {
        polyline.push(quadraticPoint(j / density, p0, p1, p2));
    }
    return polyline;
};

/**
 * Generates points for a round cap (semicircle) at the end of a stroke.
 * Rotates the startNormal vector clockwise by 180 degrees in steps.
 */
export const generateCap = (center: Point, radius: number, startNormal: Point, endNormal: Point, steps: number = 8): Point[] => {
    const points: Point[] = [];
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        // Rotate -180 degrees (clockwise in standard math, but creates correct winding for outlines)
        const angle = -Math.PI * t; 
        const vec = VEC.rotate(startNormal, angle);
        points.push(VEC.add(center, VEC.scale(vec, radius)));
    }
    return points;
};

/**
 * Helper function to generate outline points for a path based on thickness and contrast.
 * This simulates a nib with a vertical axis (90 degrees) or a custom angle.
 */
export const getStrokeOutlinePoints = (points: Point[], thickness: number, contrast: number = 1.0, angle?: number): { outline1: Point[], outline2: Point[] } => {
     const polyline = curveToPolyline(points, 15);
     if (polyline.length < 2) return { outline1: [], outline2: [] };
     
     const outline1: Point[] = [];
     const outline2: Point[] = [];
     
     const nibAngleRad = angle !== undefined ? (angle * Math.PI / 180) : (90 * Math.PI / 180);
     const perpToNib = { x: -Math.sin(nibAngleRad), y: Math.cos(nibAngleRad) }; 
     
     // Smoothing window size for terminals. 
     // Since curveToPolyline generates dense points, 4 points covers a small but stable distance.
     const TERMINAL_SMOOTHING_WINDOW = 4;

     for (let i = 0; i < polyline.length; i++) {
        const p_curr = polyline[i];
        const p_prev = polyline[i - 1];
        const p_next = polyline[i + 1];
        let normal: Point;
        let dir: Point;

        if (!p_prev) {
            // --- START POINT STABILIZATION ---
            // Instead of just p_next - p_curr, we average the direction over the first few points
            // to avoid "flaring" from micro-hooks at the start of a stroke.
            const lookAheadIndex = Math.min(polyline.length - 1, i + TERMINAL_SMOOTHING_WINDOW);
            const p_lookAhead = polyline[lookAheadIndex];
            dir = VEC.normalize(VEC.sub(p_lookAhead, p_curr));
            
            // Fallback if lookahead point is same as current (zero length start)
            if (Math.abs(dir.x) < 1e-5 && Math.abs(dir.y) < 1e-5 && p_next) {
                 dir = VEC.normalize(VEC.sub(p_next, p_curr));
            }
            
            normal = VEC.perp(dir);
        } else if (!p_next) {
            // --- END POINT STABILIZATION ---
            // Similar logic for the end, looking backwards.
            const lookBehindIndex = Math.max(0, i - TERMINAL_SMOOTHING_WINDOW);
            const p_lookBehind = polyline[lookBehindIndex];
            dir = VEC.normalize(VEC.sub(p_curr, p_lookBehind));
            
            if (Math.abs(dir.x) < 1e-5 && Math.abs(dir.y) < 1e-5 && p_prev) {
                 dir = VEC.normalize(VEC.sub(p_curr, p_prev));
            }

            normal = VEC.perp(dir);
        } else {
            // --- MIDDLE POINTS (Standard Miter Join) ---
            // We keep the precise local geometry for corners to ensure sharp turns are preserved.
          const dir1 = VEC.normalize(VEC.sub(p_curr, p_prev));
          const n1 = VEC.perp(dir1);
          const dir2 = VEC.normalize(VEC.sub(p_next, p_curr));
          const n2 = VEC.perp(dir2);
          
          // Miter join logic
          const miterVec = VEC.normalize(VEC.add(n1, n2));
          const dotProduct = VEC.dot(miterVec, n1);
          if (Math.abs(dotProduct) < 1e-6) {
            normal = n1;
          } else {
            let miterLen = 1 / dotProduct;
            if (miterLen > 5) { miterLen = 5; } // Miter limit
            normal = VEC.scale(miterVec, miterLen);
          }
          // Use average direction for thickness calculation
          dir = VEC.normalize(VEC.add(dir1, dir2));
        }

        let thicknessAtPoint = thickness;
        
        if (angle !== undefined) {
            // Explicit Calligraphy Tool
             thicknessAtPoint = thickness * Math.max(0.1, Math.abs(VEC.dot(dir, perpToNib))); 
        } else if (contrast < 1.0) {
            // Global Contrast Mode
            const unitNormal = VEC.normalize(normal);
            const verticalFactor = Math.abs(unitNormal.x); 
            
            const minThickness = thickness * contrast;
            thicknessAtPoint = minThickness + (thickness - minThickness) * verticalFactor;
        }
        
        outline1.push(VEC.add(p_curr, VEC.scale(normal, thicknessAtPoint / 2)));
        outline2.push(VEC.add(p_curr, VEC.scale(normal, -thicknessAtPoint / 2)));
     }
     
     return { outline1, outline2 };
}
