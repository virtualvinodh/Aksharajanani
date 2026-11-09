/**
 * Builds the base OpenType font (outlines, cmap, metrics) from glyph drawings.
 *
 * This runs inside the font Web Worker (workers/fontWorker.ts). It is a real module with real
 * imports so that it survives minification; previously it was serialised into the worker with
 * Function.prototype.toString(), which broke in production builds because the minified bodies
 * referenced mangled identifiers that did not exist inside the worker.
 */
import { AppSettings, Character, CharacterSet, FontMetrics, GlyphData, Path, Point, Segment } from '../types';
import { VEC } from '../utils/vectorUtils';
import { curveToPolyline, quadraticCurveToPolyline, getStrokeOutlinePoints, generateCap } from '../utils/strokeExpansion';
// Not '../constants': that is a .tsx module, which breaks inside the worker in dev (see canvasConstants.ts).
import { DRAWING_CANVAS_SIZE } from '../canvasConstants';
import { isGlyphDrawn, getGlyphExportNameByUnicode } from '../utils/glyphUtils';
import opentype from 'opentype.js';
import paper from 'paper';

export type ShouldExportEmpty = (unicode: number, name?: string) => boolean;

/**
 * Converts a paper.js Path or CompoundPath into opentype.js path commands.
 * It handles both straight line segments and cubic Bézier curves.
 * It also correctly processes children of a CompoundPath, respecting their winding order for solids and holes.
 * @param paperPathItem The paper.js Path or CompoundPath object.
 * @param otPath The opentype.js Path object to which commands will be added.
 */
const convertPaperPathToOpenType = (paperPathItem: any, otPath: any) => {
    const processPath = (p: any) => {
        if (!p.segments || p.segments.length === 0) return;
        
        otPath.moveTo(p.segments[0].point.x, p.segments[0].point.y);
        
        const pathSegments = p.closed ? [...p.segments, p.segments[0]] : p.segments;

        for (let i = 1; i < pathSegments.length; i++) {
            const prevSegment = pathSegments[i - 1];
            const segment = pathSegments[i];
            
            const isStraight = prevSegment.handleOut.isZero() && segment.handleIn.isZero();

            if (isStraight) {
                otPath.lineTo(segment.point.x, segment.point.y);
            } else {
                const handle1 = prevSegment.point.add(prevSegment.handleOut);
                const handle2 = segment.point.add(segment.handleIn);
                otPath.curveTo(handle1.x, handle1.y, handle2.x, handle2.y, segment.point.x, segment.point.y);
            }
        }

        if (p.closed) {
            otPath.closePath();
        }
    };

    if (paperPathItem.children) { // It's a CompoundPath
        paperPathItem.children.forEach((child: any) => {
            processPath(child);
        });
    } else { // It's a Path
        processPath(paperPathItem);
    }
};



