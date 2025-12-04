


// FIX: Added AppSettings to types import and added new imports for isGlyphDrawn and DRAWING_CANVAS_SIZE
import { Point, Path, AttachmentPoint, MarkAttachmentRules, Character, FontMetrics, CharacterSet, GlyphData, Segment, AppSettings } from '../types';
import { VEC } from '../utils/vectorUtils';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { DRAWING_CANVAS_SIZE } from '../constants';

declare var paper: any;

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
            const radius = path.points.length > 1 ? VEC.len(VEC.sub(path.points[1], center)) : strokeThickness / 2;
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

export const calculateDefaultMarkOffset = (
    baseChar: Character,
    markChar: Character,
    baseBbox: BoundingBox | null,
    markBbox: BoundingBox | null,
    markAttachmentRules: MarkAttachmentRules | null,
    metrics: FontMetrics,
    characterSets?: CharacterSet[],
    isAbsolute: boolean = false
): Point => {
    if (isAbsolute) {
        return { x: 0, y: 0 };
    }
    // Priority 1: Check for a specific attachment rule for the exact base character name.
    if (markAttachmentRules && baseBbox && markBbox) {
        let rule = markAttachmentRules[baseChar.name]?.[markChar.name];

        // Priority 1.5: If no specific rule, check for a category-based rule (e.g., "$consonants").
        if (!rule && characterSets) {
            for (const key in markAttachmentRules) {
                if (key.startsWith('$')) {
                    const setName = key.substring(1);
                    // Find the character set that matches the key (e.g., "$consonants" -> find set with nameKey "consonants")
                    const set = characterSets.find(s => s.nameKey === setName);
                    // Check if the current base character is a member of this set
                    if (set && set.characters.some(c => c.name === baseChar.name)) {
                        // Check if this category rule has an entry for the current mark character
                        const categoryRule = markAttachmentRules[key]?.[markChar.name];
                        if (categoryRule) {
                            rule = categoryRule;
                            break; // Found a matching category rule, stop searching.
                        }
                    }
                }
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
            return VEC.sub(baseAttachPoint, markAttachPoint);
        }
    }

    // Priority 2: Fallback to side-by-side positioning based on bearings
    if (baseBbox && markBbox) {
        const baseRsb = baseChar.rsb ?? metrics.defaultRSB;
        const markLsb = markChar.lsb ?? metrics.defaultLSB;

        // The target x position for the mark's content is the base's right edge plus bearings.
        const targetX = baseBbox.x + baseBbox.width + baseRsb;
        
        // The offset is the difference between where the mark's left edge should be and where it currently is,
        // also accounting for the mark's own LSB.
        const dx = (targetX + markLsb) - markBbox.x;

        // No vertical change, maintain baseline alignment (assuming both are drawn relative to it)
        const dy = 0;

        return { x: dx, y: dy };
    }

    // Default fallback if no bboxes
    return { x: 0, y: 0 };
};

/**
 * Renders a set of paths onto a canvas context.
 * @param ctx The 2D rendering context of the canvas.
 * @param paths The array of Path objects to draw.
 * @param options Rendering options like stroke thickness and color.
 */
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

interface GenerateCompositeGlyphDataArgs {
    character: Character;
    allCharsByName: Map<string, Character>;
    allGlyphData: Map<number, GlyphData>;
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    allCharacterSets: CharacterSet[];
}

export const generateCompositeGlyphData = ({
    character,
    allCharsByName,
    allGlyphData,
    settings,
    metrics,
    markAttachmentRules,
    allCharacterSets
}: GenerateCompositeGlyphDataArgs): GlyphData | null => {
    const componentNames = character.link || character.composite;
    if (!componentNames || componentNames.length === 0) return null;

    const componentChars = componentNames.map(name => allCharsByName.get(name)).filter((c): c is Character => !!c);

    if (componentChars.length !== componentNames.length || !componentChars.every(c => isGlyphDrawn(allGlyphData.get(c.unicode)))) {
        return null;
    }

    const transformComponentPaths = (paths: Path[], charDef: Character, componentIndex: number): Path[] => {
        const transformConfig = charDef.compositeTransform;
        if (!transformConfig) return paths;

        let scale = 1.0;
        let yOffset = 0;
    
        if (Array.isArray(transformConfig[0])) {
            const perComponentTransform = (transformConfig as (number|string)[][])[componentIndex];
            if (perComponentTransform) {
                scale = (perComponentTransform[0] as number) ?? 1.0;
                yOffset = (perComponentTransform[1] as number) ?? 0;
            }
        } else {
            scale = (transformConfig as [number, number])[0] ?? 1.0;
            yOffset = (transformConfig as [number, number])[1] ?? 0;
        }
    
        if (scale === 1.0 && yOffset === 0) return paths;

        const componentBbox = getAccurateGlyphBBox(paths, settings.strokeThickness);
        if (!componentBbox) return paths;

        const centerX = componentBbox.x + componentBbox.width / 2;
        const centerY = componentBbox.y + componentBbox.height / 2;
        const transformPoint = (p: Point) => VEC.add(VEC.scale(VEC.sub(p, { x: centerX, y: centerY }), scale), { x: centerX, y: centerY });

        let transformed = paths.map((p: Path) => ({
            ...p,
            points: p.points.map(transformPoint),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map(seg => ({
                ...seg,
                point: transformPoint(seg.point),
                handleIn: VEC.scale(seg.handleIn, scale),
                handleOut: VEC.scale(seg.handleOut, scale)
            }))) : undefined
        }));

        const newBaselineY = centerY + (metrics.baseLineY - centerY) * scale;
        const targetBaselineY = metrics.baseLineY + yOffset;
        const finalYShift = targetBaselineY - newBaselineY;

        if (Math.abs(finalYShift) > 1e-4) {
            transformed = transformed.map((p: Path) => ({
                ...p,
                points: p.points.map((pt: Point) => ({ ...pt, y: pt.y + finalYShift })),
                segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map(seg => ({ ...seg, point: { x: seg.point.x, y: seg.point.y + finalYShift } }))) : undefined
            }));
        }

        return transformed;
    };

    const transformedComponents = componentChars.map((char, index) => {
        const glyph = allGlyphData.get(char.unicode)!;
        const rawPaths = JSON.parse(JSON.stringify(glyph.paths));
        const transformedPaths = transformComponentPaths(rawPaths, character, index);
        const bbox = getAccurateGlyphBBox(transformedPaths, settings.strokeThickness);
        return { char, paths: transformedPaths, bbox };
    });
    
    if (transformedComponents.length === 0 || !transformedComponents[0]) return null;

    let accumulatedPaths: Path[] = transformedComponents[0].paths.map(p => ({ ...p, id: generateId(), groupId: 'component-0' }));

    for (let i = 1; i < transformedComponents.length; i++) {
        const baseComponent = transformedComponents[i - 1];
        const markComponent = transformedComponents[i];

        const markBbox = markComponent.bbox;
        if (!markBbox) continue;

        let offset: Point;
        let isAbsolute = false;
        let isTouching = false;
    
        const transformConfig = character.compositeTransform;
        if (transformConfig && Array.isArray(transformConfig[0])) {
            const perComponentTransform = (transformConfig as (string | number)[][])[i];
            if (perComponentTransform) {
                isAbsolute = perComponentTransform.includes('absolute');
                isTouching = perComponentTransform.includes('touching');
            }
        }
    
        if (isTouching) {
            const firstComponent = transformedComponents[0];
            const firstBbox = firstComponent.bbox;
            if (firstBbox) {
                const targetX = firstBbox.x + firstBbox.width;
                offset = { x: targetX - markBbox.x, y: 0 };
            } else {
                offset = { x: 0, y: 0 };
            }
        } else {
            let ruleExists = false;
            if (markAttachmentRules) {
                ruleExists = !!markAttachmentRules[baseComponent.char.name]?.[markComponent.char.name];
                if (!ruleExists && allCharacterSets) {
                     for (const key in markAttachmentRules) {
                        if (key.startsWith('$')) {
                            const setName = key.substring(1);
                            const set = allCharacterSets.find(s => s.nameKey === setName);
                            if (set && set.characters.some(c => c.name === baseComponent.char.name)) {
                                if (markAttachmentRules[key]?.[markComponent.char.name]) {
                                    ruleExists = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            let baseBboxForOffset: BoundingBox | null;
            if (ruleExists) {
                baseBboxForOffset = baseComponent.bbox;
            } else {
                baseBboxForOffset = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
            }
            
            offset = calculateDefaultMarkOffset(
                baseComponent.char,
                markComponent.char,
                baseBboxForOffset,
                markBbox,
                markAttachmentRules,
                metrics,
                allCharacterSets,
                isAbsolute
            );
        }

        const finalMarkPaths = markComponent.paths.map((p: Path) => ({
            ...p,
            id: generateId(),
            groupId: `component-${i}`,
            points: p.points.map((pt: Point) => VEC.add(pt, offset)),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: VEC.add(seg.point, offset) }))) : undefined
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
    transformConfig?: [number, number] | (number | string)[][]
): Path[] | null => {
    const groupIdToUpdate = `component-${componentIndex}`;
    const oldPathsOfComponent = currentPaths.filter(p =>
        p.groupId === groupIdToUpdate || (p.groupId && p.groupId.startsWith(`${groupIdToUpdate}-`))
    );

    if (oldPathsOfComponent.length === 0) return null;

    const oldBbox = getAccurateGlyphBBox(oldPathsOfComponent, strokeThickness);
    const newSourceBbox = getAccurateGlyphBBox(newSourcePaths, strokeThickness);

    if (!oldBbox || !newSourceBbox) return null;

    let scale = 1.0;
    if (transformConfig) {
        if (Array.isArray(transformConfig[0])) {
            const perComponentTransform = (transformConfig as (number | string)[][])[componentIndex];
            if (perComponentTransform && typeof perComponentTransform[0] === 'number') {
                scale = perComponentTransform[0];
            }
        } else if (typeof transformConfig[0] === 'number') {
            scale = transformConfig[0];
        }
    }

    const oldAnchor = { x: oldBbox.x, y: oldBbox.y + oldBbox.height };
    const newSourceAnchor = { x: newSourceBbox.x, y: newSourceBbox.y + newSourceBbox.height };

    const transformPoint = (pt: Point): Point => {
        const relativeVec = VEC.sub(pt, newSourceAnchor);
        const scaledVec = VEC.scale(relativeVec, scale);
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
            handleIn: VEC.scale(seg.handleIn, scale),
            handleOut: VEC.scale(seg.handleOut, scale)
        }))) : undefined
    }));

    const otherPaths = currentPaths.filter(p =>
        p.groupId !== groupIdToUpdate && (!p.groupId || !p.groupId.startsWith(`${groupIdToUpdate}-`))
    );

    return [...otherPaths, ...transformedNewPaths];
};