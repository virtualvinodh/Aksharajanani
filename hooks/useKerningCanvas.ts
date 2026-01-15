import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Point } from '../types';
import { VEC } from '../utils/vectorUtils';
import { usePanTool } from './drawingTools/usePanTool';

export interface UseKerningCanvasProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    kernValue: string;
    onKernChange: (val: string) => void;
    tool: 'select' | 'pan';
    zoom: number;
    setZoom: (zoom: number) => void;
    viewOffset: Point;
    setViewOffset: (offset: Point) => void;
    baseScale: number;
}

export const useKerningCanvas = ({
    canvasRef, kernValue, onKernChange, tool, zoom, setZoom, viewOffset, setViewOffset, baseScale
}: UseKerningCanvasProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPointRef = useRef<Point>({ x: 0, y: 0 });
    const kernAtStartRef = useRef<number>(0);

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

    const panTool = usePanTool({ 
        onPan: (newOffset) => setViewOffset(newOffset) 
    });

    const handleMouseDown = useCallback((e: React.MouseEvent, isOverRightGlyph: boolean) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;

        if (e.button === 1 || tool === 'pan') {
            panTool.startPan(viewportPoint, viewOffsetRef.current);
            return;
        }

        if (isOverRightGlyph) {
            setIsDragging(true);
            dragStartPointRef.current = viewportPoint;
            kernAtStartRef.current = parseInt(kernValue, 10) || 0;
        }
    }, [tool, kernValue, getViewportPoint, panTool, viewOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;

        if (panTool.isPanning) {
            panTool.move(viewportPoint);
            return;
        }

        if (isDragging) {
            const finalScale = baseScale * zoomRef.current;
            const deltaViewportX = viewportPoint.x - dragStartPointRef.current.x;
            const deltaDesignX = Math.round(deltaViewportX / finalScale);
            
            onKernChange(String(kernAtStartRef.current + deltaDesignX));
        }
    }, [isDragging, panTool, getViewportPoint, baseScale, onKernChange]);

    const handleMouseUp = useCallback(() => {
        if (panTool.isPanning) panTool.end();
        setIsDragging(false);
    }, [panTool]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const viewportPoint = getViewportPoint(e as any);
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

    return {
        handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
        isPanning: panTool.isPanning, isDragging
    };
};