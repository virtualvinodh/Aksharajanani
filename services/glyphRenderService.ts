import { Point, Path, AttachmentPoint, MarkAttachmentRules, Character, FontMetrics, CharacterSet, GlyphData, Segment, AppSettings, ComponentTransform, PositioningRules, UnifiedRenderContext } from '../types';
import { VEC } from '../utils/vectorUtils';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { DRAWING_CANVAS_SIZE } from '../constants';
import { deepClone } from '../utils/cloneUtils';
import { expandMembers } from './groupExpansionService';

declare var paper: any;
declare var UnicodeProperties: any;

// A single, persistent paper.js instance to avoid memory churn.
// Exported to be reused by hooks and other services.
export const paperScope = new paper.PaperScope();
paperScope.setup(new paper.Size(1, 1));


export interface RenderOptions {
    strokeThickness: number;
    color: string;
    lineDash?: number[];
    contrast?: number; // Optional contrast for variable width rendering
}

// BoundingBox is exported from types.ts, but we re-export locally or use it here.
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BBox {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}


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
          let miterVec = VEC.normalize(VEC.add(n1, n2));
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


/**
 * Calculates a precise bounding box for a set of paths by flattening curves and accounting for stroke thickness.
 * @param data The array of Path objects OR a GlyphData object to measure.
 * @param strokeThickness The thickness of the strokes.
 * @returns A BoundingBox object or null if there are no points.
 */
export const getAccurateGlyphBBox = (data: Path[] | GlyphData, strokeThickness: number): BoundingBox | null => {
    let paths: Path[];
    let glyphData: GlyphData | undefined;

    if (Array.isArray(data)) {
        paths = data;
    } else {
        glyphData = data;
        paths = data.paths;
        if (glyphData._cache?.bbox && glyphData._cache.bbox.strokeThickness === strokeThickness) {
            return glyphData._cache.bbox.data;
        }
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasContent = false;
    
    // Clear the project on the shared scope to prevent state leakage from previous calculations.
    paperScope.project.clear();

    paths.forEach(path => {
        if (path.type === 'outline' && path.segmentGroups) {
            hasContent = true;
            let paperItem: any;
            const createPaperPath = (segments: Segment[]) => new paperScope.Path({ 
                segments: segments.map(seg => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y), new paperScope.Point(seg.handleIn.x, seg.handleIn.y), new paperScope.Point(seg.handleOut.x, seg.handleOut.y))), 
                closed: true 
            });

            if (path.segmentGroups.length > 1) {
                const nonEmptyGroups = path.segmentGroups.filter(g => g.length > 0);
                if (nonEmptyGroups.length > 0) {
                     const compoundPath = new paperScope.CompoundPath({
                        children: nonEmptyGroups.map(createPaperPath),
                        fillRule: 'evenodd'
                    });
                    paperItem = compoundPath;
                }
            } else if (path.segmentGroups.length === 1 && path.segmentGroups[0].length > 0) {
                paperItem = createPaperPath(path.segmentGroups[0]);
            }

            if (paperItem && paperItem.bounds && paperItem.bounds.width > 0) {
                const { x, y, width, height } = paperItem.bounds;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x + width);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y + height);
            }
            return;
        }

        if (path.points.length === 0) return;
        hasContent = true;

        if (path.type === 'dot') {
            const center = path.points[0];
            const radius = path.points.length > 1 ? VEC.len(VEC.sub(path.points.length > 1 ? path.points[1] : path.points[0], center)) : strokeThickness / 2;
            minX = Math.min(minX, center.x - radius);
            maxX = Math.max(maxX, center.x + radius);
            minY = Math.min(minY, center.y - radius);
            maxY = Math.max(maxY, center.y + radius);
        } else {
            let pointsToTest: Point[];
            if ((path.type === 'pen' || path.type === 'calligraphy') && path.points.length > 2) {
                pointsToTest = curveToPolyline(path.points);
            } else if (path.type === 'curve' && path.points.length === 3) {
                pointsToTest = quadraticCurveToPolyline(path.points);
            } else {
                pointsToTest = path.points;
            }

            if (pointsToTest.length === 0) return;

            let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
            pointsToTest.forEach(point => {
                pMinX = Math.min(pMinX, point.x);
                pMaxX = Math.max(pMaxX, point.x);
                pMinY = Math.min(pMinY, point.y);
                pMaxY = Math.max(pMaxY, point.y);
            });

            const halfStroke = strokeThickness / 2;
            minX = Math.min(minX, pMinX - halfStroke);
            maxX = Math.max(maxX, pMaxX + halfStroke);
            minY = Math.min(minY, pMinY - halfStroke);
            maxY = Math.max(maxY, pMaxY + halfStroke);
        }
    });

    const result = hasContent ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;

    if (glyphData) {
        if (!glyphData._cache) glyphData._cache = {};
        glyphData._cache.bbox = { data: result, strokeThickness };
    }

    return result;
};

