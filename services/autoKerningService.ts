
import { GlyphData, FontMetrics, Character } from '../types';

// Define the worker script as a string
const workerCode = `
importScripts('https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.17/paper-full.min.js');

// --- Math & Geometry Helpers (Inlined for Worker) ---
const VEC = {
  add: (p1, p2) => ({ x: p1.x + p2.x, y: p1.y + p2.y }),
  sub: (p1, p2) => ({ x: p1.x - p2.x, y: p1.y - p2.y }),
  scale: (p, s) => ({ x: p.x * s, y: p.y * s }),
  len: (p) => Math.sqrt(p.x * p.x + p.y * p.y),
  normalize: (p) => {
    const l = Math.sqrt(p.x * p.x + p.y * p.y);
    return l > 1e-6 ? { x: p.x / l, y: p.y / l } : { x: 0, y: 0 };
  },
  perp: (p) => ({ x: -p.y, y: p.x }),
  dot: (p1, p2) => p1.x * p2.x + p1.y * p2.y,
};

const curveToPolyline = (points, density = 10) => {
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
};

const quadraticCurveToPolyline = (points, density = 10) => {
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
};

// Initialize Paper.js scope
const paperScope = new paper.PaperScope();
paperScope.setup(new paper.Size(1, 1));

const getAccurateGlyphBBox = (paths, strokeThickness) => {
    paperScope.project.clear();
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
};

const getGlyphSubBBoxes = (glyphData, baselineY, toplineY, strokeThickness) => {
    const fullBBox = getAccurateGlyphBBox(glyphData.paths, strokeThickness);
    if (!fullBBox) return null;
    const fullBBoxAsBBox = { minX: fullBBox.x, maxX: fullBBox.x + fullBBox.width, minY: fullBBox.y, maxY: fullBBox.y + fullBBox.height };

    let ascenderRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let xHeightRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let descenderRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

    const expandBox = (box, p) => {
        box.minX = Math.min(box.minX, p.x);
        box.maxX = Math.max(box.maxX, p.x);
        box.minY = Math.min(box.minY, p.y);
        box.maxY = Math.max(box.maxY, p.y);
    };
    
    const tolerance = strokeThickness / 2;
    paperScope.project.clear();

    glyphData.paths.forEach(path => {
        let pointsToCategorize = [];
        if (path.type === 'outline' && path.segmentGroups) {
             path.segmentGroups.forEach(group => {
                if (group.length > 0) {
                    const paperPath = new paperScope.Path({
                        segments: group.map(seg => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y))),
                        closed: true
                    });
                    paperPath.flatten(2);
                    paperPath.segments.forEach((seg) => pointsToCategorize.push({ x: seg.point.x, y: seg.point.y }));
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
    const adjustBox = (box) => {
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

const doBBoxesCollide = (boxA, boxB) => {
    if (!boxA || !boxB) return false;
    return !(
        boxA.maxX < boxB.minX ||
        boxA.minX > boxB.maxX ||
        boxA.maxY < boxB.minY ||
        boxA.minY > boxB.maxY
    );
};

// --- Main Calculation ---
self.onmessage = (e) => {
    const { batchId, pairs, glyphDataMap, metrics, strokeThickness } = e.data;
    const results = {}; // Map<string, number> as obj

    pairs.forEach(pair => {
        const { leftId, rightId, targetDistance, leftRsb, rightLsb } = pair;
        const leftGlyph = glyphDataMap[leftId];
        const rightGlyph = glyphDataMap[rightId];

        if (!leftGlyph || !rightGlyph) return;

        const leftBoxes = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rightBoxes = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);

        if (!leftBoxes || !rightBoxes || !leftBoxes.full || !rightBoxes.full) return;
        
        // Binary Search
        let low = -Math.round(metrics.unitsPerEm / 2); 
        let high = 0; 
        let bestK = 0; 
        
        // Fallback or explicit target distance
        const effectiveTarget = targetDistance !== null ? targetDistance : (leftRsb + rightLsb);

        while (low <= high) {
            const kMid = Math.floor((low + high) / 2);
            
            // X position of right glyph in the test configuration
            const rightStartX = leftBoxes.full.maxX + leftRsb + rightLsb + kMid;
            const deltaX = rightStartX - rightBoxes.full.minX;
            
            // Translate right boxes
            const rBoxAscenderT = rightBoxes.ascender ? { ...rightBoxes.ascender, minX: rightBoxes.ascender.minX + deltaX, maxX: rightBoxes.ascender.maxX + deltaX } : null;
            const rBoxXHeightT = rightBoxes.xHeight ? { ...rightBoxes.xHeight, minX: rightBoxes.xHeight.minX + deltaX, maxX: rightBoxes.xHeight.maxX + deltaX } : null;
            const rBoxDescenderT = rightBoxes.descender ? { ...rightBoxes.descender, minX: rightBoxes.descender.minX + deltaX, maxX: rightBoxes.descender.maxX + deltaX } : null;

            let isInvalid = false;
            
            // Collision Check
            if (doBBoxesCollide(leftBoxes.ascender, rBoxAscenderT) || doBBoxesCollide(leftBoxes.descender, rBoxDescenderT)) {
                isInvalid = true;
            } else if (rBoxXHeightT && leftBoxes.xHeight) {
                const currentGap = rBoxXHeightT.minX - leftBoxes.xHeight.maxX;
                if (currentGap < effectiveTarget) {
                    isInvalid = true; 
                }
            } else {
                 const rBoxFullT = { ...rightBoxes.full, minX: rightBoxes.full.minX + deltaX, maxX: rightBoxes.full.maxX + deltaX };
                 if (doBBoxesCollide(leftBoxes.full, rBoxFullT)) {
                    isInvalid = true;
                }
            }

            if (isInvalid) {
                low = kMid + 1; // Too tight, need less negative
            } else {
                bestK = kMid;
                high = kMid - 1; // Try tighter
            }
        }
        
        if (bestK <= 0) {
             results[\`\${leftId}-\${rightId}\`] = bestK;
        }
    });
    
    self.postMessage({ batchId, results });
};
`;

let worker: Worker | null = null;
let workerUrl: string | null = null;

export const initAutoKernWorker = () => {
    if (worker) return worker;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);
    return worker;
};

export const terminateAutoKernWorker = () => {
    if (worker) {
        worker.terminate();
        worker = null;
    }
    if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
        workerUrl = null;
    }
};
