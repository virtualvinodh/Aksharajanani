
import { useState } from 'react';
import { Point, Path, Segment, PathType } from '../../types';
import { generateId, ToolHookProps } from './types';
import { paperScope } from '../../services/glyphRenderService';
import { deepClone } from '../../utils/cloneUtils';
import { VEC } from '../../utils/vectorUtils';
import { simplifyPath } from '../../utils/pathUtils';

declare var paper: any;

export const useSliceTool = ({
    isDrawing, setIsDrawing, currentPaths, onPathsChange, previewPath, setPreviewPath,
    settings
}: ToolHookProps) => {
    const [sliceStart, setSliceStart] = useState<Point | null>(null);

    const start = (point: Point) => {
        setIsDrawing(true);
        setSliceStart(point);
    };

    const move = (point: Point) => {
        if (!isDrawing || !sliceStart) return;
        setPreviewPath({
            id: 'slice-preview',
            type: 'line',
            points: [sliceStart, point]
        });
    };

    const end = (endPoint?: Point) => {
        if (!isDrawing || !sliceStart) return;
        const finalPoint = endPoint || (previewPath?.points[1]);
        if (finalPoint) {
            performSlice(sliceStart, finalPoint);
        }
        setIsDrawing(false);
        setSliceStart(null);
        setPreviewPath(null);
    };

    // Helper: Line Segment Intersection
    // Returns the intersection point if found, otherwise null
    const getSegmentIntersection = (p0: Point, p1: Point, p2: Point, p3: Point): Point | null => {
        const s1_x = p1.x - p0.x; const s1_y = p1.y - p0.y;
        const s2_x = p3.x - p2.x; const s2_y = p3.y - p2.y;
        const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
        const t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
            return { x: p0.x + (t * s1_x), y: p0.y + (t * s1_y) };
        }
        return null;
    };
    
    // Helper: Convert any path to a dense polyline of Points
    const getFlattenedPoints = (pathData: Path): { points: Point[], isClosed: boolean } => {
        paperScope.project.clear();
        let paperItem: any;

        if (pathData.type === 'outline' && pathData.segmentGroups) {
             // For outlines, we just use the first group for simplicity in slicing context, 
             // or flatten the whole compound path.
             // Complex slicing of compound paths is simplified here to just the main hull.
            const segments = pathData.segmentGroups[0];
            if (!segments) return { points: [], isClosed: false };
            paperItem = new paperScope.Path({
                segments: segments.map(s => [s.point.x, s.point.y]),
                closed: true
            });
        } else if (pathData.type === 'pen' || pathData.type === 'curve') {
             // Reconstruct smooth path
             if (pathData.points.length < 2) return { points: pathData.points, isClosed: false };
             paperItem = new paperScope.Path({ segments: pathData.points.map(p => [p.x, p.y]) });
             if (pathData.type === 'pen') paperItem.smooth();
        } else if (['circle', 'ellipse'].includes(pathData.type) && pathData.points.length >= 2) {
             // Reconstruct shape
             const start = pathData.points[0];
             const end = pathData.points[1]; // or radii logic
             // Simplified reconstruction for circle/ellipse from points (center + radius point usually)
             // But usually drawing tools store [center, handle] or similar.
             // Let's assume standard reconstruction:
             if (pathData.type === 'circle') {
                 const r = VEC.len(VEC.sub(start, end));
                 paperItem = new paperScope.Path.Circle(new paperScope.Point(start.x, start.y), r);
             } else {
                 // Ellipse usually stored as bounding box corners or center+radii. 
                 // Assuming DrawingTool logic: points=[center, corner]
                 const rx = Math.abs(start.x - end.x);
                 const ry = Math.abs(start.y - end.y);
                 paperItem = new paperScope.Path.Ellipse({ center: [start.x, start.y], radius: [rx, ry] });
             }
        } else {
             // Line, Dot
             return { points: pathData.points, isClosed: false };
        }
        
        if (!paperItem) return { points: [], isClosed: false };

        // Flatten to get dense points
        paperItem.flatten(2); // 2px tolerance for flattening
        const points = paperItem.segments.map((s: any) => ({ x: s.point.x, y: s.point.y }));
        const isClosed = paperItem.closed || (pathData.type === 'pen' && points.length > 2 && VEC.len(VEC.sub(points[0], points[points.length-1])) < 5);
        
        return { points, isClosed };
    };

    const performSlice = (p1: Point, p2: Point) => {
        let hasSplit = false;
        const newPaths: Path[] = [];
        
        // Tolerance for considering a cut valid (avoid tiny snippets)
        const MIN_SEGMENT_LENGTH = 5; 

        currentPaths.forEach(pathData => {
            // 1. Convert to dense points
            const { points, isClosed } = getFlattenedPoints(pathData);
            if (points.length < 2) {
                newPaths.push(pathData);
                return;
            }

            // 2. Find Intersections
            // We store intersections as { index, point }, where index is the index of the *start* point of the segment.
            const intersections: { index: number, point: Point }[] = [];

            for (let i = 0; i < points.length - 1; i++) {
                const segStart = points[i];
                const segEnd = points[i+1];
                const hit = getSegmentIntersection(segStart, segEnd, p1, p2);
                if (hit) {
                    intersections.push({ index: i, point: hit });
                }
            }
            
            // Check closing segment for closed shapes
            if (isClosed) {
                const segStart = points[points.length - 1];
                const segEnd = points[0];
                const hit = getSegmentIntersection(segStart, segEnd, p1, p2);
                if (hit) {
                    intersections.push({ index: points.length - 1, point: hit });
                }
            }

            // 3. Logic Check
            if (intersections.length === 0) {
                newPaths.push(pathData);
                return;
            }

            // For closed shapes, we need even number of cuts (usually 2) to split it.
            // If 1 cut on a circle, it just becomes an open 'C' shape (valid, but typically implies we missed a cut or it was a tangent).
            // Let's allow 1 cut on closed shape -> opens it. 2 cuts -> splits it.
            
            intersections.sort((a, b) => a.index - b.index);

            hasSplit = true;
            
            const createPathFromPoints = (pts: Point[]): Path | null => {
                if (pts.length < 2) return null;
                // Renormalize: Simplify the dense polyline back to a reasonable curve
                const simplified = simplifyPath(pts, 1.0); // 1.0 epsilon
                if (simplified.length < 2) return null;
                
                return {
                    id: generateId(),
                    type: 'pen',
                    points: simplified
                };
            };

            if (isClosed) {
                if (intersections.length === 1) {
                    // Open the loop at the intersection
                    // Path: Intersection -> End -> Start -> Intersection
                    const hit = intersections[0];
                    const idx = hit.index;
                    
                    // Segment 1: Hit -> End
                    // If idx is last point, then Hit -> End is just Hit. 
                    // But for closed loop, points[length-1] connects to points[0].
                    
                    const newPoly: Point[] = [];
                    newPoly.push(hit.point);
                    // Add points from idx+1 to end
                    for (let i = idx + 1; i < points.length; i++) newPoly.push(points[i]);
                    // Add points from 0 to idx
                    for (let i = 0; i <= idx; i++) newPoly.push(points[i]);
                    newPoly.push(hit.point);
                    
                    const path = createPathFromPoints(newPoly);
                    if (path) newPaths.push(path);
                    
                } else {
                    // Multiple cuts on closed loop.
                    // We treat the loop as linear: Start->End, but wrap around logic is tricky.
                    // Easier method: Rotate the array so it starts at the first intersection.
                    // Then it becomes an open line with cuts.
                    
                    const firstCut = intersections[0];
                    const remainingCuts = intersections.slice(1);
                    
                    // Rotate points to start at firstCut
                    const rotatedPoints: Point[] = [];
                    rotatedPoints.push(firstCut.point);
                    for (let i = firstCut.index + 1; i < points.length; i++) rotatedPoints.push(points[i]);
                    for (let i = 0; i <= firstCut.index; i++) rotatedPoints.push(points[i]);
                    rotatedPoints.push(firstCut.point); // Close it back to start
                    
                    // Now adjust remaining cuts indices relative to new start
                    // This is complex. 
                    // Alternative: Just split standard array, then glue first and last pieces?
                    
                    // Let's use the simpler "Split and Glue" method for closed loops.
                    // 1. Split at all indices.
                    // 2. The first segment (Start -> Cut1) and last segment (CutN -> End) should be joined.
                    
                    const segments: Point[][] = [];
                    let currentSeg: Point[] = [points[0]];
                    let lastIdx = 0;
                    
                    intersections.forEach(hit => {
                        // Add points up to hit
                        for(let i = lastIdx + 1; i <= hit.index; i++) currentSeg.push(points[i]);
                        currentSeg.push(hit.point);
                        segments.push(currentSeg);
                        
                        // Start new segment
                        currentSeg = [hit.point];
                        lastIdx = hit.index;
                    });
                    
                    // Add remaining
                    for(let i = lastIdx + 1; i < points.length; i++) currentSeg.push(points[i]);
                    // For closed loop original array didn't repeat start at end usually, 
                    // but if it did, we handle.
                    
                    // Now, because it was closed, the last segment connects back to the first segment.
                    // Merge Last Segment + First Segment
                    const firstSeg = segments[0];
                    const lastSeg = currentSeg;
                    
                    // Check if they are valid
                    if (firstSeg.length > 0 && lastSeg.length > 0) {
                        // Merge: LastSeg points + FirstSeg points (skipping duplicate join point if any)
                         // But wait, FirstSeg started at points[0]. LastSeg ended at points[end].
                         // points[end] connects to points[0].
                         const merged = [...lastSeg, ...firstSeg]; 
                         segments[0] = merged; // Replace first with merged
                         // Don't push lastSeg separately
                    } else {
                        segments.push(currentSeg);
                    }
                    
                    // Output all segments (except the first one is now the merged one)
                    segments.forEach(seg => {
                        const p = createPathFromPoints(seg);
                        if (p) newPaths.push(p);
                    });
                }
            } else {
                // Open Path Splitting
                // Simple: Start -> Cut1, Cut1 -> Cut2, ..., CutN -> End
                let currentStartPoint = points[0];
                let currentIndex = 0; // Index in original array

                intersections.forEach(hit => {
                    const segmentPoints: Point[] = [];
                    
                    // If we are starting a fresh segment from a cut point, add it first
                    if (segmentPoints.length === 0) {
                        segmentPoints.push(currentStartPoint);
                    }
                    
                    // Add intermediate existing points
                    for (let i = currentIndex + 1; i <= hit.index; i++) {
                        segmentPoints.push(points[i]);
                    }
                    
                    // Add cut point
                    segmentPoints.push(hit.point);
                    
                    // Save this segment
                    const p = createPathFromPoints(segmentPoints);
                    if (p) newPaths.push(p);
                    
                    // Prepare next
                    currentStartPoint = hit.point;
                    currentIndex = hit.index;
                });
                
                // Add final segment (CutN -> End)
                const finalSegment: Point[] = [currentStartPoint];
                for (let i = currentIndex + 1; i < points.length; i++) {
                    finalSegment.push(points[i]);
                }
                const p = createPathFromPoints(finalSegment);
                if (p) newPaths.push(p);
            }
        });

        if (hasSplit) {
            onPathsChange(newPaths);
        }
    };

    const getCursor = () => 'crosshair';

    return { start, move, end, getCursor };
};
