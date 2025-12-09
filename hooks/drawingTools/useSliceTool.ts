
import { useState, useRef } from 'react';
import { Point, Path, Segment } from '../../types';
import { generateId, ToolHookProps } from './types';
import { paperScope } from '../../services/glyphRenderService';
import { deepClone } from '../../utils/cloneUtils';

declare var paper: any;

export const useSliceTool = ({
    isDrawing, setIsDrawing, currentPaths, onPathsChange, previewPath, setPreviewPath,
    showNotification, t
}: ToolHookProps) => {
    const [sliceStart, setSliceStart] = useState<Point | null>(null);

    const start = (point: Point) => {
        setIsDrawing(true);
        setSliceStart(point);
    };

    const move = (point: Point) => {
        if (!isDrawing || !sliceStart) return;
        
        // Visualize the slice line
        setPreviewPath({
            id: 'slice-preview',
            type: 'line',
            points: [sliceStart, point]
        });
    };

    const end = (endPoint?: Point) => {
        if (!isDrawing || !sliceStart) return;
        
        // If endPoint isn't provided (e.g. mouse up outside canvas), use the last point from preview
        const finalPoint = endPoint || (previewPath?.points[1]);
        
        if (finalPoint) {
            performSlice(sliceStart, finalPoint);
        }

        setIsDrawing(false);
        setSliceStart(null);
        setPreviewPath(null);
    };
    
    // Helper to convert App Path -> Paper Item
    const appPathToPaperItem = (pathData: Path): any => {
         let paperItem: any;
            
        if (pathData.type === 'outline' && pathData.segmentGroups) {
                // Complex compound path
                const createPaperPath = (segments: Segment[]) => new paperScope.Path({ 
                segments: segments.map(seg => new paperScope.Segment(
                    new paperScope.Point(seg.point.x, seg.point.y), 
                    new paperScope.Point(seg.handleIn.x, seg.handleIn.y), 
                    new paperScope.Point(seg.handleOut.x, seg.handleOut.y)
                )), 
                closed: true,
                insert: false 
            });

            if (pathData.segmentGroups.length > 1) {
                    const nonEmptyGroups = pathData.segmentGroups.filter(g => g.length > 0);
                    paperItem = new paperScope.CompoundPath({ children: nonEmptyGroups.map(createPaperPath), insert: false });
            } else if (pathData.segmentGroups.length === 1) {
                    paperItem = createPaperPath(pathData.segmentGroups[0]);
            }
        } else {
                // Simple path (pen, line, curve, etc.)
                let segments: any[] = [];
                
                // If it's a shape defined by points (pen, line), use them
                if (pathData.points && pathData.points.length > 0) {
                    
                    if (pathData.type === 'pen' && pathData.points.length > 2) {
                        // Reconstruct smooth pen stroke geometry
                        const pts = pathData.points;
                        paperItem = new paperScope.Path({ insert: false });
                        paperItem.moveTo(new paperScope.Point(pts[0].x, pts[0].y));
                        for (let i = 1; i < pts.length - 2; i++) {
                            const p1 = pts[i];
                            const p2 = pts[i + 1];
                            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                            paperItem.quadraticCurveTo(
                                new paperScope.Point(p1.x, p1.y),
                                new paperScope.Point(mid.x, mid.y)
                            );
                        }
                        // Last curve segment
                        const last = pts[pts.length - 1];
                        const secondLast = pts[pts.length - 2];
                        paperItem.quadraticCurveTo(
                            new paperScope.Point(secondLast.x, secondLast.y),
                            new paperScope.Point(last.x, last.y)
                        );
                    } else if (pathData.type === 'curve' && pathData.points.length === 3) {
                         // Quadratic Bezier
                         const [p0, p1, p2] = pathData.points;
                         paperItem = new paperScope.Path({ insert: false });
                         paperItem.moveTo(new paperScope.Point(p0.x, p0.y));
                         paperItem.quadraticCurveTo(
                             new paperScope.Point(p1.x, p1.y),
                             new paperScope.Point(p2.x, p2.y)
                         );
                    } else {
                        // Linear segments (line, dot, short pen)
                        segments = pathData.points.map(p => new paperScope.Point(p.x, p.y));
                        paperItem = new paperScope.Path({
                            segments: segments,
                            closed: ['circle', 'ellipse'].includes(pathData.type),
                            insert: false
                        });
                        
                        // For circle/ellipse, we technically only have points approximation in 'points' array if converted?
                        // Actually 'circle'/'ellipse' tool creates paths with many points approximating the shape in `useShapeTool`.
                        // So treated as polyline is fine, or we can smooth it if we want perfect circles.
                        // Ideally shape tools should store center/radius but here they store points.
                    }
                }
        }
        return paperItem;
    };

    const performSlice = (p1: Point, p2: Point) => {
        paperScope.project.clear();
        
        // 1. Create the Slice Line
        const sliceLine = new paperScope.Path.Line(
            new paperScope.Point(p1.x, p1.y), 
            new paperScope.Point(p2.x, p2.y)
        );
        
        // If the slice is just a click (too short), ignore it
        if (sliceLine.length < 2) {
             return;
        }

        let hasSplit = false;
        const newPaths: Path[] = [];

        // 2. Process each existing path
        // We use deepClone to avoid mutating currentPaths in place during iteration if we were modifying it directly,
        // though here we build a new array so it's less critical, but good practice.
        const pathsToProcess = deepClone(currentPaths);
        
        pathsToProcess.forEach(pathData => {
            // Convert App Path -> Paper Path
            const paperItem = appPathToPaperItem(pathData);

            if (!paperItem) {
                newPaths.push(pathData);
                return;
            }

            // 3. Find Intersections
            // We need to check if the slice line actually intersects the path.
            // Note: getIntersections returns locations on the 'paperItem'.
            const intersections = sliceLine.getIntersections(paperItem);
            
            if (intersections.length > 0) {
                hasSplit = true;
                
                // Group intersections by the specific Path object (handling CompoundPaths)
                const intersectionsByPath = new Map<any, any[]>();
                
                intersections.forEach((intersection: any) => {
                    // intersection.path refers to the specific Path item involved (e.g. child of CompoundPath)
                    const targetPath = intersection.path; 
                    if (!intersectionsByPath.has(targetPath)) {
                        intersectionsByPath.set(targetPath, []);
                    }
                    intersectionsByPath.get(targetPath).push(intersection);
                });

                const allParts: any[] = [];
                
                // Helper to collect paths, handling splits if needed
                const processNode = (node: any) => {
                    if (node.className === 'CompoundPath' || node.className === 'Group') {
                        node.children.forEach(processNode);
                    } else if (node.className === 'Path') {
                        if (intersectionsByPath.has(node)) {
                            // This path needs splitting
                            const cutLocs = intersectionsByPath.get(node);
                            
                            // Sort intersections by descending offset to split from end to start.
                            // This preserves offsets for earlier splits.
                            cutLocs.sort((a: any, b: any) => b.offset - a.offset);
                            
                            const splitPieces: any[] = [];
                            let remaining = node;
                            
                            cutLocs.forEach((loc: any) => {
                                // splitAt() divides the path at the location.
                                // It returns the *new* path (the part after the split).
                                // The original 'remaining' path becomes the part *before* the split.
                                // NOTE: We must use the location relative to the current state of 'remaining'.
                                // Since we sort descending, 'loc' (which was calculated on the original)
                                // should still be valid because we haven't touched the geometry *before* it.
                                
                                // Paper.js quirk: After splitAt, the location object might be invalidated
                                // or the path identity changes. 
                                // However, sorting by offset descending is the standard workaround.
                                
                                const newPart = remaining.splitAt(loc);
                                if (newPart) {
                                    splitPieces.push(newPart);
                                }
                            });
                            
                            // The 'remaining' is now the first segment (head)
                            allParts.push(remaining);
                            // The splitPieces are the subsequent segments (tails)
                            // We push them in reverse order of creation to maintain logical flow if needed, 
                            // but order doesn't matter for independent paths.
                            splitPieces.forEach(p => allParts.push(p));
                            
                        } else {
                            // No intersection on this specific sub-path
                            allParts.push(node);
                        }
                    }
                };
                
                processNode(paperItem);

                // Convert all resulting parts back to App Paths
                allParts.forEach(part => {
                     // Check if part has significant length (ignore tiny artifacts from splitting)
                     if (part.length > 0.1) {
                         const appPath = paperPathToAppPath(part);
                         // Preserve original ID for the first part? No, generate new IDs to avoid conflicts.
                         // But maybe we want to keep properties?
                         newPaths.push(appPath);
                     }
                });
                
            } else {
                newPaths.push(pathData);
            }
        });

        if (hasSplit) {
            onPathsChange(newPaths);
        }
    };
    
    // Helper to convert Paper.js Item back to App Path
    // Always converts to 'outline' type to preserve the exact split geometry (Bezier handles)
    const paperPathToAppPath = (paperItem: any): Path => {
         const segmentGroups: Segment[][] = [];
         
         const extractSegments = (item: any) => {
             if (item.children) {
                 item.children.forEach(extractSegments);
             } else if (item.segments) {
                 const group = item.segments.map((seg: any) => ({
                     point: { x: seg.point.x, y: seg.point.y },
                     handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
                     handleOut: { x: seg.handleOut.x, y: seg.handleOut.y }
                 }));
                 segmentGroups.push(group);
             }
         };
         
         extractSegments(paperItem);
         
         return {
             id: generateId(),
             type: 'outline',
             points: [], 
             segmentGroups: segmentGroups,
             // We drop the original groupId because splitting usually implies separating parts.
             groupId: undefined 
         };
    };

    const getCursor = () => {
        return 'crosshair';
    };

    return { start, move, end, getCursor };
};