export const getGlyphSubBBoxes = (
    glyphData: GlyphData,
    baselineY: number,
    toplineY: number,
    strokeThickness: number
): { ascender: BBox | null; xHeight: BBox | null; descender: BBox | null; full: BBox } | null => {
    const fullBBox = getAccurateGlyphBBox(glyphData, strokeThickness);
    if (!fullBBox) return null;
    const fullBBoxAsBBox: BBox = { minX: fullBBox.x, maxX: fullBBox.x + fullBBox.width, minY: fullBBox.y, maxY: fullBBox.y + fullBBox.height };

    let ascenderRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let xHeightRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let descenderRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

    const expandBox = (box: BBox, p: Point) => {
        box.minX = Math.min(box.minX, p.x);
        box.maxX = Math.max(box.maxX, p.x);
        box.minY = Math.min(box.minY, p.y);
        box.maxY = Math.max(box.maxY, p.y);
    };
    
    const tolerance = strokeThickness / 2;

    paperScope.project.clear();

    glyphData.paths.forEach(path => {
        let pointsToCategorize: Point[] = [];
        if (path.type === 'outline' && path.segmentGroups) {
            path.segmentGroups.forEach(group => {
                if (group.length > 0) {
                    const paperPath = new paperScope.Path({
                        segments: group.map(seg => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y))),
                        closed: true
                    });
                    paperPath.flatten(1);
                    paperPath.segments.forEach((seg: any) => pointsToCategorize.push({ x: seg.point.x, y: seg.point.y }));
                    paperPath.remove();
                }
            });
        } else {
            pointsToCategorize = path.points;
        }

        pointsToCategorize.forEach(point => {
            if (point.y <= toplineY + tolerance) expandBox(ascenderRaw, point);
            if (point.y >= toplineY - tolerance && point.y <= baselineY + tolerance) expandBox(xHeightRaw, point);
            if (point.y >= baselineY - tolerance) expandBox(descenderRaw, point);
        });
    });
    
    const halfStroke = strokeThickness / 2;
    const adjustBox = (box: BBox): BBox | null => {
        if (box.minX === Infinity) return null;
        return {
            minX: box.minX - halfStroke,
            maxX: box.maxX + halfStroke,
            minY: box.minY - halfStroke,
            maxY: box.maxY + halfStroke,
        };
    };

    return {
        ascender: adjustBox(ascenderRaw),
        xHeight: adjustBox(xHeightRaw),
        descender: adjustBox(descenderRaw),
        full: fullBBoxAsBBox,
    };
};

export const getAttachmentPointCoords = (bbox: BoundingBox, pointName: AttachmentPoint): Point => {
    const { x, y, width, height } = bbox;
    switch (pointName) {
        case 'topLeft': return { x, y };
        case 'topCenter': return { x: x + width / 2, y };
        case 'topRight': return { x: x + width, y };
        case 'midLeft': return { x, y: y + height / 2 };
        case 'midRight': return { x: x + width, y: y + height / 2 };
        case 'bottomLeft': return { x, y: y + height };
        case 'bottomCenter': return { x: x + width / 2, y: y + height };
        case 'bottomRight': return { x: x + width, y: y + height };
        default: return { x, y }; // Fallback
    }
};

/**
 * Robustly finds the correct attachment rule for a given base/mark pair,
 * handling group expansions ($consonants) and specific overrides.
 */
