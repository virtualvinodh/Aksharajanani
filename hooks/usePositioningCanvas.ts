import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Point, Path, FontMetrics } from '../types';
import { VEC } from '../utils/vectorUtils';
import { usePanTool } from './drawingTools/usePanTool';

export interface UsePositioningCanvasProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    paths: Path[];
    onPathsChange: (paths: Path[]) => void;
    tool: 'select' | 'pan';
    zoom: number;
    setZoom: (zoom: number) => void;
    viewOffset: Point;
    setViewOffset: (offset: Point) => void;
    movementConstraint: 'horizontal' | 'vertical' | 'none';
    canEdit: boolean;
    onLockedInteraction?: () => void;
}

export const usePositioningCanvas = ({
    canvasRef, paths, onPathsChange, tool, zoom, setZoom, viewOffset, setViewOffset, movementConstraint, canEdit, onLockedInteraction
}: UsePositioningCanvasProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPointRef = useRef<Point>({ x: 0, y: 0 });
    const pathsAtStartRef = useRef<Path[]>([]);

    const zoomRef = useRef(zoom);
    const viewOffsetRef = useRef(viewOffset);

    useEffect(() => { zoomRef.current = zoom; }, [zoom]);
    useEffect(() => { viewOffsetRef.current = viewOffset; }, [viewOffset]);

    const getViewportPoint = useCallback((e: React.MouseEvent | React.TouchEvent, touchIndex = 0): Point | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const pointSource = 'touches' in e ? e.touches[touchIndex] : e;
        if (!pointSource) return null;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: (pointSource.clientX - rect.left) * scaleX, y: (pointSource.clientY - rect.top) * scaleY };
    }, [canvasRef]);

    const getCanvasPoint = useCallback((viewportPoint: Point): Point => ({
        x: (viewportPoint.x - viewOffsetRef.current.x) / zoomRef.current,
        y: (viewportPoint.y - viewOffsetRef.current.y) / zoomRef.current,
    }), []);

    const panTool = usePanTool({ 
        onPan: (newOffset) => setViewOffset(newOffset) 
    });

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;

        if (e.button === 1 || tool === 'pan') {
            panTool.startPan(viewportPoint, viewOffsetRef.current);
            return;
        }

        if (canEdit) {
            setIsDragging(true);
            dragStartPointRef.current = getCanvasPoint(viewportPoint);
            pathsAtStartRef.current = JSON.parse(JSON.stringify(paths));
        } else {
            if (onLockedInteraction) {
                onLockedInteraction();
            }
        }
    }, [tool, canEdit, paths, getViewportPoint, getCanvasPoint, panTool, onLockedInteraction]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;

        if (panTool.isPanning) {
            panTool.move(viewportPoint);
            return;
        }

        if (isDragging && canEdit) {
            const currentCanvasPoint = getCanvasPoint(viewportPoint);
            const delta = VEC.sub(currentCanvasPoint, dragStartPointRef.current);

            if (movementConstraint === 'horizontal') delta.y = 0;
            if (movementConstraint === 'vertical') delta.x = 0;

            const movedPaths = pathsAtStartRef.current.map(p => ({
                ...p,
                points: p.points.map(pt => VEC.add(pt, delta)),
                segmentGroups: p.segmentGroups?.map(group => group.map(seg => ({
                    ...seg,
                    point: VEC.add(seg.point, delta)
                })))
            }));
            onPathsChange(movedPaths);
        }
    }, [isDragging, canEdit, panTool, getViewportPoint, getCanvasPoint, movementConstraint, onPathsChange]);

    const handleMouseUp = useCallback(() => {
        if (panTool.isPanning) panTool.end();
        setIsDragging(false);
    }, [panTool]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;

        const zoomFactor = -e.deltaY * 0.001;
        const newZoom = Math.max(0.1, Math.min(10, zoomRef.current * (1 + zoomFactor)));

        const pointInCanvas = {
            x: (viewportPoint.x - viewOffsetRef.current.x) / zoomRef.current,
            y: (viewportPoint.y - viewOffsetRef.current.y) / zoomRef.current
        };

        const newViewOffset = {
            x: viewportPoint.x - pointInCanvas.x * newZoom,
            y: viewportPoint.y - pointInCanvas.y * newZoom
        };

        setZoom(newZoom);
        setViewOffset(newViewOffset);
    }, [getViewportPoint, setZoom, setViewOffset]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (tool === 'pan' && e.touches.length > 1) {
            panTool.startPan(getViewportPoint(e)!, viewOffsetRef.current);
            return;
        }
        if (e.touches.length === 1) {
            const viewportPoint = getViewportPoint(e);
            if (!viewportPoint) return;
    
            if (canEdit) {
                setIsDragging(true);
                dragStartPointRef.current = getCanvasPoint(viewportPoint);
                pathsAtStartRef.current = JSON.parse(JSON.stringify(paths));
            } else {
                if (onLockedInteraction) {
                    onLockedInteraction();
                }
            }
        }
    }, [tool, canEdit, paths, getViewportPoint, getCanvasPoint, onLockedInteraction, panTool]);
    
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (panTool.isPanning) {
            panTool.move(getViewportPoint(e)!);
            return;
        }

        if (e.touches.length === 1 && isDragging && canEdit) {
            const viewportPoint = getViewportPoint(e);
            if (!viewportPoint) return;
    
            const currentCanvasPoint = getCanvasPoint(viewportPoint);
            const delta = VEC.sub(currentCanvasPoint, dragStartPointRef.current);
    
            if (movementConstraint === 'horizontal') delta.y = 0;
            if (movementConstraint === 'vertical') delta.x = 0;
    
            const movedPaths = pathsAtStartRef.current.map(p => ({
                ...p,
                points: p.points.map(pt => VEC.add(pt, delta)),
                segmentGroups: p.segmentGroups?.map(group => group.map(seg => ({
                    ...seg,
                    point: VEC.add(seg.point, delta)
                })))
            }));
            onPathsChange(movedPaths);
        }
    }, [isDragging, canEdit, getViewportPoint, getCanvasPoint, movementConstraint, onPathsChange, panTool]);

    const handleTouchEnd = useCallback(() => {
        if (panTool.isPanning) panTool.end();
        setIsDragging(false);
    }, [panTool]);


    return {
        handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
        handleTouchStart, handleTouchMove, handleTouchEnd,
        isPanning: panTool.isPanning, isDragging
    };
};
