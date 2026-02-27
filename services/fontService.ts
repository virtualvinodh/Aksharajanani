

import { AppSettings, Character, CharacterSet, FontMetrics, GlyphData, Point, Path, KerningMap, MarkPositioningMap, PositioningRules, MarkAttachmentRules, Segment } from '../types';
import { compileFeaturesAndPatch } from './pythonFontService';
import { generateFea } from './feaService';
import { VEC } from '../utils/vectorUtils';
import { curveToPolyline, quadraticCurveToPolyline, getAccurateGlyphBBox, BoundingBox, getStrokeOutlinePoints } from './glyphRenderService';
import { calculateDefaultMarkOffset } from './positioningHeuristicsService';
import { DRAWING_CANVAS_SIZE } from '../constants';
import { isGlyphDrawn, getGlyphExportNameByUnicode, shouldExportEmpty } from '../utils/glyphUtils';
import { expandMembers } from './groupExpansionService';
import { deepClone } from '../utils/cloneUtils';

// opentype.js is loaded from a CDN in index.html and will be available on the window object.
// This declaration informs TypeScript about the global 'opentype' variable.
declare var opentype: any;
// paper.js is also loaded from CDN.
declare var paper: any;


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

/**
 * Generates points for a round cap (semicircle) at the end of a stroke.
 * Rotates the startNormal vector clockwise by 180 degrees in steps.
 */