export const resolveAttachmentRule = (
    baseName: string,
    markName: string,
    markAttachmentRules: MarkAttachmentRules | null,
    characterSets?: CharacterSet[],
    groups?: Record<string, string[]>
): any | null => {
    if (!markAttachmentRules) return null;

    // 1. Exact Match: Base Name -> Mark Name
    let rule = markAttachmentRules[baseName]?.[markName];

    // 2. Group/Class Match: Look for group keys like $consonants or @BaseClass
    if (!rule && (characterSets || (groups && Object.keys(groups).length > 0))) {
        // We iterate through all keys in markAttachmentRules to see if any of them are groups
        // that contain our baseName.
        for (const baseKey in markAttachmentRules) {
            if (baseKey.startsWith('$') || baseKey.startsWith('@')) {
                const groupName = baseKey.substring(1);
                const safeGroups = groups || {};
                
                // Use expandMembers logic to check if baseName is in this group
                // Note: To be efficient, we check inclusion.
                const members = expandMembers([baseKey], safeGroups, characterSets);
                
                if (members.includes(baseName)) {
                    // Found a matching base group!
                    const categoryRules = markAttachmentRules[baseKey];
                    
                    // Now check if the mark exists in this category
                    // 2a. Exact match for mark in this category
                    rule = categoryRules?.[markName];
                    
                    if (rule) break;

                    // 2b. Check mark group in this category
                    for (const markKey in categoryRules) {
                        if ((markKey.startsWith('$') || markKey.startsWith('@'))) {
                            const markMembers = expandMembers([markKey], safeGroups, characterSets);
                            if (markMembers.includes(markName)) {
                                rule = categoryRules[markKey];
                                break;
                            }
                        }
                    }
                    if (rule) break;
                }
            }
        }
    }
    
    return rule;
};

export const calculateDefaultMarkOffset = (
    baseChar: Character,
    markChar: Character,
    baseBbox: BoundingBox | null,
    markBbox: BoundingBox | null,
    markAttachmentRules: MarkAttachmentRules | null,
    metrics: FontMetrics,
    characterSets?: CharacterSet[],
    isAbsolute: boolean = false,
    groups: Record<string, string[]> = {},
    movementConstraint: 'horizontal' | 'vertical' | 'none' = 'none'
): Point => {
    if (isAbsolute) {
        return { x: 0, y: 0 };
    }
    
    let offset = { x: 0, y: 0 };
    
    if (baseBbox && markBbox) {
        let rule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups);
        
        // 3. FALLBACK: Geometric Defaults (if no rule found)
        if (!rule) {
            // Only use topCenter/bottomCenter default if the mark is explicitly non-spacing (advWidth: 0)
            const isNonSpacing = markChar.advWidth === 0 || markChar.advWidth === '0';
            if (isNonSpacing) {
                rule = ["topCenter", "bottomCenter"];
            }
        }

        if (rule) {
            const [baseAttachName, markAttachName, xOffsetStr, yOffsetStr] = rule;
            let baseAttachPoint = getAttachmentPointCoords(baseBbox, baseAttachName as AttachmentPoint);
            
            if (xOffsetStr !== undefined && yOffsetStr !== undefined) {
                const xOffset = parseFloat(xOffsetStr) || 0;
                const yOffset = parseFloat(yOffsetStr) || 0;
                baseAttachPoint = {
                    x: baseAttachPoint.x + xOffset,
                    y: baseAttachPoint.y + yOffset,
                };
            }

            const markAttachPoint = getAttachmentPointCoords(markBbox, markAttachName as AttachmentPoint);
            offset = VEC.sub(baseAttachPoint, markAttachPoint);
        } else {
             // Priority 2: Absolute Fallback (Side-by-side) 
             const baseRsb = baseChar.rsb ?? metrics.defaultRSB;
             const markLsb = markChar.lsb ?? metrics.defaultLSB;
             const targetX = baseBbox.x + baseBbox.width + baseRsb;
             const dx = (targetX + markLsb) - markBbox.x;
             offset = { x: dx, y: 0 };
        }
    }
    
    // Apply constraints
    if (movementConstraint === 'horizontal') {
        offset.y = 0;
    } else if (movementConstraint === 'vertical') {
        offset.x = 0;
    }

    return offset;
};

