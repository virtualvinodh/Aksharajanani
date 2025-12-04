


import { useState, useEffect, useCallback } from 'react';
import { Path, Point, Segment } from '../../types';
import { VEC } from '../../utils/vectorUtils';
import { distanceToSegment } from '../../utils/geometryUtils';
import { DraggedPointInfo, ToolHookProps } from './types';
import { paperScope } from '../../services/glyphRenderService';
import { deepClone } from '../../utils/cloneUtils';

declare var paper: any;

export const useEditTool = ({ isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, zoom, ...props }: ToolHookProps) => {
    const [draggedPointInfo, setDraggedPointInfo] = useState<DraggedPointInfo | null>(null);
    const [selectedPointInfo, setSelectedPointInfo] = useState<DraggedPointInfo | null>(null);
    const [focusedPathId, setFocusedPathId] = useState<string | null>(null);

    const getEditablePointAt = useCallback((point: Point): DraggedPointInfo | null => {
        const tolerance = 10 / zoom;
        for (let i = currentPaths.length - 1; i >= 0; i--) {
            const path = currentPaths[i];

            if (path.type === 'outline' && path.segmentGroups) {
                for (let j = 0; j < path.segmentGroups.length; j++) {
                    const group = path.segmentGroups[j];
                    for (let k = 0; k < group.length; k++) {
                        const segment = group[k];
                        const anchorPoint = segment.point;
                        const handleInPoint = VEC.add(anchorPoint, segment.handleIn);
                        const handleOutPoint = VEC.add(anchorPoint, segment.handleOut);

                        if (VEC.len(VEC.sub(point, anchorPoint)) < tolerance) {
                            return { type: 'segment', pathId: path.id, segmentGroupIndex: j, segmentIndex: k, handleType: 'point' };
                        }
                        if (VEC.len(VEC.sub(point, handleInPoint)) < tolerance) {
                            return { type: 'segment', pathId: path.id, segmentGroupIndex: j, segmentIndex: k, handleType: 'handleIn' };
                        }
                        if (VEC.len(VEC.sub(point, handleOutPoint)) < tolerance) {
                            return { type: 'segment', pathId: path.id, segmentGroupIndex: j, segmentIndex: k, handleType: 'handleOut' };
                        }
                    }
                }
            } else if (path.points && path.type !== 'outline') {
                for (let j = 0; j < path.points.length; j++) {
                    if (VEC.len(VEC.sub(point, path.points[j])) < tolerance) {
                        return { type: 'freehand', pathId: path.id, pointIndex: j };
                    }
                }
            }
        }
        return null;
    }, [currentPaths, zoom]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // If paths are selected via the Select tool, let the main modal handler manage deletion.
            if (props.selectedPathIds.size > 0) return;
            if (!selectedPointInfo) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                
                let newPaths: Path[] | null = null;

                if (selectedPointInfo.type === 'freehand') {
                    const pathToDeleteFrom = currentPaths.find(p => p.id === selectedPointInfo.pathId);
                    if (!pathToDeleteFrom) return;

                    if (pathToDeleteFrom.points.length <= 2) {
                        newPaths = currentPaths.filter(p => p.id !== selectedPointInfo.pathId);
                    } else {
                        newPaths = currentPaths.map(p => {
                            if (p.id === selectedPointInfo.pathId) {
                                return { ...p, points: p.points.filter((_, index) => index !== selectedPointInfo.pointIndex) };
                            }
                            return p;
                        });
                    }
                } else if (selectedPointInfo.type === 'segment' && selectedPointInfo.handleType === 'point') {
                    const path = currentPaths.find(p => p.id === selectedPointInfo.pathId);
                    if (!path || !path.segmentGroups) return;
                    
                    const pathIndex = currentPaths.findIndex(p => p.id === selectedPointInfo.pathId);
                    if (pathIndex === -1) return;

                    // OPTIMIZATION: Use deepClone
                    const newSegmentGroups = deepClone(path.segmentGroups);
                    const group = newSegmentGroups[selectedPointInfo.segmentGroupIndex!];
                    
                    // A valid closed path needs at least 3 points. Deleting one below that breaks it.
                    if (group.length > 3) {
                        group.splice(selectedPointInfo.segmentIndex!, 1);
                        const newPath = { ...path, segmentGroups: newSegmentGroups };
                        const finalPaths = [...currentPaths];
                        finalPaths[pathIndex] = newPath;
                        newPaths = finalPaths;
                    } else { 
                        // If path is too small, just delete the whole thing.
                        newPaths = currentPaths.filter(p => p.id !== selectedPointInfo.pathId);
                    }
                }
                
                if (newPaths) {
                    onPathsChange(newPaths);
                    setSelectedPointInfo(null);
                    setFocusedPathId(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPointInfo, currentPaths, onPathsChange, props.selectedPathIds]);

    const start = (point: Point) => {
        const grabbedPoint = getEditablePointAt(point);
        if (grabbedPoint) {
            setDraggedPointInfo(grabbedPoint);
            setSelectedPointInfo(grabbedPoint);
            setFocusedPathId(grabbedPoint.pathId);
            setIsDrawing(true);
        } else {
            setSelectedPointInfo(null);
            setFocusedPathId(null);
        }
    };

    const move = (point: Point) => {
        if (isDrawing && draggedPointInfo) {
            setCurrentPaths(prev => prev.map(p => {
                if (p.id === draggedPointInfo.pathId) {
                    if (draggedPointInfo.type === 'segment') {
                        // OPTIMIZATION: Use deepClone
                        const newSegmentGroups = deepClone(p.segmentGroups);
                        const segment = newSegmentGroups![draggedPointInfo.segmentGroupIndex][draggedPointInfo.segmentIndex];
                        
                        if (draggedPointInfo.handleType === 'point') {
                            segment.point = point;
                        } else if (draggedPointInfo.handleType === 'handleIn') {
                            segment.handleIn = VEC.sub(point, segment.point);
                        } else if (draggedPointInfo.handleType === 'handleOut') {
                            segment.handleOut = VEC.sub(point, segment.point);
                        }
                        return { ...p, segmentGroups: newSegmentGroups };
                    } else if (draggedPointInfo.type === 'freehand') {
                        const newPoints = [...p.points];
                        newPoints[draggedPointInfo.pointIndex] = point;
                        return { ...p, points: newPoints };
                    }
                }
                return p;
            }));
        }
    };

    const end = () => {
        if (isDrawing) {
            if (draggedPointInfo) {
                onPathsChange(currentPaths);
            }
            setIsDrawing(false);
            setDraggedPointInfo(null);
        }
    };
    
    const doubleClick = (clickPoint: Point) => {
        const pointToDelete = getEditablePointAt(clickPoint);
        if (pointToDelete) {
            let newPaths: Path[] | null = null;
            if (pointToDelete.type === 'segment' && pointToDelete.handleType === 'point') {
                const path = currentPaths.find(p => p.id === pointToDelete.pathId);
                if (!path || !path.segmentGroups) return;
                newPaths = currentPaths.map(p => {
                    if (p.id === pointToDelete.pathId) {
                        // OPTIMIZATION: Use deepClone
                        const newSegmentGroups = deepClone(p.segmentGroups);
                        const group = newSegmentGroups![pointToDelete.segmentGroupIndex!];
                        if (group.length > 3) {
                            group.splice(pointToDelete.segmentIndex!, 1);
                        } else { return null; }
                        return { ...p, segmentGroups: newSegmentGroups };
                    }
                    return p;
                }).filter((p): p is Path => p !== null);
            } else if (pointToDelete.type === 'freehand') {
                const path = currentPaths.find(p => p.id === pointToDelete.pathId);
                if (!path) return;
                if (path.points.length <= 2) {
                    newPaths = currentPaths.filter(p => p.id !== pointToDelete.pathId);
                } else {
                    newPaths = currentPaths.map(p => {
                        if (p.id === pointToDelete.pathId) {
                            return { ...p, points: p.points.filter((_, index) => index !== pointToDelete.pointIndex) };
                        }
                        return p;
                    });
                }
            }
            if(newPaths) {
                onPathsChange(newPaths);
                setSelectedPointInfo(null);
                setFocusedPathId(null);
            }
            return;
        }

        paperScope.project.clear();
        const tolerance = 10 / zoom;
    
        let closestOutlineInfo: { distance: number, pathId: string, groupIndex: number, location: any } | null = null;
        let closestFreehandInfo: { distance: number, pathId: string, insertIndex: number, newPoint: Point } | null = null;
    
        currentPaths.forEach(path => {
            if (path.type === 'outline' && path.segmentGroups) {
                path.segmentGroups.forEach((group, groupIndex) => {
                    if (group.length < 2) return;
                    const paperPath = new paperScope.Path({
                        segments: group.map((seg: Segment) => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y), new paperScope.Point(seg.handleIn.x, seg.handleIn.y), new paperScope.Point(seg.handleOut.x, seg.handleOut.y))),
                        closed: true,
                        insert: false
                    });
                    const location = paperPath.getNearestLocation(new paperScope.Point(clickPoint.x, clickPoint.y));
                    if (location && (!closestOutlineInfo || location.distance < closestOutlineInfo.distance)) {
                        closestOutlineInfo = { distance: location.distance, pathId: path.id, groupIndex, location };
                    }
                    // paperPath.remove(); // Not needed with insert: false and project.clear() at start
                });
            } else if (path.points && path.points.length >= 2) {
                const isClosed = path.type === 'circle' || path.type === 'ellipse';
                const loopLimit = isClosed ? path.points.length : path.points.length - 1;
    
                for (let i = 0; i < loopLimit; i++) {
                    const p1 = path.points[i];
                    const p2 = path.points[(i + 1) % path.points.length];
                    const { distance, projection } = distanceToSegment(clickPoint, p1, p2);
    
                    if (!closestFreehandInfo || distance < closestFreehandInfo.distance) {
                        closestFreehandInfo = {
                            distance,
                            pathId: path.id,
                            insertIndex: i + 1,
                            newPoint: projection
                        };
                    }
                }
            }
        });
    
        const outlineDist = closestOutlineInfo?.distance ?? Infinity;
        const freehandDist = closestFreehandInfo?.distance ?? Infinity;
    
        if (Math.min(outlineDist, freehandDist) < tolerance) {
            if (outlineDist < freehandDist) {
                const { pathId, groupIndex, location } = closestOutlineInfo!;
                const newPaths = currentPaths.map(p => {
                    if (p.id === pathId) {
                        // OPTIMIZATION: Use deepClone
                        const newSegmentGroups = deepClone(p.segmentGroups);
                        const groupToModify = newSegmentGroups![groupIndex];
                        const paperPath = new paperScope.Path({
                            segments: groupToModify.map((seg: Segment) => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y), new paperScope.Point(seg.handleIn.x, seg.handleIn.y), new paperScope.Point(seg.handleOut.x, seg.handleOut.y))),
                            closed: true,
                            insert: false 
                        });
                        const newSegment = paperPath.divideAt(location);
                        if (newSegment) {
                            const updatedGroup = paperPath.segments.map((seg: any) => ({
                                point: { x: seg.point.x, y: seg.point.y },
                                handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
                                handleOut: { x: seg.handleOut.x, y: seg.handleOut.y }
                            }));
                            newSegmentGroups![groupIndex] = updatedGroup;
                        }
                        // paperPath.remove();
                        return { ...p, segmentGroups: newSegmentGroups };
                    }
                    return p;
                });
                onPathsChange(newPaths);
                setFocusedPathId(pathId);
            } else {
                const { pathId, insertIndex, newPoint } = closestFreehandInfo!;
                const newPaths = currentPaths.map(p => {
                    if (p.id === pathId) {
                        const newPoints = [...p.points];
                        newPoints.splice(insertIndex, 0, newPoint);
                        return { ...p, points: newPoints };
                    }
                    return p;
                });
                onPathsChange(newPaths);
                setFocusedPathId(pathId);
                setSelectedPointInfo({ type: 'freehand', pathId, pointIndex: insertIndex });
            }
        }
    };

    const getCursor = () => {
        if (isDrawing && draggedPointInfo) return 'grabbing';
        return 'default';
    };

    return { start, move, end, doubleClick, getCursor, selectedPointInfo, focusedPathId };
};