export const createFont = (
    glyphData: Map<number, GlyphData>, 
    settings: AppSettings, 
    t: (key: string, replacements?: { [key: string]: string | number }) => string,
    fontRules: any,
    metrics: FontMetrics,
    characterSets: CharacterSet[],
    isEditMode?: boolean,
    // Whether an undrawn glyph should still be exported (whitespace/format characters).
    // Precomputed on the main thread, which has the Unicode property data.
    shouldExportEmpty: ShouldExportEmpty = () => false
): any => {
    if (typeof opentype === 'undefined') {
        throw new Error(t('errorOpentypeNotLoaded'));
    }

    if (!fontRules) {
        throw new Error(t("errorFontGeneration", { error: "Font rules not loaded" }));
    }

    const allCharactersMap = new Map<number, Character>();
    characterSets.forEach(set => {
        set.characters.forEach(char => {
            if(char.unicode !== undefined) allCharactersMap.set(char.unicode, char);
        });
    });

    const finalGlyphData = new Map(glyphData); // Mutable copy

    const glyphs = [];

    // 1. .notdef glyph (required) - A "tofu" rectangle outline.
    const notdefPath = new opentype.Path();
    const notdefAdvanceWidth = metrics.defaultAdvanceWidth;
    const margin = 50;
    // Use a stroke that's proportional to the font size but at least 20 units.
    const strokeWidth = Math.max(20, Math.round(notdefAdvanceWidth / 25));

    // Outer rectangle (clockwise winding)
    notdefPath.moveTo(margin, metrics.descender);
    notdefPath.lineTo(notdefAdvanceWidth - margin, metrics.descender);
    notdefPath.lineTo(notdefAdvanceWidth - margin, metrics.ascender);
    notdefPath.lineTo(margin, metrics.ascender);
    notdefPath.closePath();
    
    // Inner rectangle (counter-clockwise winding to create a hole)
    notdefPath.moveTo(margin + strokeWidth, metrics.ascender - strokeWidth);
    notdefPath.lineTo(notdefAdvanceWidth - margin - strokeWidth, metrics.ascender - strokeWidth);
    notdefPath.lineTo(notdefAdvanceWidth - margin - strokeWidth, metrics.descender + strokeWidth);
    notdefPath.lineTo(margin + strokeWidth, metrics.descender + strokeWidth);
    notdefPath.closePath();
    
    glyphs.push(new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: notdefAdvanceWidth,
      path: notdefPath,
    }));
    
    // 2. Ensure essential glyphs (whitespace, format characters like ZWJ, ZWNJ) exist in the export data, even if empty.
    allCharactersMap.forEach((char, unicode) => {
        if (!finalGlyphData.has(unicode)) {
            if (shouldExportEmpty(unicode, char.name) || isEditMode) {
                finalGlyphData.set(unicode, { paths: [] });
            }
        }
    });

    // Also ensure the absolute minimums (Space, ZWJ, ZWNJ) are present even if not in character set
    [32, 8205, 8204].forEach(u => {
        if (!finalGlyphData.has(u)) {
            finalGlyphData.set(u, { paths: [] });
        }
    });
    
    const FONT_HEIGHT = metrics.ascender - metrics.descender;
    const scale = FONT_HEIGHT / DRAWING_CANVAS_SIZE;

    // Create a single paper.js scope to be reused for all glyphs in this font.
    const paperScope = new paper.PaperScope();
    paperScope.setup(new paperScope.Size(1, 1)); 

    // 3. Iterate through all potential glyphs.
    finalGlyphData.forEach((data, unicode) => {
      const drawn = isGlyphDrawn(data);
      
      const char = allCharactersMap.get(unicode);
      if (!drawn && !shouldExportEmpty(unicode, char?.name) && !isEditMode) {
          return;
      }

      const finalOtPath = new opentype.Path();
      const scaledThickness = settings.strokeThickness * scale;
      const contrast = settings.contrast !== undefined ? settings.contrast : 1.0;

      if (drawn) {
          // Clear the project before processing a new glyph to prevent state leakage.
          paperScope.project.clear();
          const paperPaths: any[] = []; // paper.Path[]

          data.paths.forEach((strokePath: Path) => {
            if (strokePath.type === 'outline' && strokePath.segmentGroups) {
                const transformPoint = (p: Point) => ({
                    x: p.x * scale,
                    y: ((DRAWING_CANVAS_SIZE - p.y) * scale) + metrics.descender
                });
                
                if (strokePath.segmentGroups.length > 1) {
                    const paperCompoundPath = new paperScope.CompoundPath();
                    strokePath.segmentGroups.forEach((segmentGroup: Segment[]) => {
                        const transformedSegments = segmentGroup.map(seg => {
                            const newSegPoint = transformPoint(seg.point);
                            const newHandleIn = { x: seg.handleIn.x * scale, y: -seg.handleIn.y * scale };
                            const newHandleOut = { x: seg.handleOut.x * scale, y: -seg.handleOut.y * scale };
                            return new paperScope.Segment(
                                new paperScope.Point(newSegPoint.x, newSegPoint.y),
                                new paperScope.Point(newHandleIn.x, newHandleIn.y),
                                new paperScope.Point(newHandleOut.x, newHandleOut.y)
                            );
                        });
                        const subPath = new paperScope.Path({ segments: transformedSegments, closed: true });
                        paperCompoundPath.addChild(subPath);
                    });
                    paperPaths.push(paperCompoundPath);
                } else if (strokePath.segmentGroups.length === 1) {
                    const transformedSegments = strokePath.segmentGroups[0].map(seg => {
                        const newSegPoint = transformPoint(seg.point);
                        const newHandleIn = { x: seg.handleIn.x * scale, y: -seg.handleIn.y * scale };
                        const newHandleOut = { x: seg.handleOut.x * scale, y: -seg.handleOut.y * scale };
                        return new paperScope.Segment(
                            new paperScope.Point(newSegPoint.x, newSegPoint.y),
                            new paperScope.Point(newHandleIn.x, newHandleIn.y),
                            new paperScope.Point(newHandleOut.x, newHandleOut.y)
                        );
                    });
                    const paperOutlinePath = new paperScope.Path({ segments: transformedSegments, closed: true });
                    paperPaths.push(paperOutlinePath);
                }
                return;
            }

            if (strokePath.type === 'dot') {
                const strokePoints = strokePath.points;
                if (strokePoints.length === 0) return;

                const centerPoint = strokePoints[0];
                const radius = strokePoints.length > 1 
                    ? VEC.len(VEC.sub(strokePoints[1], strokePoints[0])) 
                    : (settings.strokeThickness / 2);

                if (radius <= 0) return;

                const transformedCenter = {
                    x: centerPoint.x * scale,
                    y: ((DRAWING_CANVAS_SIZE - centerPoint.y) * scale) + metrics.descender
                };
                
                const scaledRadius = radius * scale;
                const paperDot = new paperScope.Path.Circle({
                    center: [transformedCenter.x, transformedCenter.y],
                    radius: scaledRadius
                });
                paperPaths.push(paperDot);
                return;
            }
            
            const transformedStroke = strokePath.points.map(p => ({
                x: p.x * scale,
                y: ((DRAWING_CANVAS_SIZE - p.y) * scale) + metrics.descender
            }));

            // If contrast < 1.0 or calligraphy, use outline expansion
            if (strokePath.type === 'calligraphy' || (contrast < 1.0 && ['pen', 'line', 'curve', 'circle', 'ellipse'].includes(strokePath.type))) {
                const angle = strokePath.type === 'calligraphy' ? strokePath.angle : undefined;
                // Calligraphy uses its own implicit high contrast if not specified, but generally depends on dot product.
                // getStrokeOutlinePoints handles this logic.
                
                // Note: getStrokeOutlinePoints returns points. We need to convert them to Paper.js path.
                const { outline1, outline2 } = getStrokeOutlinePoints(transformedStroke, scaledThickness, contrast, angle);
                
                if (outline1.length > 0) {
                     const outlinePoints = [...outline1, ...outline2.reverse()];
                     const paperStrokePath = new paperScope.Path({
                         segments: outlinePoints.map(p => [p.x, p.y]),
                         closed: true,
                     });
                     paperPaths.push(paperStrokePath);
                }
            } else {
                // Standard Monoline Expansion (Polyline to Outline)
                // This is the fallback logic for contrast = 1.0
                let polylineToOutline: Point[];
                if (strokePath.type === 'curve') {
                     polylineToOutline = quadraticCurveToPolyline(transformedStroke);
                } else if (strokePath.type === 'pen') {
                     polylineToOutline = curveToPolyline(transformedStroke);
                } else {
                     polylineToOutline = transformedStroke;
                }

                if (polylineToOutline.length < 2) return;

                // --- Robustness: Sanitize polyline to remove duplicate points ---
                const sanitizedPolyline: Point[] = [polylineToOutline[0]];
                for (let i = 1; i < polylineToOutline.length; i++) {
                    if (VEC.len(VEC.sub(polylineToOutline[i], sanitizedPolyline[sanitizedPolyline.length - 1])) > 1e-4) {
                        sanitizedPolyline.push(polylineToOutline[i]);
                    }
                }
                if (sanitizedPolyline.length < 2) return;

                const outline1: Point[] = [];
                const outline2: Point[] = [];

                for (let i = 0; i < sanitizedPolyline.length; i++) {
                    const p_curr = sanitizedPolyline[i];
                    const p_prev = sanitizedPolyline[i - 1];
                    const p_next = sanitizedPolyline[i + 1];
                    
                    let normal: Point;
                    if (!p_prev) { // Start point
                        const dir = VEC.normalize(VEC.sub(p_next, p_curr));
                        normal = VEC.perp(dir);
                    } else if (!p_next) { // End point
                        const dir = VEC.normalize(VEC.sub(p_curr, p_prev));
                        normal = VEC.perp(dir);
                    } else { // Miter join
                        const dir1 = VEC.normalize(VEC.sub(p_curr, p_prev));
                        const n1 = VEC.perp(dir1);
                        const dir2 = VEC.normalize(VEC.sub(p_next, p_curr));
                        const n2 = VEC.perp(dir2);
                        let miterVec = VEC.normalize(VEC.add(n1, n2));
                        const dotProduct = VEC.dot(miterVec, n1);
                        if (Math.abs(dotProduct) < 1e-6) {
                            normal = n1;
                        } else {
                            let miterLen = 1 / dotProduct;
                            if (miterLen > 5) miterLen = 5; // Miter limit
                            normal = VEC.scale(miterVec, miterLen);
                        }
                    }
                    
                    outline1.push(VEC.add(p_curr, VEC.scale(normal, scaledThickness / 2)));
                    outline2.push(VEC.add(p_curr, VEC.scale(normal, -scaledThickness / 2)));
                }

                if (outline1.length > 0) {
                     // --- IMPLEMENT ROUND CAPS ---
                     const radius = scaledThickness / 2;
                     
                     // Start Cap: Connects outline2[0] to outline1[0]
                     // We calculate the normal of the very first segment for a clean cap
                     const startDir = VEC.normalize(VEC.sub(sanitizedPolyline[1], sanitizedPolyline[0]));
                     const startNormal = VEC.perp(startDir);
                     
                     // generateCap returns points for an arc from -startNormal to startNormal (relative to center)
                     const startCap = generateCap(sanitizedPolyline[0], radius, VEC.scale(startNormal, -1), startNormal, 8);
                     
                     // End Cap: Connects outline1[last] to outline2[last]
                     const endDir = VEC.normalize(VEC.sub(sanitizedPolyline[sanitizedPolyline.length - 1], sanitizedPolyline[sanitizedPolyline.length - 2]));
                     const endNormal = VEC.perp(endDir);
                     
                     const endCap = generateCap(sanitizedPolyline[sanitizedPolyline.length - 1], radius, endNormal, VEC.scale(endNormal, -1), 8);
                     
                     const outlinePoints = [...outline1, ...endCap, ...outline2.reverse(), ...startCap];

                     const paperStrokePath = new paperScope.Path({
                         segments: outlinePoints.map(p => [p.x, p.y]),
                         closed: true,
                     });
                     paperPaths.push(paperStrokePath);
                }
            }
          });

          if (paperPaths.length > 0) {
              // Start with an empty path. This is crucial for correctly resolving self-intersections
              // on the very first stroke path, as uniting with an empty path forces resolution.
              let combinedPath = new paperScope.Path(); 
              for (const strokePath of paperPaths) {
                  combinedPath = combinedPath.unite(strokePath);
              }
              convertPaperPathToOpenType(combinedPath, finalOtPath);
          }
      }

      let advanceWidth = metrics.defaultAdvanceWidth;
      if (unicode === 32) { // Space character
          advanceWidth = metrics.spaceAdvanceWidth;
      } else if (unicode === 8205 || unicode === 8204) { // ZWJ and ZWNJ must have 0 advance width.
          advanceWidth = 0;
      } else if (drawn) {
          const bbox = finalOtPath.getBoundingBox();
          if (bbox && isFinite(bbox.x1) && isFinite(bbox.x2)) {
              const charDef = allCharactersMap.get(unicode);
              
              if (charDef?.glyphClass === 'mark' && (charDef.advWidth === 0 || charDef.advWidth === '0')) {
                  // This is a non-spacing mark. Its advance width must be 0.
                  // We shift the glyph so its left edge is at x=0.
                  const shiftX = -bbox.x1;
                  if (isFinite(shiftX)) {
                      for (const cmd of finalOtPath.commands) {
                          if (cmd.x !== undefined) cmd.x += shiftX;
                          if (cmd.x1 !== undefined) cmd.x1 += shiftX;
                          if (cmd.x2 !== undefined) cmd.x2 += shiftX;
                      }
                  }
                  // And we force the advance width to 0. The font library will calculate
                  // the correct negative RSB based on this.
                  advanceWidth = 0;
              } else {
                  // This is a base glyph or a spacing mark with width.
                  // Side bearings are authored and previewed in canvas units (like the outlines),
                  // so convert them with the same scale as the outlines. Otherwise spacing in the
                  // exported font is smaller than in the editor whenever ascender - descender != 1000.
                  const LSB = (charDef?.lsb ?? metrics.defaultLSB) * scale;
                  const RSB = (charDef?.rsb ?? metrics.defaultRSB) * scale;

                  // Shift the path horizontally to enforce the Left Side Bearing.
                  const shiftX = LSB - bbox.x1;
                  if (isFinite(shiftX)) {
                      for (const cmd of finalOtPath.commands) {
                          if (cmd.x !== undefined) cmd.x += shiftX;
                          if (cmd.x1 !== undefined) cmd.x1 += shiftX;
                          if (cmd.x2 !== undefined) cmd.x2 += shiftX;
                      }
                  }
                  
                  // Recalculate bbox to get the new rightmost edge after the shift.
                  const newBbox = finalOtPath.getBoundingBox();
                  
                  // Calculate advance width using the new right edge and Right Side Bearing.
                  advanceWidth = Math.round(newBbox.x2 + RSB);
              }
          }
      }

      const glyphName = (isEditMode && char?.originalName) 
          ? char.originalName 
          : getGlyphExportNameByUnicode(unicode);

      const glyph = new opentype.Glyph({
        name: glyphName,
        unicode: unicode,
        advanceWidth: advanceWidth,
        path: finalOtPath,
      });
      glyphs.push(glyph);
    });

    const drawableGlyphs = glyphs.filter(g => g.unicode !== 0 && g.unicode !== 32 && g.path.commands.length > 0);
    if (drawableGlyphs.length === 0) {
        throw new Error(t("errorNoGlyphs"));
    }

    const font = new opentype.Font({
      familyName: settings.fontName,
      styleName: metrics.styleName,
      unitsPerEm: metrics.unitsPerEm,
      ascender: metrics.ascender,
      descender: metrics.descender,
      glyphs: glyphs,
      designer: settings.designer,
      designerURL: settings.designerURL,
      manufacturer: settings.manufacturer,
      manufacturerURL: settings.vendorURL, // Mapped from vendorURL
      license: settings.licenseDescription, // Mapped
      licenseURL: settings.licenseInfoURL, // Mapped
      description: settings.description
    });
    
    return font;
};
