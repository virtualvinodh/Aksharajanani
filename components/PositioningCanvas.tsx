import React, { useRef } from 'react';
import { Point, Path, FontMetrics, AppSettings, Character } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { usePositioningCanvas } from '../hooks/usePositioningCanvas';

interface PositioningCanvasProps {
    width: number;
    height: number;
    markPaths: Path[];
    basePaths: Path[];
    onPathsChange: (paths: Path[]) => void;
    metrics: FontMetrics;
    tool: 'select' | 'pan';
    zoom: number;
    setZoom: (zoom: number) => void;
    viewOffset: Point;
    setViewOffset: (offset: Point) => void;
    settings: AppSettings;
    movementConstraint: 'horizontal' | 'vertical' | 'none';
    canEdit: boolean;
    character: Character;
}

const PositioningCanvas: React.FC<PositioningCanvasProps> = ({
    width, height, markPaths, basePaths, onPathsChange, metrics, tool, zoom, setZoom,
    viewOffset, setViewOffset, settings, movementConstraint, canEdit, character
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    const { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, isPanning, isDragging } = usePositioningCanvas({
        canvasRef, paths: markPaths, onPathsChange, tool, zoom, setZoom, viewOffset, setViewOffset, movementConstraint, canEdit
    });

    React.useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        ctx.save();
        ctx.translate(viewOffset.x, viewOffset.y);
        ctx.scale(zoom, zoom);

        const logicalViewX = -viewOffset.x / zoom;
        const logicalViewWidth = width / zoom;
        const logicalViewY = -viewOffset.y / zoom;
        const logicalViewHeight = height / zoom;

        // --- Snapped High-DPI Grid ---
        ctx.strokeStyle = theme === 'dark' ? 'rgba(74, 85, 104, 0.4)' : 'rgba(209, 213, 219, 0.5)';
        ctx.lineWidth = Math.max(1.0, 1.2 / zoom); 
        const gridSize = 50;
        
        const xMin = Math.floor(logicalViewX / gridSize) * gridSize;
        const xMax = Math.ceil((logicalViewX + logicalViewWidth) / gridSize) * gridSize;
        const yMin = Math.floor(logicalViewY / gridSize) * gridSize;
        const yMax = Math.ceil((logicalViewY + logicalViewHeight) / gridSize) * gridSize;

        for (let x = xMin; x <= xMax; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, yMin);
            ctx.lineTo(x, yMax);
            ctx.stroke();
        }
        for (let y = yMin; y <= yMax; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(xMin, y);
            ctx.lineTo(xMax, y);
            ctx.stroke();
        }

        // --- High Visibility Guide Lines ---
        const guideWidth = 20000;
        const guideStart = -10000;
        
        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        // Enforce baseline density for mobile
        ctx.lineWidth = Math.max(1.8, 2.2 / zoom); 
        
        // Topline (Dashed)
        ctx.setLineDash([12 / zoom, 8 / zoom]);
        ctx.beginPath();
        ctx.moveTo(guideStart, metrics.topLineY);
        ctx.lineTo(guideStart + guideWidth, metrics.topLineY);
        ctx.stroke();
        
        // Baseline (Solid)
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.moveTo(guideStart, metrics.baseLineY);
        ctx.lineTo(guideStart + guideWidth, metrics.baseLineY);
        ctx.stroke();

        // Render Base (Background)
        renderPaths(ctx, basePaths, { 
            color: theme === 'dark' ? '#4A5568' : '#A0AEC0', 
            strokeThickness: settings.strokeThickness 
        });

        // Render Mark (Interactive)
        const markColor = isDragging ? (theme === 'dark' ? '#A78BFA' : '#8B5CF6') : (theme === 'dark' ? '#E2E8F0' : '#1F2937');
        renderPaths(ctx, markPaths, { 
            strokeThickness: settings.strokeThickness, 
            contrast: settings.contrast, 
            color: markColor 
        });

        ctx.restore();
    }, [width, height, markPaths, basePaths, zoom, viewOffset, theme, metrics, settings, isDragging, tool, canEdit]);

    const getCursor = () => {
        if (isPanning) return 'grabbing';
        if (tool === 'pan') return 'grab';
        if (canEdit) return isDragging ? 'grabbing' : 'grab';
        return 'not-allowed';
    };

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="bg-white dark:bg-gray-900 max-w-full max-h-full block mx-auto shadow-inner"
            style={{ touchAction: 'none', cursor: getCursor() }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        />
    );
};

export default React.memo(PositioningCanvas);