import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Point, Character, GlyphData, FontMetrics } from '../types';
import { usePanTool } from './drawingTools/usePanTool';
import { getAccurateGlyphBBox } from '../services/glyphRenderService';
import { useNonPassiveWheel } from './useNonPassiveWheel';

export interface UseKerningCanvasProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    leftChar: Character;
    rightChar: Character;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    metrics: FontMetrics;
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
    canvasRef, leftChar, rightChar, glyphDataMap, strokeThickness, metrics,
    kernValue, onKernChange, tool, zoom, setZoom, viewOffset, setViewOffset, baseScale
}: UseKerningCanvasProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPointRef = useRef<Point>({ x: 0, y: 0 });
    const kernAtStartRef = useRef<number>(0);
    const rightGlyphHitBox = useRef<{x: number, y: number, w: number, h: number} | null>(null);

    const zoomRef = useRef(zoom);
    const viewOffsetRef = useRef(viewOffset);

    useEffect(() => { zoomRef.current = zoom; }, [zoom]);
    useEffect(() => { viewOffsetRef.current = viewOffset; }, [viewOffset]);

    // --- Hit Box Calculation ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const leftGlyph = glyphDataMap.get(leftChar.unicode!);
        const rightGlyph = glyphDataMap.get(rightChar.unicode!);
        if (!leftGlyph || !rightGlyph) return;

        const lBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!lBox || !rBox) return;

        const finalScale = baseScale * zoom;
        const tx = (canvas.width / 2) - (750 * finalScale) + viewOffset.x;
        const ty = (canvas.height / 2) - (500 * finalScale) + viewOffset.y;

        const rsbL = leftChar.rsb ?? metrics.defaultRSB;
        const lsbR = rightChar.lsb ?? metrics.defaultLSB;
        const kernNum = parseInt(kernValue, 10) || 0;
        const rightTranslateX = lBox.x + lBox.width + rsbL + kernNum + lsbR - rBox.x;

        const HIT_PADDING = 20 * finalScale; 
        rightGlyphHitBox.current = {
            x: tx + (rightTranslateX + rBox.x) * finalScale - HIT_PADDING,
            y: ty + rBox.y * finalScale - HIT_PADDING,
            w: rBox.width * finalScale + HIT_PADDING * 2,
            h: rBox.height * finalScale + HIT_PADDING * 2
        };
    }, [leftChar, rightChar, glyphDataMap, strokeThickness, metrics, kernValue, zoom, viewOffset, baseScale, canvasRef]);

    const getViewportPoint = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent, touchIndex = 0): Point | null => {
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

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;

        if (e.button === 1 || tool === 'pan') {
            panTool.startPan(viewportPoint, viewOffsetRef.current);
            return;
        }

        const isOverRightGlyph = rightGlyphHitBox.current ? (
            viewportPoint.x >= rightGlyphHitBox.current.x && viewportPoint.x <= rightGlyphHitBox.current.x + rightGlyphHitBox.current.w &&
            viewportPoint.y >= rightGlyphHitBox.current.y && viewportPoint.y <= rightGlyphHitBox.current.y + rightGlyphHitBox.current.h
        ) : false;

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

    // Attached natively (non-passive) so pinch / Ctrl+wheel can't also zoom the page.
    const handleWheel = useCallback((e: WheelEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const zoomFactor = -e.deltaY * 0.001;
        const oldZoom = zoomRef.current;
        const newZoom = Math.max(0.1, Math.min(10, oldZoom * (1 + zoomFactor)));
        // The view is drawn at screen = centre + scale·(world − pivot) + viewOffset (see the draw
        // effect), so keep the point under the cursor fixed relative to the canvas centre.
        const ratio = newZoom / oldZoom;
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const off = viewOffsetRef.current;
        const newViewOffset = {
            x: viewportPoint.x - cx - ratio * (viewportPoint.x - cx - off.x),
            y: viewportPoint.y - cy - ratio * (viewportPoint.y - cy - off.y)
        };
        setZoom(newZoom);
        setViewOffset(newViewOffset);
    }, [getViewportPoint, setZoom, setViewOffset, canvasRef]);
    useNonPassiveWheel(canvasRef, handleWheel);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (tool === 'pan' && e.touches.length > 1) {
            panTool.startPan(getViewportPoint(e)!, viewOffsetRef.current);
            return;
        }
        if (e.touches.length === 1) {
            const viewportPoint = getViewportPoint(e);
            if (!viewportPoint) return;
    
            const isOverRightGlyph = rightGlyphHitBox.current ? (
                viewportPoint.x >= rightGlyphHitBox.current.x && viewportPoint.x <= rightGlyphHitBox.current.x + rightGlyphHitBox.current.w &&
                viewportPoint.y >= rightGlyphHitBox.current.y && viewportPoint.y <= rightGlyphHitBox.current.y + rightGlyphHitBox.current.h
            ) : false;
    
            if (isOverRightGlyph) {
                e.preventDefault();
                setIsDragging(true);
                dragStartPointRef.current = viewportPoint;
                kernAtStartRef.current = parseInt(kernValue, 10) || 0;
            }
        }
    }, [tool, kernValue, getViewportPoint, panTool, viewOffset]);
    
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (panTool.isPanning) {
            panTool.move(getViewportPoint(e)!);
            return;
        }

        if (e.touches.length === 1 && isDragging) {
            e.preventDefault();
            const viewportPoint = getViewportPoint(e);
            if (!viewportPoint) return;
    
            const finalScale = baseScale * zoomRef.current;
            const deltaViewportX = viewportPoint.x - dragStartPointRef.current.x;
            const deltaDesignX = Math.round(deltaViewportX / finalScale);
            onKernChange(String(kernAtStartRef.current + deltaDesignX));
        }
    }, [isDragging, panTool, getViewportPoint, baseScale, onKernChange]);

    const handleTouchEnd = useCallback(() => {
        if (panTool.isPanning) panTool.end();
        setIsDragging(false);
    }, [panTool]);

    return {
        handleMouseDown, handleMouseMove, handleMouseUp,
        handleTouchStart, handleTouchMove, handleTouchEnd,
        isPanning: panTool.isPanning, isDragging
    };
};
