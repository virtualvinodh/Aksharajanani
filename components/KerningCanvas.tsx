
import React, { useRef, useEffect } from 'react';
import { Point, FontMetrics, AppSettings, Character, GlyphData } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox, getGlyphSubBBoxes } from '../services/glyphRenderService';
import { useKerningCanvas } from '../hooks/useKerningCanvas';

interface KerningCanvasProps {
    width: number;
    height: number;
    leftChar: Character;
    rightChar: Character;
    glyphDataMap: Map<number, GlyphData>;
    kernValue: string;
    onKernChange: (val: string) => void;
    metrics: FontMetrics;
    tool: 'select' | 'pan';
    zoom: number;
    setZoom: (zoom: number) => void;
    viewOffset: Point;
    setViewOffset: (offset: Point) => void;
    settings: AppSettings;
    baseScale: number;
    strokeThickness: number;
    showMeasurement: boolean;
}

const KerningCanvas: React.FC<KerningCanvasProps> = ({
    width, height, leftChar, rightChar, glyphDataMap, kernValue, onKernChange, 
    metrics, tool, zoom, setZoom, viewOffset, setViewOffset, settings, baseScale, 
    strokeThickness, showMeasurement
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    const { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, isPanning, isDragging, handleTouchStart, handleTouchMove, handleTouchEnd } = useKerningCanvas({
        canvasRef, leftChar, rightChar, glyphDataMap, strokeThickness, metrics,
        kernValue, onKernChange, tool, zoom, setZoom, viewOffset, setViewOffset, baseScale
    });

    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        // Safety check: If scale is 0 or invalid (e.g. initial render before measurement), abort drawing to prevent division by zero errors.
        const finalScale = baseScale * zoom;
        if (!finalScale || finalScale <= 0 || !isFinite(finalScale)) return;

        const leftGlyph = glyphDataMap.get(leftChar.unicode!);
        const rightGlyph = glyphDataMap.get(rightChar.unicode!);
        if (!leftGlyph || !rightGlyph) return;

        const lBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!lBox || !rBox) return;

        
        // Centering origin: Middle of the canvas
        const cx = width / 2;
        const cy = height / 2;
        
        // Logical center in font units for the viewport calculation is (750, 500)
        // Shift tx/ty to match the session's coordinate logic
        const tx = cx + viewOffset.x;
        const ty = cy + viewOffset.y;

        // --- Snapped High-DPI Grid ---
        ctx.strokeStyle = theme === 'dark' ? 'rgba(74, 85, 104, 0.3)' : 'rgba(209, 213, 219, 0.4)';
        ctx.lineWidth = Math.max(1, 0.8 / zoom); 
        const gridSize = 50; 
        const scaledGridSize = gridSize * finalScale;
        const xStart = tx % scaledGridSize; 
        for (let x = xStart; x < width; x += scaledGridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        const yStart = ty % scaledGridSize; 
        for (let y = yStart; y < height; y += scaledGridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

        const rsbL = leftChar.rsb ?? metrics.defaultRSB;
        const lsbR = rightChar.lsb ?? metrics.defaultLSB;
        const kernNum = parseInt(kernValue, 10) || 0;
        const rightTranslateX = lBox.x + lBox.width + rsbL + kernNum + lsbR - rBox.x;

        ctx.save();
        // Transformation stack: Translate to viewport offset, apply scale, then translate to match logical 0,0
        ctx.translate(tx, ty);
        ctx.scale(finalScale, finalScale);
        ctx.translate(-750, -500); // Shift so logical (750, 500) is the pivot

        // Guides
        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        ctx.lineWidth = Math.max(2.0, 2.5 / zoom); 
        // Use safe division just in case, though guard clause above handles most cases
        ctx.setLineDash([12 / zoom, 8 / zoom]);
        ctx.beginPath(); ctx.moveTo(-500, metrics.topLineY); ctx.lineTo(2000, metrics.topLineY); ctx.stroke();
        ctx.beginPath(); ctx.setLineDash([]); ctx.moveTo(-500, metrics.baseLineY); ctx.lineTo(2000, metrics.baseLineY); ctx.stroke();

        const referenceGrey = theme === 'dark' ? '#4B5563' : '#94A3B8';
        const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
        const rightColor = isDragging ? (theme === 'dark' ? '#A78BFA' : '#8B5CF6') : glyphColor;

        renderPaths(ctx, leftGlyph.paths, { strokeThickness, color: referenceGrey });

        ctx.save();
        ctx.translate(rightTranslateX, 0);
        renderPaths(ctx, rightGlyph.paths, { strokeThickness, color: rightColor });
        ctx.restore();

        // --- Debug Kerning Bounding Boxes ---
        if (settings.isDebugKerningEnabled) {
            ctx.save();
            ctx.setLineDash([4 / finalScale, 4 / finalScale]); 
            ctx.lineWidth = 1 / finalScale; // Hairline

            const drawDebugBox = (bbox: { minX: number, maxX: number, minY: number, maxY: number } | null, color: string) => {
                if (!bbox) return;
                ctx.strokeStyle = color;
                ctx.strokeRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
            };

            const lSub = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
            if (lSub) {
                drawDebugBox(lSub.ascender, '#3b82f6'); // Blue (Ascender)
                drawDebugBox(lSub.xHeight, '#22c55e');  // Green (X-Height)
                drawDebugBox(lSub.descender, '#ef4444'); // Red (Descender)
            }

            const rSub = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
            if (rSub) {
                ctx.save();
                ctx.translate(rightTranslateX, 0);
                drawDebugBox(rSub.ascender, '#3b82f6');
                drawDebugBox(rSub.xHeight, '#22c55e');
                drawDebugBox(rSub.descender, '#ef4444');
                ctx.restore();
            }
            ctx.restore();
        }

        if (showMeasurement) {
            const lSub = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
            const rSub = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
            if (lSub?.xHeight && rSub?.xHeight) {
                const x1 = lSub.xHeight.maxX;
                const x2 = rSub.xHeight.minX + rightTranslateX;
                const ym = (metrics.topLineY + metrics.baseLineY) / 2;
                const dist = Math.abs(x2 - x1);
                const arrowSize = Math.min(12 / zoom, dist / 3);
                ctx.strokeStyle = '#14b8a6'; 
                ctx.lineWidth = 3 / zoom; 
                ctx.beginPath();
                ctx.moveTo(x1, ym); ctx.lineTo(x2, ym);
                if (dist > arrowSize * 2) {
                    ctx.moveTo(x1 + arrowSize, ym - arrowSize/2); ctx.lineTo(x1, ym); ctx.lineTo(x1 + arrowSize, ym + arrowSize/2);
                    ctx.moveTo(x2 - arrowSize, ym - arrowSize/2); ctx.lineTo(x2, ym); ctx.lineTo(x2 - arrowSize, ym + arrowSize/2);
                }
                ctx.stroke();
            }
        }
        ctx.restore();
    }, [width, height, leftChar, rightChar, kernValue, zoom, viewOffset, theme, baseScale, showMeasurement, glyphDataMap, metrics, strokeThickness, isDragging, settings.isDebugKerningEnabled]);

    return (
        <canvas
            ref={canvasRef}
            data-tour="kerning-canvas"
            width={width}
            height={height}
            className="w-full h-full block mx-auto touch-none"
            style={{ cursor: isPanning ? 'grabbing' : (tool === 'pan' ? 'grab' : (isDragging ? 'grabbing' : 'ew-resize')) }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onWheel={handleWheel}
        />
    );
};

export default React.memo(KerningCanvas);
