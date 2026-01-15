
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

    const { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, isPanning, isDragging } = useKerningCanvas({
        canvasRef, leftChar, rightChar, glyphDataMap, strokeThickness, metrics,
        kernValue, onKernChange, tool, zoom, setZoom, viewOffset, setViewOffset, baseScale
    });

    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        const leftGlyph = glyphDataMap.get(leftChar.unicode!);
        const rightGlyph = glyphDataMap.get(rightChar.unicode!);
        if (!leftGlyph || !rightGlyph) return;

        const lBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!lBox || !rBox) return;

        const finalScale = baseScale * zoom;
        const tx = (width / 2) - (750 * finalScale) + viewOffset.x;
        const ty = (height / 2) - (500 * finalScale) + viewOffset.y;

        // Grid
        ctx.strokeStyle = theme === 'dark' ? 'rgba(74, 85, 104, 0.3)' : 'rgba(209, 213, 219, 0.4)';
        ctx.lineWidth = 1; 
        const gridSize = 50; 
        const scaledGridSize = gridSize * finalScale;
        const xStart = (width / 2 + viewOffset.x) % scaledGridSize; 
        for (let x = xStart; x < width; x += scaledGridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        const yStart = (height / 2 + viewOffset.y) % scaledGridSize; 
        for (let y = yStart; y < height; y += scaledGridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

        const rsbL = leftChar.rsb ?? metrics.defaultRSB;
        const lsbR = rightChar.lsb ?? metrics.defaultLSB;
        const kernNum = parseInt(kernValue, 10) || 0;
        const rightTranslateX = lBox.x + lBox.width + rsbL + kernNum + lsbR - rBox.x;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(finalScale, finalScale);

        // Guides
        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        ctx.lineWidth = 1.5 / finalScale; 
        ctx.setLineDash([8 / finalScale, 6 / finalScale]);
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

        if (showMeasurement) {
            const lSub = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
            const rSub = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
            if (lSub?.xHeight && rSub?.xHeight) {
                const x1 = lSub.xHeight.maxX;
                const x2 = rSub.xHeight.minX + rightTranslateX;
                const ym = (metrics.topLineY + metrics.baseLineY) / 2;
                const dist = Math.abs(x2 - x1);
                const arrowSize = Math.min(8 / finalScale, dist / 3);
                ctx.strokeStyle = '#14b8a6'; 
                ctx.lineWidth = 2 / finalScale; 
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
    }, [width, height, leftChar, rightChar, kernValue, zoom, viewOffset, theme, baseScale, showMeasurement, glyphDataMap, metrics, strokeThickness, isDragging]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="w-full h-full block mx-auto touch-none"
            style={{ cursor: isPanning ? 'grabbing' : (tool === 'pan' ? 'grab' : (isDragging ? 'grabbing' : 'ew-resize')) }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        />
    );
};

export default React.memo(KerningCanvas);
