
import { useState, useCallback } from 'react';
import { Point, Path } from '../../types';
import { generateId, ToolHookProps } from './types';
import { paperScope } from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';
import { simplifyPath } from '../../utils/pathUtils';

declare var paper: any;

export const useSliceTool = ({
    isDrawing, setIsDrawing, currentPaths, onPathsChange, previewPath, setPreviewPath,
    onSelectionChange
}: ToolHookProps) => {
    const [sliceStart, setSliceStart] = useState<Point | null>(null);
    const [highlightedPathId, setHighlightedPathId] = useState<string | null>(null);

    const start = (point: Point) => {
        setIsDrawing(true);
        setSliceStart(point);
    };

    // Helper: Line Segment Intersection
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

    // Helper: Densify a polyline by injecting points into long segments
    // This effectively "anchors" the shape for the renderer's smoothing algorithm,
    // preventing straight lines (like the cut chord) from being curved/collapsed.
    const densifyPolyline = (points: Point[], maxDist: number = 4): Point[] => {
        if (points.length < 2) return points;
        const newPoints: Point[] = [points[0]];
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const dist = VEC.len(VEC.sub(p2, p1));
            if (dist > maxDist) {
                const steps = Math.ceil(dist / maxDist);
                for (let k = 1; k <= steps; k++) {
                     newPoints.push({
                         x: p1.x + (p2.x - p1.x) * (k / steps),
                         y: p1.y + (p2.y - p1.y) * (k / steps)
                     });
                }
            } else {
                newPoints.push(p2);
            }
        }
        return newPoints;
    };
    
    // Helper: Convert any path to a dense polyline of Points
    const getFlattenedPoints = useCallback((pathData: Path): { points: Point[], isClosed: boolean } => {
        paperScope.project.clear();
        let paperItem: any;

        // 1. Handle Outlines (SVG) - Precise flattening
        if (pathData.type === 'outline' && pathData.segmentGroups) {
            const segments = pathData.segmentGroups[0];
            if (!segments) return { points: [], isClosed: false };
            paperItem = new paperScope.Path({
                segments: segments.map(s => [s.point.x, s.point.y]),
                closed: true
            });
            paperItem.flatten(2);
            const points = paperItem.segments.map((s: any) => ({ x: s.point.x, y: s.point.y }));
            return { points, isClosed: true };
        } 
        
        // 2. Handle Curves/Pens - Smoothing
        else if (pathData.type === 'pen' || pathData.type === 'curve') {
             if (pathData.points.length < 2) return { points: pathData.points, isClosed: false };
             paperItem = new paperScope.Path({ segments: pathData.points.map(p => [p.x, p.y]) });
             if (pathData.type === 'pen') paperItem.smooth();
             paperItem.flatten(2);
             const points = paperItem.segments.map((s: any) => ({ x: s.point.x, y: s.point.y }));
             // Heuristic check for visual closure
             const isClosed = paperItem.closed || (points.length > 2 && VEC.len(VEC.sub(points[0], points[points.length-1])) < 5);
             
             // Ensure unique vertices for closed loops to simplify intersection logic
             if (isClosed && points.length > 1 && VEC.len(VEC.sub(points[0], points[points.length-1])) < 0.1) {
                 points.pop();
             }
             return { points, isClosed };
        } 
        
        // 3. Handle Circles/Ellipses/Polygons - Explicit Points
        else {
             let points = [...pathData.points];
             const isClosed = ['circle', 'ellipse', 'rect', 'line'].includes(pathData.type);
             // Remove duplicate end point if present to make math easier
             if (isClosed && points.length > 1 && VEC.len(VEC.sub(points[0], points[points.length-1])) < 0.1) {
                 points.pop();
             }
             return { points, isClosed };
        }
    }, []);

    // Check intersection for a single path
    const checkPathIntersection = useCallback((pathData: Path, p1: Point, p2: Point) => {
        const { points, isClosed } = getFlattenedPoints(pathData);
        if (points.length < 2) return { intersections: [] as { index: number, point: Point }[], points, isClosed };

        const intersections: { index: number, point: Point }[] = [];

        // Check all segments
        const len = points.length;
        // If closed, we check the wrap-around segment (last -> first) as well
        const limit = isClosed ? len : len - 1;

        for (let i = 0; i < limit; i++) {
            const segStart = points[i];
            const segEnd = points[(i + 1) % len];
            const hit = getSegmentIntersection(segStart, segEnd, p1, p2);
            if (hit) {
                intersections.push({ index: i, point: hit });
            }
        }

        return { intersections, points, isClosed };
    }, [getFlattenedPoints]);


    const move = (point: Point) => {
        if (!isDrawing || !sliceStart) return;
        
        // Update Preview Line
        setPreviewPath({
            id: 'slice-preview',
            type: 'line',
            points: [sliceStart, point]
        });

        // Find intersecting path to highlight
        let foundId: string | null = null;
        
        // Check in reverse order (topmost first)
        for (let i = currentPaths.length - 1; i >= 0; i--) {
            const path = currentPaths[i];
            const { intersections } = checkPathIntersection(path, sliceStart, point);
            
            if (intersections.length > 0) {
                foundId = path.id;
                break; // Only highlight one
            }
        }
        
        setHighlightedPathId(foundId);
    };

    const performSlice = (p1: Point, p2: Point, targetPathId: string): string[] => {
        const newPathIds: string[] = [];
        const newPathsList: Path[] = [];
        let replaced = false;

        const createPathFromPoints = (pts: Point[]): Path | null => {
            if (pts.length < 2) return null;
            
            // Densify the path (insert points every ~4px) to preserve corners/straight lines
            // from being collapsed by the renderer's smoothing.
            const densePoints = densifyPolyline(pts);

            const newId = generateId();
            newPathIds.push(newId);
            
            return {
                id: newId,
                type: 'pen', // Keep as 'pen' for smooth rendering, but now dense enough to hold shape
                points: densePoints
            };
        };

        currentPaths.forEach(pathData => {
            if (pathData.id !== targetPathId) {
                newPathsList.push(pathData);
                return;
            }

            const { intersections, points, isClosed } = checkPathIntersection(pathData, p1, p2);

            if (intersections.length === 0) {
                newPathsList.push(pathData);
                return;
            }

            replaced = true;
            // Sort intersection points by index along the path to ensure correct traversal
            intersections.sort((a, b) => a.index - b.index);

            if (isClosed && intersections.length === 2) {
                // OPTIMIZED CASE: Splitting a closed loop into two OPEN loops (e.g. circle -> 2 semi-circle arcs)
                const hit1 = intersections[0];
                const hit2 = intersections[1];
                
                // Shape 1: Hit1 -> (points in between) -> Hit2 (Do NOT close back to Hit1)
                const shape1: Point[] = [hit1.point];
                
                // Add points between hit1 and hit2 indices
                // hit1.index is the start of the segment where intersection occurred.
                // So we start collecting from the *next* vertex.
                for (let i = hit1.index + 1; i <= hit2.index; i++) {
                    shape1.push(points[i]);
                }
                shape1.push(hit2.point);
                
                // Shape 2: Hit2 -> (points to end) -> (points from start) -> Hit1 (Do NOT close back to Hit2)
                const shape2: Point[] = [hit2.point];
                
                // Add points from hit2 to end of array
                for (let i = hit2.index + 1; i < points.length; i++) {
                    shape2.push(points[i]);
                }
                // Wrap around: Add points from start of array up to hit1
                for (let i = 0; i <= hit1.index; i++) {
                    shape2.push(points[i]);
                }
                shape2.push(hit1.point);
                
                const path1 = createPathFromPoints(shape1);
                const path2 = createPathFromPoints(shape2);
                
                if (path1) newPathsList.push(path1);
                if (path2) newPathsList.push(path2);

            } else if (isClosed) {
                // Fallback for complex closed cuts (1 cut or >2 cuts)
                // If 1 cut, it opens the loop into a 'C' shape.
                // If >2 cuts, simplified logic treats it as segments.
                
                if (intersections.length === 1) {
                    const hit = intersections[0];
                    const idx = hit.index;
                    
                    const newPoly: Point[] = [];
                    newPoly.push(hit.point);
                    // From hit to end
                    for (let i = idx + 1; i < points.length; i++) newPoly.push(points[i]);
                    // From start to hit
                    for (let i = 0; i <= idx; i++) newPoly.push(points[i]);
                    newPoly.push(hit.point);
                    
                    const path = createPathFromPoints(newPoly);
                    if (path) newPathsList.push(path);
                } else {
                     // Multi-cut fallback: treat as open segments
                     let currentSeg: Point[] = [points[0]];
                     const segments: Point[][] = [];
                     let lastIdx = 0;
                     
                     intersections.forEach(hit => {
                        for(let i = lastIdx + 1; i <= hit.index; i++) currentSeg.push(points[i]);
                        currentSeg.push(hit.point);
                        segments.push(currentSeg);
                        currentSeg = [hit.point];
                        lastIdx = hit.index;
                     });
                     
                     // Collect remainder
                     for(let i = lastIdx + 1; i < points.length; i++) currentSeg.push(points[i]);
                     
                     // Merge tail and head because it was a closed loop
                     if (segments.length > 0) {
                         const head = segments[0];
                         const tail = currentSeg;
                         // Combine tail points + head points (excluding duplicate join point if any)
                         const merged = [...tail, ...head];
                         segments[0] = merged;
                     } else {
                         segments.push(currentSeg);
                     }
                     
                     segments.forEach(seg => {
                         const p = createPathFromPoints(seg);
                         if (p) newPathsList.push(p);
                     });
                }

            } else {
                // Open Path Splitting (Lines, Curves)
                let currentStartPoint = points[0];
                let currentIndex = 0;

                intersections.forEach(hit => {
                    const segmentPoints: Point[] = [];
                    if (segmentPoints.length === 0) segmentPoints.push(currentStartPoint);
                    
                    for (let i = currentIndex + 1; i <= hit.index; i++) segmentPoints.push(points[i]);
                    segmentPoints.push(hit.point);
                    
                    const p = createPathFromPoints(segmentPoints);
                    if (p) newPathsList.push(p);
                    
                    currentStartPoint = hit.point;
                    currentIndex = hit.index;
                });
                
                const finalSegment: Point[] = [currentStartPoint];
                for (let i = currentIndex + 1; i < points.length; i++) finalSegment.push(points[i]);
                const p = createPathFromPoints(finalSegment);
                if (p) newPathsList.push(p);
            }
        });

        if (replaced) {
            onPathsChange(newPathsList);
        }
        
        return newPathIds;
    };

    const end = (endPoint?: Point) => {
        if (!isDrawing || !sliceStart) return;
        
        const finalPoint = endPoint || (previewPath?.points[1]);
        
        if (finalPoint && highlightedPathId) {
            const newIds = performSlice(sliceStart, finalPoint, highlightedPathId);
            if (newIds.length > 0) {
                // Auto-select ONLY the first resulting piece for convenience
                onSelectionChange(new Set([newIds[0]]));
            }
        }

        setIsDrawing(false);
        setSliceStart(null);
        setPreviewPath(null);
        setHighlightedPathId(null);
    };

    const getCursor = () => 'crosshair';

    return { start, move, end, getCursor, highlightedPathId };
};