const generateCap = (center: Point, radius: number, startNormal: Point, endNormal: Point, steps: number = 8): Point[] => {
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

const createFont = (
    glyphData: Map<number, GlyphData>, 
    settings: AppSettings, 
    t: (key: string, replacements?: { [key: string]: string | number }) => string,
    fontRules: any,
    metrics: FontMetrics,
    characterSets: CharacterSet[]
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
            if (shouldExportEmpty(unicode)) {
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
      
      if (!drawn && !shouldExportEmpty(unicode)) {
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
                  const LSB = charDef?.lsb ?? metrics.defaultLSB;
                  const RSB = charDef?.rsb ?? metrics.defaultRSB;

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

      const glyphName = getGlyphExportNameByUnicode(unicode);

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
      description: settings.description,
    });
    
    return font;
};

export const exportToOtf = async (
    glyphData: Map<number, GlyphData>,
    settings: AppSettings,
    t: (key: string, replacements?: { [key: string]: string | number }) => string,
    fontRules: any,
    metrics: FontMetrics,
    characterSets: CharacterSet[],
    kerningMap: KerningMap,
    markPositioningMap: MarkPositioningMap,
    allCharsByUnicode: Map<number, Character>,
    positioningRules: PositioningRules[] | null,
    markAttachmentRules: MarkAttachmentRules | null,
    isFeaEditMode: boolean | undefined,
    manualFeaCode: string | null | undefined,
    showNotification: (message: string, type?: 'success' | 'info') => void
): Promise<{ blob: Blob, feaError: string | null }> => {
    
    const finalGlyphData = new Map(glyphData.entries());
    const allCharsByName = new Map<string, Character>();
    allCharsByUnicode.forEach(char => allCharsByName.set(char.name, char));
    
    const groups = fontRules?.groups || {};

    // Bake dynamic/implicit ligatures (GSUB) and kerned pairs before compiling font outlines
    allCharsByUnicode.forEach(char => {
        // Condition: Is a composite glyph that needs to be baked (not a GPOS rule) and has a unicode.
        if (char.position && char.glyphClass !== 'virtual' && char.unicode) {
            // Don't overwrite if it's already manually drawn.
            if (isGlyphDrawn(finalGlyphData.get(char.unicode))) {
                return;
            }
    
            const [baseName, markName] = char.position;
            const baseChar = allCharsByName.get(baseName);
            const markChar = allCharsByName.get(markName);
    
            if (!baseChar || !markChar || baseChar.unicode === undefined || markChar.unicode === undefined) return;
    
            const baseGlyphData = finalGlyphData.get(baseChar.unicode);
            const markGlyphData = finalGlyphData.get(markChar.unicode);
    
            if (!isGlyphDrawn(baseGlyphData) || !isGlyphDrawn(markGlyphData)) return;
    
            // --- Offset Priority Logic ---
            let offset: Point;
            const key = `${baseChar.unicode}-${markChar.unicode}`;
            
            // Priority 1: Check for manual override from the positioning map.
            const manualOffset = markPositioningMap.get(key);
            if (manualOffset) {
                offset = manualOffset;
            } else {
            // Priority 2: Fallback to default calculation.
                const baseBbox = getAccurateGlyphBBox(baseGlyphData!.paths, settings.strokeThickness);
                const markBbox = getAccurateGlyphBBox(markGlyphData!.paths, settings.strokeThickness);
                
                let movementConstraint: 'horizontal' | 'vertical' | 'none' = 'none';
                if (positioningRules) {
                     const rule = positioningRules.find(r => 
                        expandMembers(r.base, groups, characterSets).includes(baseName) && 
                        expandMembers(r.mark || [], groups, characterSets).includes(markName)
                    );
                    if (rule && (rule.movement === 'horizontal' || rule.movement === 'vertical')) {
                        movementConstraint = rule.movement;
                    }
                }
                
                offset = calculateDefaultMarkOffset(
                    baseChar, 
                    markChar, 
                    baseBbox, 
                    markBbox, 
                    markAttachmentRules, 
                    metrics, 
                    characterSets, 
                    false, 
                    groups,
                    movementConstraint
                );
            }
    
            // --- Bake Geometry ---
            const transformedMarkPaths = deepClone(markGlyphData!.paths).map((p: Path) => {
                p.points = p.points.map(pt => VEC.add(pt, offset));
                if (p.segmentGroups) {
                    p.segmentGroups.forEach(group => {
                        group.forEach(seg => {
                            seg.point = VEC.add(seg.point, offset);
                        });
                    });
                }
                return p;
            });
    
            const combinedPaths = [...deepClone(baseGlyphData!.paths), ...transformedMarkPaths];
            finalGlyphData.set(char.unicode, { paths: combinedPaths });
        } else if (char.kern && char.glyphClass !== 'virtual' && char.unicode) {
            // Don't overwrite if it's already manually drawn.
            if (isGlyphDrawn(finalGlyphData.get(char.unicode))) {
                return;
            }

            const [leftName, rightName] = char.kern;
            const leftChar = allCharsByName.get(leftName);
            const rightChar = allCharsByName.get(rightName);

            if (!leftChar || !rightChar || leftChar.unicode === undefined || rightChar.unicode === undefined) return;

            const leftGlyphData = finalGlyphData.get(leftChar.unicode);
            const rightGlyphData = finalGlyphData.get(rightChar.unicode);

            if (!isGlyphDrawn(leftGlyphData) || !isGlyphDrawn(rightGlyphData)) return;
            
            // --- Calculate Horizontal Shift ---
            const kernValue = kerningMap.get(`${leftChar.unicode}-${rightChar.unicode}`) ?? 0;
            
            const leftBbox = getAccurateGlyphBBox(leftGlyphData!.paths, settings.strokeThickness);
            const rightBbox = getAccurateGlyphBBox(rightGlyphData!.paths, settings.strokeThickness);

            if (!leftBbox || !rightBbox) return;

            const leftRsb = leftChar.rsb ?? metrics.defaultRSB;
            const rightLsb = rightChar.lsb ?? metrics.defaultLSB;
            
            const rightGlyphContentStartX = (leftBbox.x + leftBbox.width) + leftRsb + kernValue + rightLsb;
            const deltaX = rightGlyphContentStartX - rightBbox.x;

            // --- Bake Geometry ---
            const translatedRightPaths = deepClone(rightGlyphData!.paths).map((p: Path) => {
                const offset = { x: deltaX, y: 0 };
                p.points = p.points.map(pt => VEC.add(pt, offset));
                if (p.segmentGroups) {
                    p.segmentGroups.forEach(group => {
                        group.forEach(seg => {
                            seg.point = VEC.add(seg.point, offset);
                        });
                    });
                }
                return p;
            });
    
            const combinedPaths = [...deepClone(leftGlyphData!.paths), ...translatedRightPaths];
            finalGlyphData.set(char.unicode, { paths: combinedPaths });
        }
    });

    // Stage 1: Generate base font outlines in a non-blocking Web Worker.
    const fontBlob = await new Promise<Blob>((resolve, reject) => {
        // Define the worker script as a string. It must be self-contained.
        // All dependent functions (VEC, createFont, etc.) are embedded here.
        const VEC_DEFINITION_STRING_FOR_WORKER = `const VEC = {
            add: (p1, p2) => ({ x: p1.x + p2.x, y: p1.y + p2.y }),
            sub: (p1, p2) => ({ x: p1.x - p2.x, y: p1.y - p2.y }),
            scale: (p, s) => ({ x: p.x * s, y: p.y * s }),
            len: (p) => Math.sqrt(p.x * p.x + p.y * p.y),
            normalize: (p) => {
                const l = VEC.len(p);
                return l > 1e-6 ? VEC.scale(p, 1 / l) : { x: 0, y: 0 };
            },
            perp: (p) => ({ x: -p.y, y: p.x }),
            dot: (p1, p2) => p1.x * p2.x + p1.y * p2.y,
            rotate: (p, angle) => ({
                x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
                y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
            }),
        };`;
        
        // Polyline functions need to be self-contained within the worker as well.
        const quadraticCurveToPolylineForWorker = `const quadraticCurveToPolyline = (points, density = 10) => {
            if (points.length !== 3) return points;
            const [p0, p1, p2] = points;
            const polyline = [p0];
            const quadraticPoint = (t, p0, p1, p2) => {
                const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
                const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
                return { x, y };
            };
            for (let j = 1; j <= density; j++) {
                polyline.push(quadraticPoint(j / density, p0, p1, p2));
            }
            return polyline;
        };`;

        const curveToPolylineForWorker = `const curveToPolyline = (points, density = 15) => {
            if (points.length < 3) return points;
            const polyline = [points[0]];
            const quadraticPoint = (t, p0, p1, p2) => {
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
        };`;
        
        // Helper function for creating round caps in the worker
        const generateCapForWorker = `const generateCap = (center, radius, startNormal, endNormal, steps = 8) => {
             const points = [];
             for (let i = 1; i < steps; i++) {
                 const t = i / steps;
                 // Rotate -180 degrees (clockwise) to create the cap
                 const angle = -Math.PI * t; 
                 const vec = VEC.rotate(startNormal, angle);
                 points.push(VEC.add(center, VEC.scale(vec, radius)));
             }
             return points;
        };`;

        // Need to inline the outline expansion logic for the worker
        // UPDATED: Includes start/end tangent stabilization logic
        const getStrokeOutlinePointsForWorker = `
        const getStrokeOutlinePoints = (points, thickness, contrast = 1.0, angle) => {
             const polyline = curveToPolyline(points, 15);
             if (polyline.length < 2) return { outline1: [], outline2: [] };
             
             const outline1 = [];
             const outline2 = [];
             
             const nibAngleRad = angle !== undefined ? (angle * Math.PI / 180) : (90 * Math.PI / 180);
             const perpToNib = { x: -Math.sin(nibAngleRad), y: Math.cos(nibAngleRad) }; 
             
             // Smoothing window size for terminals
             const TERMINAL_SMOOTHING_WINDOW = 4;

             for (let i = 0; i < polyline.length; i++) {
                const p_curr = polyline[i];
                const p_prev = polyline[i - 1];
                const p_next = polyline[i + 1];
                let normal;
                let dir;

                if (!p_prev) {
                    // --- START POINT STABILIZATION ---
                    const lookAheadIndex = Math.min(polyline.length - 1, i + TERMINAL_SMOOTHING_WINDOW);
                    const p_lookAhead = polyline[lookAheadIndex];
                    dir = VEC.normalize(VEC.sub(p_lookAhead, p_curr));
                    
                    if (Math.abs(dir.x) < 1e-5 && Math.abs(dir.y) < 1e-5 && p_next) {
                        dir = VEC.normalize(VEC.sub(p_next, p_curr));
                    }
                    normal = VEC.perp(dir);
                } else if (!p_next) {
                    // --- END POINT STABILIZATION ---
                    const lookBehindIndex = Math.max(0, i - TERMINAL_SMOOTHING_WINDOW);
                    const p_lookBehind = polyline[lookBehindIndex];
                    dir = VEC.normalize(VEC.sub(p_curr, p_lookBehind));
                    
                    if (Math.abs(dir.x) < 1e-5 && Math.abs(dir.y) < 1e-5 && p_prev) {
                        dir = VEC.normalize(VEC.sub(p_curr, p_prev));
                    }
                    normal = VEC.perp(dir);
                } else {
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
                    if (miterLen > 5) { miterLen = 5; } 
                    normal = VEC.scale(miterVec, miterLen);
                  }
                  dir = VEC.normalize(VEC.add(dir1, dir2));
                }

                let thicknessAtPoint = thickness;
                
                if (angle !== undefined) {
                     thicknessAtPoint = thickness * Math.max(0.1, Math.abs(VEC.dot(dir, perpToNib))); 
                } else if (contrast < 1.0) {
                    const unitNormal = VEC.normalize(normal);
                    const verticalFactor = Math.abs(unitNormal.x); 
                    const minThickness = thickness * contrast;
                    thicknessAtPoint = minThickness + (thickness - minThickness) * verticalFactor;
                }
                
                outline1.push(VEC.add(p_curr, VEC.scale(normal, thicknessAtPoint / 2)));
                outline2.push(VEC.add(p_curr, VEC.scale(normal, -thicknessAtPoint / 2)));
             }
             return { outline1, outline2 };
        };
        `;

        const getAccurateGlyphBBoxForWorker = `const getAccurateGlyphBBox = (paths, strokeThickness) => {
            paperScope.project.clear(); // Use the worker-global scope and clear it.
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            let hasContent = false;
        
            paths.forEach(path => {
                if (path.type === 'outline' && path.segmentGroups) {
                    hasContent = true;
                    let paperItem;
                    const createPaperPath = (segments) => new paperScope.Path({ 
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
                    let pointsToTest;
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
        
            if (!hasContent) return null;
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        };`;

        const isGlyphDrawnForWorker = `const isGlyphDrawn = (glyphData) => {
            if (!glyphData || !glyphData.paths || glyphData.paths.length === 0) {
                return false;
            }
            return glyphData.paths.some(
                p => (p.points?.length || 0) > 0 || (p.segmentGroups?.length || 0) > 0
            );
        };`;

        const getGlyphExportNameByUnicodeForWorker = `const getGlyphExportNameByUnicode = (unicode) => {
            if (unicode === 32) return 'space';
            const hex = unicode.toString(16).toUpperCase();
            if (unicode < 0x10000) {
                return 'uni' + hex.padStart(4, '0');
            } else {
                return 'u' + hex;
            }
        };`;

        const workerCode = `
            // Load opentype.js and paper.js libraries inside the worker
            importScripts('https://unpkg.com/opentype.js/dist/opentype.js', 'https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.17/paper-full.min.js');

            // --- DEPENDENCIES FOR createFont ---
            // These functions are copied directly from the main fontService.ts file.
            
            // Create a single, persistent PaperScope for the entire worker's lifecycle.
            const paperScope = new paper.PaperScope();
            paperScope.setup(new paper.Size(1, 1));

            ${VEC_DEFINITION_STRING_FOR_WORKER}
            ${generateCapForWorker} 
            ${quadraticCurveToPolylineForWorker}
            ${curveToPolylineForWorker}
            ${getStrokeOutlinePointsForWorker}
            ${getAccurateGlyphBBoxForWorker}
            ${isGlyphDrawnForWorker}
            ${getGlyphExportNameByUnicodeForWorker}
            const convertPaperPathToOpenType = ${convertPaperPathToOpenType.toString()};
            const DRAWING_CANVAS_SIZE = ${DRAWING_CANVAS_SIZE};

            // --- Main createFont function (embedded) ---
            const createFont = ${createFont.toString()};

            // --- Worker Message Handler ---
            self.onmessage = (e) => {
                try {
                    const { glyphDataArray, settings, fontRules, metrics, characterSets } = e.data;
                    const glyphData = new Map(glyphDataArray);

                    // Minimal 't' function for error messages inside the worker
                    const t = (key) => key;
                    
                    const fontObject = createFont(glyphData, settings, t, fontRules, metrics, characterSets);
                    const fontBuffer = fontObject.toArrayBuffer();

                    // Post the buffer back as a transferable object for efficiency
                    self.postMessage({ success: true, fontBuffer }, [fontBuffer]);
                } catch (error) {
                    // If an error occurs, post it back to the main thread
                    self.postMessage({ success: false, error: error.message });
                } finally {
                    // Close the worker to free up resources
                    self.close();
                }
            };
        `;
        
        const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        const worker = new Worker(workerUrl);
        
        worker.onmessage = e => {
            URL.revokeObjectURL(workerUrl);
            if (e.data.success) {
                resolve(new Blob([e.data.fontBuffer], { type: 'font/opentype' }));
            } else {
                reject(new Error(e.data.error));
            }
        };
        
        worker.onerror = e => {
            URL.revokeObjectURL(workerUrl);
            reject(new Error(`Worker error: ${e.message}`));
        };

        worker.postMessage({
            glyphDataArray: Array.from(finalGlyphData.entries()),
            settings,
            fontRules,
            metrics,
            characterSets
        });
    });
    
    // Stage 2: Generate the full FEA code
    const feaContent = isFeaEditMode 
        ? manualFeaCode || '' 
        : generateFea(
            fontRules, 
            kerningMap, 
            markPositioningMap, 
            allCharsByUnicode, 
            settings.fontName, 
            positioningRules, 
            finalGlyphData, 
            metrics, 
            characterSets, 
            markAttachmentRules,
            settings.strokeThickness
        );

    // Stage 3: Use Pyodide to compile the FEA and patch the font
    const { blob: patchedBlob, feaError } = await compileFeaturesAndPatch(fontBlob, feaContent, showNotification, t);
    
    return { blob: patchedBlob, feaError };
};