// ... (keep rest of file: renderPaths, generateCompositeGlyphData, updateComponentInPaths) ...
export const renderPaths = (ctx: CanvasRenderingContext2D, paths: Path[], options: RenderOptions) => {
  ctx.strokeStyle = options.color;
  ctx.fillStyle = options.color;
  ctx.lineWidth = options.strokeThickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(options.lineDash || []);

  paths.forEach(path => {
    // --- Handle 'outline' type from SVG import ---
    if (path.type === 'outline' && path.segmentGroups && path.segmentGroups.length > 0) {
        ctx.beginPath();
        
        path.segmentGroups.forEach((segmentGroup: Segment[]) => {
            if (segmentGroup.length === 0) return;

            const firstSegment = segmentGroup[0];
            ctx.moveTo(firstSegment.point.x, firstSegment.point.y);

            for (let i = 0; i < segmentGroup.length; i++) {
                const current = segmentGroup[i];
                const next = segmentGroup[(i + 1) % segmentGroup.length];
                
                const handle1 = VEC.add(current.point, current.handleOut);
                const handle2 = VEC.add(next.point, next.handleIn);

                ctx.bezierCurveTo(handle1.x, handle1.y, handle2.x, handle2.y, next.point.x, next.point.y);
            }
            // All sub-paths in a compound path are closed.
            ctx.closePath();
        });
        
        ctx.fill(); // Use fill with winding rule to handle holes.
        return; // Done with this path, go to the next one.
    }

    const stroke = path.points;
    if (stroke.length === 0) return;

    if (path.type === 'dot') {
      const center = stroke[0];
      const radius = stroke.length > 1 ? VEC.len(VEC.sub(stroke[1], center)) : options.strokeThickness / 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }

    // Handle Calligraphy (Specific Tool) or Global Contrast (General Setting)
    if (path.type === 'calligraphy' || (options.contrast !== undefined && options.contrast < 1.0 && ['pen', 'line', 'curve', 'circle', 'ellipse'].includes(path.type))) {
        const angle = path.type === 'calligraphy' ? path.angle : undefined; // Calligraphy tool uses specific angle
        const contrast = path.type === 'calligraphy' ? 0.2 : (options.contrast || 1.0); // Specific Calligraphy tool has high contrast by default
        
        // Calculate outline points
        const { outline1, outline2 } = getStrokeOutlinePoints(stroke, options.strokeThickness, contrast, angle);

        if (outline1.length > 0) {
            ctx.beginPath();
            ctx.moveTo(outline1[0].x, outline1[0].y);
            for (let i = 1; i < outline1.length; i++) ctx.lineTo(outline1[i].x, outline1[i].y);
            ctx.lineTo(outline2[outline2.length - 1].x, outline2[outline2.length - 1].y);
            for (let i = outline2.length - 2; i >= 0; i--) ctx.lineTo(outline2[i].x, outline2[i].y);
            ctx.closePath();
            ctx.fill();
        }
        return;
    }

    if (stroke.length < 2) return;
    ctx.beginPath();
    if (path.type === 'curve' && stroke.length === 3) {
      ctx.moveTo(stroke[0].x, stroke[0].y);
      ctx.quadraticCurveTo(stroke[1].x, stroke[1].y, stroke[2].x, stroke[2].y);
    } else if (path.type === 'pen' && stroke.length > 2) {
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 2; i++) {
        const xc = (stroke[i].x + stroke[i + 1].x) / 2;
        const yc = (stroke[i].y + stroke[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, xc, yc);
      }
      ctx.quadraticCurveTo(stroke[stroke.length - 2].x, stroke[stroke.length - 2].y, stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
    } else {
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  });
};

const generateId = () => `${Date.now()}-${Math.random()}`;

// Helper: Normalize transform config to new object syntax
const normalizeTransform = (config: any, index: number): ComponentTransform => {
    // 1. New Syntax: Array of Objects
    if (Array.isArray(config) && config.length > 0 && typeof config[0] === 'object' && !Array.isArray(config[0])) {
         const entry = config[index];
         if (!entry) return { scale: 1, x: 0, y: 0, mode: 'relative' };
         return {
             scale: entry.scale ?? 1,
             x: entry.x ?? 0,
             y: entry.y ?? 0,
             mode: entry.mode ?? 'relative'
         };
    }

    // 2. Legacy: Array of Arrays [[1], [1, "touching"]]
    if (Array.isArray(config) && Array.isArray(config[0])) {
         const entry = config[index];
         if (!entry) return { scale: 1, x: 0, y: 0, mode: 'relative' };
         return {
             scale: typeof entry[0] === 'number' ? entry[0] : 1,
             y: typeof entry[1] === 'number' ? entry[1] : 0,
             mode: entry.includes('touching') ? 'touching' : (entry.includes('absolute') ? 'absolute' : 'relative'),
             x: 0
         };
    }

    // 3. Legacy: Simple Array [0.6, 200] -> Applies to all components (or specific ones depending on context)
    // In legacy logic, this array was typically used for single-component glyphs (marks)
    if (Array.isArray(config) && typeof config[0] === 'number') {
         return {
             scale: config[0] ?? 1,
             y: config[1] ?? 0,
             mode: 'relative',
             x: 0
         };
    }

    return { scale: 1, x: 0, y: 0, mode: 'relative' };
};

interface GenerateCompositeGlyphDataArgs {
    character: Character;
    allCharsByName: Map<string, Character>;
    allGlyphData: Map<number, GlyphData>;
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    allCharacterSets: CharacterSet[];
    groups?: Record<string, string[]>;
}

export const generateCompositeGlyphData = ({
    character,
    allCharsByName,
    allGlyphData,
    settings,
    metrics,
    markAttachmentRules,
    allCharacterSets,
    groups = {}
}: GenerateCompositeGlyphDataArgs): GlyphData | null => {
    const componentNames = character.link || character.composite;
    if (!componentNames || componentNames.length === 0) return null;

    const componentChars = componentNames.map(name => allCharsByName.get(name)).filter((c): c is Character => !!c);

    if (componentChars.length !== componentNames.length || !componentChars.every(c => isGlyphDrawn(allGlyphData.get(c.unicode)))) {
        return null;
    }

    const transformComponentPaths = (paths: Path[], charDef: Character, componentIndex: number): Path[] => {
        const transformConfig = charDef.compositeTransform;
        
        // MODIFICATION: Only retrieve scale. Ignore X/Y here.
        const { scale } = normalizeTransform(transformConfig, componentIndex);

        if (scale === 1.0) return paths;

        const componentBbox = getAccurateGlyphBBox(paths, settings.strokeThickness);
        if (!componentBbox) return paths;

        const centerX = componentBbox.x + componentBbox.width / 2;
        const centerY = componentBbox.y + componentBbox.height / 2;
        
        // Apply Scale around center
        const transformPoint = (p: Point) => VEC.add(VEC.scale(VEC.sub(p, { x: centerX, y: centerY }), scale!), { x: centerX, y: centerY });

        let transformed = paths.map((p: Path) => ({
            ...p,
            points: p.points.map(transformPoint),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map(seg => ({
                ...seg,
                point: transformPoint(seg.point),
                handleIn: VEC.scale(seg.handleIn, scale!),
                handleOut: VEC.scale(seg.handleOut, scale!)
            }))) : undefined
        }));

        // MODIFICATION: Removed X/Y translation application.
        return transformed;
    };

    const transformedComponents = componentChars.map((char, index) => {
        const glyph = allGlyphData.get(char.unicode)!;
        // OPTIMIZATION: Use deepClone instead of JSON
        const rawPaths = deepClone(glyph.paths);
        const transformedPaths = transformComponentPaths(rawPaths, character, index);
        const bbox = getAccurateGlyphBBox(transformedPaths, settings.strokeThickness);

        // MODIFICATION: Capture manual transform config
        const { x, y, mode } = normalizeTransform(character.compositeTransform, index);
        return { char, paths: transformedPaths, bbox, manualTransform: { x: x || 0, y: y || 0, mode } };
    });
    
    if (transformedComponents.length === 0 || !transformedComponents[0]) return null;

    // Base Component (Index 0)
    // Apply manual shift immediately
    let baseComp = transformedComponents[0];
    let baseOffset = { x: baseComp.manualTransform.x, y: baseComp.manualTransform.y };

    let accumulatedPaths: Path[] = baseComp.paths.map(p => ({ 
        ...p, 
        id: generateId(), 
        groupId: 'component-0',
        points: p.points.map(pt => VEC.add(pt, baseOffset)),
        segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: VEC.add(seg.point, baseOffset) }))) : undefined
    }));

    for (let i = 1; i < transformedComponents.length; i++) {
        const baseComponent = transformedComponents[i - 1];
        const markComponent = transformedComponents[i];

        const markBbox = markComponent.bbox;
        if (!markBbox) continue;

        let autoOffset: Point;
        const { mode, x, y } = markComponent.manualTransform;
    
        if (mode === 'touching') {
            const prevBbox = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
            
            if (prevBbox) {
                const targetX = prevBbox.x + prevBbox.width;
                // Move mark so its minX aligns with targetX
                autoOffset = { x: targetX - markBbox.x, y: 0 };
            } else {
                autoOffset = { x: 0, y: 0 };
            }
        } else if (mode === 'absolute') {
             // Absolute means we don't calculate relative offset.
             autoOffset = { x: 0, y: 0 };
        } else {
            // Relative (Default)
            let baseBboxForOffset: BoundingBox | null;
            
            // For relative, we typically attach to the accumulated shape
            baseBboxForOffset = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
            
            // Pass characterSets for group expansion within offset calculation
            autoOffset = calculateDefaultMarkOffset(
                baseComponent.char,
                markComponent.char,
                baseBboxForOffset,
                markBbox,
                markAttachmentRules,
                metrics,
                allCharacterSets,
                false, // isAbsolute handled by logic above
                groups
            );
        }

        // Combine Auto + Manual
        const finalOffset = { x: autoOffset.x + x, y: autoOffset.y + y };

        const finalMarkPaths = markComponent.paths.map((p: Path) => ({
            ...p,
            id: generateId(),
            groupId: `component-${i}`,
            points: p.points.map((pt: Point) => VEC.add(pt, finalOffset)),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: VEC.add(seg.point, finalOffset) }))) : undefined
        }));

        accumulatedPaths.push(...finalMarkPaths);
    }
    
    if (accumulatedPaths.length === 0) return null;

    const finalBbox = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
    if (finalBbox) {
        const centerX = finalBbox.x + finalBbox.width / 2;
        const canvasCenter = DRAWING_CANVAS_SIZE / 2;
        const shiftX = canvasCenter - centerX;
        
        const centeredPaths = accumulatedPaths.map(p => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + shiftX, y: pt.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map((seg: Segment) => ({ ...seg, point: { x: seg.point.x + shiftX, y: seg.point.y } }))) : undefined
        }));
        return { paths: centeredPaths };
    }
    
    return { paths: accumulatedPaths };
};

