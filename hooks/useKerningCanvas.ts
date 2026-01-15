
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Point, Character, GlyphData, FontMetrics } from '../types';
import { VEC } from '../utils/vectorUtils';
import { usePanTool } from './drawingTools/usePanTool';
import { getAccurateGlyphBBox } from '../services/glyphRenderService';

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
