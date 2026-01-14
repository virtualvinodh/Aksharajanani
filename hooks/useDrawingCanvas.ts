import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Point, Path, Tool, AppSettings, ImageTransform, Segment } from '../types';
import { VEC } from '../utils/vectorUtils';
import { useTheme } from '../contexts/ThemeContext';
import { DraggedPointInfo, UseDrawingCanvasProps, Handle } from './drawingTools/types';
import { usePanTool } from './drawingTools/usePanTool';
import { usePenTool } from './drawingTools/usePenTool';
import { useShapeTool } from './drawingTools/useShapeTool';
import { useCurveTool } from './drawingTools/useCurveTool';
import { useSelectTool } from './drawingTools/useSelectTool';
import { useEditTool } from './drawingTools/useEditTool';
import { useEraserTool } from './drawingTools/useEraserTool';
import { useSliceTool } from './drawingTools/useSliceTool';
import { useLayout } from '../contexts/LayoutContext';
import { useLocale } from '../contexts/LocaleContext';
import { distanceToSegment } from '../utils/geometryUtils';
import { getAccurateGlyphBBox, curveToPolyline, quadraticCurveToPolyline, paperScope } from '../services/glyphRenderService';

export type { DraggedPointInfo, Handle };

declare var paper: any;

export const useDrawingCanvas = (props: UseDrawingCanvasProps) => {
    const {
        canvasRef, initialPaths, onPathsChange, tool, onToolChange, zoom, setZoom, viewOffset,
        setViewOffset, settings, onSelectionChange, 
        lsb, rsb, onMetricsChange, metrics, disableAutoFit = false
    } = props;
    
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPaths, setCurrentPaths] = useState<Path[]>(initialPaths);
    const [previewPath, setPreviewPath] = useState<Path | null>(null);
    const [bgImageObject, setBgImageObject] = useState<HTMLImageElement | null>(null);
    const [hoveredPathIds, setHoveredPathIds] = useState<Set<string>>(new Set());
    
    const [hoveredMetric, setHoveredMetric] = useState<'lsb' | 'rsb' | null>(null);
    const [draggingMetric, setDraggingMetric] = useState<'lsb' | 'rsb' | null>(null);
    const metricDragStartRef = useRef<{ startX: number, startValue: number } | null>(null);

    const { theme } = useTheme();
    const { showNotification } = useLayout();
    const { t } = useLocale();

    const glyphBBox = useMemo(() => {
        if (currentPaths.length === 0) return null;
        return getAccurateGlyphBBox(currentPaths, settings.strokeThickness);
    }, [currentPaths, settings.strokeThickness]);

    const zoomRef = useRef(zoom);
    const viewOffsetRef = useRef(viewOffset);
    const targetZoomRef = useRef(zoom);
    const targetViewOffsetRef = useRef(viewOffset);
    const animationFrameRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        zoomRef.current = zoom;
        if (!animationFrameRef.current) {
             targetZoomRef.current = zoom;
        }
    }, [zoom]);

    useEffect(() => {
        viewOffsetRef.current = viewOffset;
        if (!animationFrameRef.current) {
            targetViewOffsetRef.current = viewOffset;
        }
    }, [viewOffset]);

    const startAnimation = useCallback(() => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

        const animate = () => {
            const LERP_FACTOR = 0.2; 
            const currentZoom = zoomRef.current;
            const currentOffset = viewOffsetRef.current;
            const targetZoom = targetZoomRef.current;
            const targetOffset = targetViewOffsetRef.current;
            
            const newZoom = currentZoom + (targetZoom - currentZoom) * LERP_FACTOR;
            const newOffset = {
                x: currentOffset.x + (targetOffset.x - currentOffset.x) * LERP_FACTOR,
                y: currentOffset.y + (targetOffset.y - currentOffset.y) * LERP_FACTOR,
            };

            const isZoomDone = Math.abs(newZoom - targetZoom) < 0.001;
            const isOffsetDone = VEC.len(VEC.sub(newOffset, targetOffset)) < 0.1;

            if (isZoomDone && isOffsetDone) {
                setZoom(targetZoom);
                setViewOffset(targetOffset);
                zoomRef.current = targetZoom;
                viewOffsetRef.current = targetOffset;
                animationFrameRef.current = undefined;
            } else {
                setZoom(newZoom);
                setViewOffset(newOffset);
                zoomRef.current = newZoom;
                viewOffsetRef.current = newOffset;
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
    }, [setZoom, setViewOffset]);

    const didInitialFit = useRef(false);
    useEffect(() => {
        if (disableAutoFit) {
            didInitialFit.current = true;
            return;
        }
        
        if (!didInitialFit.current && initialPaths.length > 0) {
            const bbox = getAccurateGlyphBBox(initialPaths, settings.strokeThickness);
            if (bbox) {
                const isBeyond = bbox.x < 0 || bbox.y < 0 || (bbox.x + bbox.width) > 1000 || (bbox.y + bbox.height) > 1000;
                
                if (isBeyond) {
                    const PADDING = 100;
                    const availableDim = 1000 - (PADDING * 2);
                    const fitScale = Math.min(availableDim / bbox.width, availableDim / bbox.height, 1);
                    const contentCenterX = bbox.x + bbox.width / 2;
                    const contentCenterY = bbox.y + bbox.height / 2;
                    const newTargetZoom = fitScale;
                    const newTargetOffset = {
                        x: 500 - (contentCenterX * newTargetZoom),
                        y: 500 - (contentCenterY * newTargetZoom)
                    };

                    targetZoomRef.current = newTargetZoom;
                    targetViewOffsetRef.current = newTargetOffset;
                    startAnimation();
                }
            }
            didInitialFit.current = true;
        }
    }, [initialPaths, settings.strokeThickness, startAnimation, disableAutoFit]);

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    const isPinchingRef = useRef(false);
    const pinchStartDistanceRef = useRef(0);
    const pinchStartZoomRef = useRef(zoom);

    useEffect(() => { setCurrentPaths(initialPaths); }, [initialPaths]);

    useEffect(() => {
        if (props.backgroundImage) {
            const img = new Image();
            img.onload = () => setBgImageObject(img);
            img.onerror = () => setBgImageObject(null);
            img.src = props.backgroundImage;
        } else {
            setBgImageObject(null);
        }
    }, [props.backgroundImage]);

    const getViewportPoint = useCallback((e: React.MouseEvent | React.TouchEvent | React.WheelEvent, touchIndex = 0): Point | null => {
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

    const findPathAtPoint = useCallback((point: Point): Path | null => {
        paperScope.project.clear();
        const tolerance = (settings.strokeThickness / 2 + 5) / zoomRef.current;
        
        for (let i = currentPaths.length - 1; i >= 0; i--) {
            const path = currentPaths[i];

            if (path.type === 'outline' && path.segmentGroups) {
                let paperItem: any;
                const createPaperPath = (segments: Segment[]) => new paperScope.Path({ 
                    segments: segments.map(seg => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y), new paperScope.Point(seg.handleIn.x, seg.handleIn.y), new paperScope.Point(seg.handleOut.x, seg.handleOut.y))), 
                    closed: true,
                    insert: false 
                });
                
                if (path.segmentGroups.length > 1) {
                    const nonEmptyGroups = path.segmentGroups.filter(g => g.length > 0);
                    if (nonEmptyGroups.length > 0) {
                        paperItem = new paperScope.CompoundPath({ children: nonEmptyGroups.map(createPaperPath), fillRule: 'evenodd', insert: false });
                    }
                } else if (path.segmentGroups.length === 1 && path.segmentGroups[0].length > 0) {
                    paperItem = createPaperPath(path.segmentGroups[0]);
                }
                
                if (paperItem && paperItem.hitTest(new paperScope.Point(point.x, point.y), { fill: true, tolerance: 0 })) {
                    return path;
                }
                continue;
            }

            let pointsToCheck = path.points;
            if ((path.type === 'pen' || path.type === 'calligraphy') && path.points.length > 2) {
                pointsToCheck = curveToPolyline(path.points, 10);
            } else if (path.type === 'curve' && path.points.length === 3) {
                pointsToCheck = quadraticCurveToPolyline(path.points, 10);
            }
            
            for (let j = 0; j < pointsToCheck.length - 1; j++) {
                if (distanceToSegment(point, pointsToCheck[j], pointsToCheck[j + 1]).distance < tolerance) return path;
            }
        }
        return null;
    }, [currentPaths, settings.strokeThickness]);
    
    const handleSelectionChangeWrapper = useCallback((ids: Set<string>) => {
        onSelectionChange(ids);
    }, [onSelectionChange]);
    
    const toolProps = { ...props, isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, previewPath, setPreviewPath, getCanvasPoint, showNotification, t, findPathAtPoint, onSelectionChange: handleSelectionChangeWrapper };
    
    const handlePan = useCallback((newOffset: Point) => {
        targetZoomRef.current = zoomRef.current; 
        targetViewOffsetRef.current = newOffset;
        startAnimation();
    }, [startAnimation]);

    const panTool = usePanTool({ onPan: handlePan });
    const penTool = usePenTool(toolProps);
    const shapeTool = useShapeTool(toolProps);
    const curveTool = useCurveTool(toolProps);
    const selectTool = useSelectTool(toolProps);
    const editTool = useEditTool(toolProps);
    const eraserTool = useEraserTool(toolProps);
    const sliceTool = useSliceTool(toolProps);

    const startInteraction = useCallback((point: Point, viewportPoint: Point, e: React.MouseEvent | React.TouchEvent) => {
        if (hoveredMetric && glyphBBox && metrics && onMetricsChange) {
             setDraggingMetric(hoveredMetric);
             metricDragStartRef.current = {
                 startX: point.x,
                 startValue: hoveredMetric === 'lsb' ? (lsb ?? metrics.defaultLSB) : (rsb ?? metrics.defaultRSB)
             };
             setIsDrawing(true);
             return;
        }

        switch (tool) {
            case 'pan': panTool.startPan(viewportPoint, viewOffsetRef.current); break;
            case 'pen': case 'calligraphy': penTool.start(point); break;
            case 'line': case 'circle': case 'ellipse': case 'dot': shapeTool.start(point); break;
            case 'curve': curveTool.start(point); break;
            case 'select': selectTool.start(point, e as React.MouseEvent); break;
            case 'edit': editTool.start(point); break;
            case 'eraser': eraserTool.start(point); break;
            case 'slice': sliceTool.start(point); break;
        }
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool, sliceTool, hoveredMetric, glyphBBox, lsb, rsb, metrics, onMetricsChange]);

    const moveInteraction = useCallback((point: Point, viewportPoint: Point) => {
        if (draggingMetric && metricDragStartRef.current && onMetricsChange && metrics) {
             const delta = point.x - metricDragStartRef.current.startX;
             const PIXELS_PER_FONT_UNIT = 1000 / metrics.unitsPerEm;
             const valueChange = Math.round(delta / PIXELS_PER_FONT_UNIT);

             if (draggingMetric === 'lsb') {
                 const newValue = metricDragStartRef.current.startValue - valueChange;
                 onMetricsChange(newValue, rsb ?? metrics.defaultRSB);
             } else {
                 const newValue = metricDragStartRef.current.startValue + valueChange;
                 onMetricsChange(lsb ?? metrics.defaultLSB, newValue);
             }
             return;
        }

        if (!isDrawing && glyphBBox && metrics) {
            const PIXELS_PER_FONT_UNIT = 1000 / metrics.unitsPerEm;
            const lsbVal = lsb ?? metrics.defaultLSB;
            const rsbVal = rsb ?? metrics.defaultRSB;
            const lsbX = glyphBBox.x - (lsbVal * PIXELS_PER_FONT_UNIT);
            const rsbX = glyphBBox.x + glyphBBox.width + (rsbVal * PIXELS_PER_FONT_UNIT);
            const HIT_TOLERANCE = 8 / zoomRef.current;
            if (Math.abs(point.x - lsbX) < HIT_TOLERANCE) setHoveredMetric('lsb');
            else if (Math.abs(point.x - rsbX) < HIT_TOLERANCE) setHoveredMetric('rsb');
            else setHoveredMetric(null);
        }

        if (draggingMetric) return;

        switch (tool) {
            case 'pan': panTool.move(viewportPoint); break;
            case 'pen': case 'calligraphy': penTool.move(point); break;
            case 'line': case 'circle': case 'ellipse': case 'dot': shapeTool.move(point); break;
            case 'curve': curveTool.move(point); break;
            case 'select': selectTool.move(point); break;
            case 'edit': editTool.move(point); break;
            case 'eraser': eraserTool.move(point); break;
            case 'slice': sliceTool.move(point); break;
        }
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool, sliceTool, isDrawing, draggingMetric, glyphBBox, metrics, lsb, rsb, onMetricsChange]);

    const endInteraction = useCallback(() => {
        isPinchingRef.current = false;
        if (draggingMetric) { setDraggingMetric(null); setIsDrawing(false); return; }
        switch (tool) {
            case 'pan': panTool.end(); break;
            case 'pen': case 'calligraphy': penTool.end(); break;
            case 'line': case 'circle': case 'ellipse': case 'dot': shapeTool.end(); break;
            case 'curve': curveTool.end(); break;
            case 'select': selectTool.end(); break;
            case 'edit': editTool.end(); break;
            case 'eraser': eraserTool.end(); break;
            case 'slice': sliceTool.end(); break; 
        }
        setHoveredPathIds(new Set());
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool, sliceTool, draggingMetric]);
    
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (tool === 'pan' && e.button === 0)) {
            const viewportPoint = getViewportPoint(e);
            if(viewportPoint) panTool.startPan(viewportPoint, viewOffsetRef.current);
            return;
        }
        const viewportPoint = getViewportPoint(e);
        if (viewportPoint) startInteraction(getCanvasPoint(viewportPoint), viewportPoint, e);
    }, [tool, getViewportPoint, getCanvasPoint, startInteraction, panTool]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;
        if (panTool.isPanning) { panTool.move(viewportPoint); return; }
        const canvasPoint = getCanvasPoint(viewportPoint);
        if (!isDrawing && !draggingMetric && (tool === 'select' || tool === 'edit')) {
            const path = findPathAtPoint(canvasPoint);
            if (path) {
                if (path.groupId) {
                    const groupIds = new Set([path.id]);
                    currentPaths.forEach(p => { if (p.groupId === path.groupId) groupIds.add(p.id); });
                    setHoveredPathIds(groupIds);
                } else setHoveredPathIds(new Set([path.id]));
            } else setHoveredPathIds(new Set());
        } else if (isDrawing) setHoveredPathIds(new Set());
        moveInteraction(canvasPoint, viewportPoint);
    }, [getViewportPoint, getCanvasPoint, moveInteraction, panTool, isDrawing, tool, findPathAtPoint, currentPaths, draggingMetric]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (tool === 'pan' && e.touches.length === 2) {
            e.preventDefault();
            isPinchingRef.current = true;
            const p1 = getViewportPoint(e, 0)!;
            const p2 = getViewportPoint(e, 1)!;
            pinchStartDistanceRef.current = VEC.len(VEC.sub(p1, p2));
            pinchStartZoomRef.current = zoomRef.current;
        } else if (e.touches.length === 1) {
            const viewportPoint = getViewportPoint(e);
            if (viewportPoint) startInteraction(getCanvasPoint(viewportPoint), viewportPoint, e);
        }
    }, [tool, getViewportPoint, getCanvasPoint, startInteraction]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (isPinchingRef.current && e.touches.length === 2) {
            e.preventDefault();
            const p1 = getViewportPoint(e, 0)!;
            const p2 = getViewportPoint(e, 1)!;
            const currentDist = VEC.len(VEC.sub(p1, p2));
            const zoomFactor = currentDist / pinchStartDistanceRef.current;
            const newZoom = Math.max(0.1, Math.min(10, pinchStartZoomRef.current * zoomFactor));
            const midPointViewport = VEC.scale(VEC.add(p1, p2), 0.5);
            const pointInCanvas = {
                x: (midPointViewport.x - viewOffsetRef.current.x) / zoomRef.current,
                y: (midPointViewport.y - viewOffsetRef.current.y) / zoomRef.current
            };
            const newViewOffset = {
                x: midPointViewport.x - pointInCanvas.x * newZoom,
                y: midPointViewport.y - pointInCanvas.y * newZoom
            };
            targetZoomRef.current = newZoom;
            targetViewOffsetRef.current = newViewOffset;
            startAnimation();
        } else if (!isPinchingRef.current && e.touches.length === 1) {
            const viewportPoint = getViewportPoint(e);
            if (viewportPoint) moveInteraction(getCanvasPoint(viewportPoint), viewportPoint);
        }
    }, [getViewportPoint, getCanvasPoint, moveInteraction, startAnimation]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (isPinchingRef.current && e.touches.length < 2) {
            isPinchingRef.current = false;
            if (e.touches.length === 1) {
                const viewportPoint = getViewportPoint(e);
                if(viewportPoint) panTool.startPan(viewportPoint, viewOffsetRef.current);
            }
        }
        if (e.touches.length === 0) endInteraction();
    }, [getViewportPoint, panTool, endInteraction]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;
        const canvasPoint = getCanvasPoint(viewportPoint);
        if (tool === 'edit') editTool.doubleClick(canvasPoint);
        else if (tool === 'select') {
            const path = findPathAtPoint(canvasPoint);
            if (path && onToolChange) {
                onSelectionChange(new Set()); 
                onToolChange('edit');
                editTool.setFocusedPathId(path.id);
            }
        }
    }, [tool, getViewportPoint, getCanvasPoint, editTool, findPathAtPoint, onToolChange, onSelectionChange]);
    
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault(); 
        const viewportPoint = getViewportPoint(e); 
        if (!viewportPoint) return;
        const currentZoom = zoomRef.current;
        const zoomFactor = -e.deltaY * 0.001; 
        const newZoom = Math.max(0.1, Math.min(10, currentZoom * (1 + zoomFactor)));
        const pointInCanvas = {
            x: (viewportPoint.x - viewOffsetRef.current.x) / currentZoom,
            y: (viewportPoint.y - viewOffsetRef.current.y) / currentZoom
        };
        const newViewOffset = { 
            x: viewportPoint.x - pointInCanvas.x * newZoom, 
            y: viewportPoint.y - pointInCanvas.y * newZoom 
        };
        targetZoomRef.current = newZoom;
        targetViewOffsetRef.current = newViewOffset;
        startAnimation();
    }, [getViewportPoint, startAnimation]);
    
    const getCursor = useCallback(() => {
        if (hoveredMetric || draggingMetric) return 'col-resize';
        if (panTool.isPanning) return 'grabbing';
        switch (tool) {
            case 'pan': return 'grab';
            case 'select': return selectTool.getCursor();
            case 'edit': return editTool.getCursor();
            case 'slice': return sliceTool.getCursor();
            case 'eraser': {
                const eraserDiameter = Math.max(4, Math.min(128, settings.strokeThickness * zoomRef.current));
                const r = eraserDiameter / 2;
                const strokeColor = theme === 'dark' ? 'white' : 'black';
                const svg = `<svg width="${eraserDiameter}" height="${eraserDiameter}" xmlns="http://www.w3.org/2000/svg"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="${strokeColor}" stroke-width="1.5" /></svg>`;
                return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${r} ${r}, crosshair`;
            }
            case 'curve': return curveTool.getCursor();
            default: return 'crosshair';
        }
    }, [tool, panTool.isPanning, selectTool, editTool, curveTool, sliceTool, settings.strokeThickness, theme, hoveredMetric, draggingMetric]);
    
    return {
        currentPaths, previewPath, marqueeBox: selectTool.marqueeBox, selectionBox: selectTool.selectionBox,
        focusedPathId: editTool.focusedPathId, selectedPointInfo: editTool.selectedPointInfo, bgImageObject,
        hoveredPathIds,
        handleMouseDown, handleMouseMove, handleMouseUp: endInteraction, handleTouchStart, handleTouchMove,
        handleTouchEnd, handleTouchCancel: endInteraction,
        handleWheel, handleDoubleClick, getCursor, handles: selectTool.handles,
        isMobile: selectTool.isMobile, HANDLE_SIZE: selectTool.HANDLE_SIZE,
        glyphBBox, hoveredMetric, draggingMetric,
        highlightedPathId: sliceTool.highlightedPathId
    };
};