export const updateComponentInPaths = (
    currentPaths: Path[],
    componentIndex: number,
    newSourcePaths: Path[],
    strokeThickness: number,
    transformConfig?: any
): Path[] | null => {
    const groupIdToUpdate = `component-${componentIndex}`;
    const oldPathsOfComponent = currentPaths.filter(p =>
        p.groupId === groupIdToUpdate || (p.groupId && p.groupId.startsWith(`${groupIdToUpdate}-`))
    );

    if (oldPathsOfComponent.length === 0) return null;

    const oldBbox = getAccurateGlyphBBox(oldPathsOfComponent, strokeThickness);
    const newSourceBbox = getAccurateGlyphBBox(newSourcePaths, strokeThickness);

    if (!oldBbox || !newSourceBbox) return null;

    const { scale } = normalizeTransform(transformConfig, componentIndex);

    const oldAnchor = { x: oldBbox.x, y: oldBbox.y + oldBbox.height };
    const newSourceAnchor = { x: newSourceBbox.x, y: newSourceBbox.y + newSourceBbox.height };

    const transformPoint = (pt: Point): Point => {
        const relativeVec = VEC.sub(pt, newSourceAnchor);
        const scaledVec = VEC.scale(relativeVec, scale!);
        return VEC.add(scaledVec, oldAnchor);
    };

    const transformedNewPaths = newSourcePaths.map((p: Path) => ({
        ...p,
        id: `${p.id}-c${componentIndex}-${Date.now()}`,
        groupId: groupIdToUpdate,
        points: p.points.map(transformPoint),
        segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({
            ...seg,
            point: transformPoint(seg.point),
            handleIn: VEC.scale(seg.handleIn, scale!),
            handleOut: VEC.scale(seg.handleOut, scale!)
        }))) : undefined
    }));

    const otherPaths = currentPaths.filter(p =>
        p.groupId !== groupIdToUpdate && (!p.groupId || !p.groupId.startsWith(`${groupIdToUpdate}-`))
    );

    return [...otherPaths, ...transformedNewPaths];
};

