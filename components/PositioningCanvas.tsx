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

        // Draw Grid
        ctx.strokeStyle = theme === 'dark' ? 'rgba(74, 85, 104, 0.5)' : 'rgba(209, 213, 219, 0.7)';
        ctx.lineWidth = 1; 
        const gridSize = 50; 
        const scaledGridSize = gridSize * zoom;
        const xStart = viewOffset.x % scaledGridSize; 
        for (let x = xStart; x < width; x += scaledGridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        const yStart = viewOffset.y % scaledGridSize; 
        for (let y = yStart; y < height; y += scaledGridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

        ctx.save();
        ctx.translate(viewOffset.x, viewOffset.y);
        ctx.scale(zoom, zoom);

        const logicalViewX = -viewOffset.x / zoom;
        const logicalViewWidth = width / zoom;

        // Draw Guides
        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([8 / zoom, 6 / zoom]);
        ctx.beginPath();
        ctx.moveTo(logicalViewX, metrics.topLineY);
        ctx.lineTo(logicalViewX + logicalViewWidth, metrics.topLineY);
        ctx.stroke();
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.moveTo(logicalViewX, metrics.baseLineY);
        ctx.lineTo(logicalViewX + logicalViewWidth, metrics.baseLineY);
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

        // Highlight if selected/draggable
        if (tool === 'select' && canEdit) {
            ctx.strokeStyle = '#6366F1'; 
            ctx.lineWidth = 1 / zoom; 
            ctx.setLineDash([4 / zoom, 4 / zoom]);
            // Simplified selection box for the mark group
            const markBbox = (markPaths.length > 0) ? (canvasRef.current && (markPaths as any)._bbox || null) : null;
            // Note: In real use, we'd calculate bbox here or pass it in.
        }

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
            className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 max-w-full max-h-full block mx-auto shadow-inner"
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