/**
 * Master path resolver for any character item.
 * Assembles virtual syllables or kerning pairs based on their 'position' or 'kern' properties.
 */
export const getUnifiedPaths = (item: Character, ctx: UnifiedRenderContext): Path[] => {
    
    // PRIORITY CHECK: If there is actual drawing data for this glyph, and it's NOT a live link, use the actual data.
    // This fixes the issue where Composite glyphs ignored manual edits in the UnifiedCard.
    if (item.unicode !== undefined && !item.link) {
        const directData = ctx.glyphDataMap.get(item.unicode);
        // We use the utility to check if it's actually drawn (has points)
        if (isGlyphDrawn(directData)) {
            return directData!.paths;
        }
    }
    
    // NEW: Handle standard linked glyphs by dynamically baking them from components.
    if (item.link || item.composite) {
        // We use generateCompositeGlyphData which accepts the full context (including proxies).
        // This ensures that if the context has "live" data for source characters, the composite
        // is rebuilt using that live data.
        const compositeData = generateCompositeGlyphData({
            character: item,
            allCharsByName: ctx.allCharsByName,
            allGlyphData: ctx.glyphDataMap,
            settings: { strokeThickness: ctx.strokeThickness } as any, // Only thickness is needed for bbox calculations inside
            metrics: ctx.metrics!,
            markAttachmentRules: ctx.markAttachmentRules,
            allCharacterSets: ctx.characterSets,
            groups: ctx.groups
        });
        return compositeData?.paths || [];
    }

    // 1. Positioned Syllable Branch
    if (item.position && item.position.length === 2) {
        const baseName = item.position[0];
        const markName = item.position[1];
        const baseChar = ctx.allCharsByName.get(baseName);
        const markChar = ctx.allCharsByName.get(markName);
        
        if (!baseChar || !markChar) return [];

        const baseGlyph = ctx.glyphDataMap.get(baseChar.unicode!);
        const markGlyph = ctx.glyphDataMap.get(markChar.unicode!);

        if (!isGlyphDrawn(baseGlyph) && !isGlyphDrawn(markGlyph)) return [];

        let offset = ctx.markPositioningMap?.get(`${baseChar.unicode}-${markChar.unicode}`);
        
        if (!offset && ctx.metrics) {
            const baseBbox = getAccurateGlyphBBox(baseGlyph?.paths || [], ctx.strokeThickness);
            const markBbox = getAccurateGlyphBBox(markGlyph?.paths || [], ctx.strokeThickness);
            
            // Extract movement constraint if rule exists
            let constraint: 'horizontal' | 'vertical' | 'none' = 'none';
            const rule = ctx.positioningRules?.find(r => 
                expandMembers(r.base, ctx.groups || {}, ctx.characterSets).includes(baseChar.name) && 
                expandMembers(r.mark || [], ctx.groups || {}, ctx.characterSets).includes(markChar.name)
            );
            if (rule?.movement === 'horizontal' || rule?.movement === 'vertical') {
                constraint = rule.movement;
            }

            offset = calculateDefaultMarkOffset(
                baseChar, markChar, baseBbox, markBbox, 
                ctx.markAttachmentRules || null, ctx.metrics, 
                ctx.characterSets, false, ctx.groups || {}, 
                constraint
            );
        }

        const combined: Path[] = [];
        if (baseGlyph) combined.push(...baseGlyph.paths);
        if (markGlyph) {
            const dx = offset?.x || 0;
            const dy = offset?.y || 0;
            const shiftedMark = deepClone(markGlyph.paths).map(p => ({
                ...p,
                points: p.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })),
                segmentGroups: p.segmentGroups?.map(g => g.map(s => ({
                    ...s,
                    point: { x: s.point.x + dx, y: s.point.y + dy }
                })))
            }));
            combined.push(...shiftedMark);
        }
        return combined;
    }

    // 2. Kerned Pair Branch
    if (item.kern && item.kern.length === 2) {
        const leftName = item.kern[0];
        const rightName = item.kern[1];
        const leftChar = ctx.allCharsByName.get(leftName);
        const rightChar = ctx.allCharsByName.get(rightName);

        if (!leftChar || !rightChar || !ctx.metrics) return [];

        const leftGlyph = ctx.glyphDataMap.get(leftChar.unicode!);
        const rightGlyph = ctx.glyphDataMap.get(rightChar.unicode!);

        if (!isGlyphDrawn(leftGlyph) || !isGlyphDrawn(rightGlyph)) return [];

        const lBox = getAccurateGlyphBBox(leftGlyph!.paths, ctx.strokeThickness);
        const rBox = getAccurateGlyphBBox(rightGlyph!.paths, ctx.strokeThickness);

        if (!lBox || !rBox) return [];

        const kernVal = ctx.kerningMap?.get(`${leftChar.unicode}-${rightChar.unicode}`) || 0;
        const rsbL = leftChar.rsb ?? ctx.metrics.defaultRSB;
        const lsbR = rightChar.lsb ?? ctx.metrics.defaultLSB;
        
        // Math: Total shift for the right character content
        const shiftX = (lBox.x + lBox.width) + rsbL + kernVal + lsbR - rBox.x;

        const combined: Path[] = [...leftGlyph!.paths];
        const shiftedRight = deepClone(rightGlyph!.paths).map(p => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + shiftX, y: pt.y })),
            segmentGroups: p.segmentGroups?.map(g => g.map(s => ({
                ...s,
                point: { x: s.point.x + shiftX, y: s.point.y }
            })))
        }));
        combined.push(...shiftedRight);
        return combined;
    }

    // 3. Standard Glyph Branch (Base glyphs without links)
    const glyph = ctx.glyphDataMap.get(item.unicode!);
    return glyph?.paths || [];
};

/**
 * Calculate universal fitting transform for any set of paths.
 * Returns scale and translation to fit the content within targetSize.
 */
export const calculateUnifiedTransform = (
    paths: Path[], 
    targetSize: number, 
    strokeThickness: number, 
    options?: { character?: Character, metrics?: FontMetrics }
) => {
    const bbox = getAccurateGlyphBBox(paths, strokeThickness);
    
    // Fallback: standard scale
    let scale = targetSize / DRAWING_CANVAS_SIZE;
    let tx = 0;
    let ty = 0;

    if (bbox && bbox.width > 0 && bbox.height > 0) {
        const PADDING = targetSize * 0.1;
        const availableWidth = targetSize - (PADDING * 2);
        const availableHeight = targetSize - (PADDING * 2);
        
        const fitScaleX = availableWidth / bbox.width;
        const fitScaleY = availableHeight / bbox.height;
        const fitScale = Math.min(fitScaleX, fitScaleY);
        
        if (fitScale < scale) scale = fitScale;

        const contentCenterX = bbox.x + bbox.width / 2;
        tx = (targetSize / 2) - (contentCenterX * scale);

        let shouldVerticallyCenter = true;
        const char = options?.character;

        if (char?.glyphClass === 'mark' || char?.kern) {
            shouldVerticallyCenter = false;
        } else if (char?.unicode && typeof UnicodeProperties !== 'undefined') {
            try {
                const cat = UnicodeProperties.getCategory(char.unicode);
                if (cat === 'Lm' || cat === 'Sk' || cat.startsWith('P')) {
                    shouldVerticallyCenter = false;
                }
            } catch (e) {}
        }

        if (shouldVerticallyCenter) {
            const contentCenterY = bbox.y + bbox.height / 2;
            ty = (targetSize / 2) - (contentCenterY * scale);
        } else {
            // Keep baseline relative position
            ty = (targetSize - (DRAWING_CANVAS_SIZE * scale)) / 2;
        }
    } else {
        ty = (targetSize - (DRAWING_CANVAS_SIZE * scale)) / 2;
    }

    return { scale, tx, ty };
};