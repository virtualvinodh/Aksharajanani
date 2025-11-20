
import React, { useRef, useEffect, useCallback } from 'react';
import { Point, Path, FontMetrics, Tool, AppSettings, GlyphData, CharacterSet, Character, ImageTransform } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { VEC } from '../utils/vectorUtils';
import { renderPaths, getAccurateGlyphBBox, BoundingBox } from '../services/glyphRenderService';
import { useDrawingCanvas } from '../hooks/useDrawingCanvas';
import type { Handle, DraggedPointInfo } from '../hooks/useDrawingCanvas';


interface DrawingCanvasProps {
  width: number;
  height: number;
  paths: Path[];
  onPathsChange: (paths: Path[]) => void;
  metrics: FontMetrics;
  tool: Tool;
  zoom: number;
  setZoom: (zoom: number) => void;
  viewOffset: Point;
  setViewOffset: (offset: Point) => void;
  settings: AppSettings;
  allGlyphData: Map<number, GlyphData>;
  allCharacterSets: CharacterSet[];
  currentCharacter: Character;
  gridConfig: { characterNameSize: number };
  backgroundImage: string | null;
  backgroundImageOpacity: number;
  imageTransform: ImageTransform | null;
  onImageTransformChange: (transform: ImageTransform | null) => void;
  selectedPathIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  isImageSelected: boolean;
  onImageSelectionChange: (isSelected: boolean) => void;
  lsb?: number;
  rsb?: number;
  backgroundPaths?: Path[];
  backgroundPathsColor?: string;
  showBearingGuides?: boolean;
  disableTransformations?: boolean;
  calligraphyAngle?: 45 | 30 | 15;
  transformMode?: 'all' | 'move-only';
  movementConstraint?: 'horizontal' | 'vertical' | 'none';
  isInitiallyDrawn?: boolean;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ width, height, paths: initialPaths, onPathsChange, metrics, tool, zoom, setZoom, viewOffset, setViewOffset, settings, currentCharacter, gridConfig, backgroundImage, backgroundImageOpacity, imageTransform, onImageTransformChange, selectedPathIds, onSelectionChange, isImageSelected, onImageSelectionChange, lsb, rsb, backgroundPaths, backgroundPathsColor, showBearingGuides = true, disableTransformations = false, calligraphyAngle = 45, transformMode = 'all', movementConstraint = 'none', isInitiallyDrawn = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  const {
    currentPaths, previewPath, marqueeBox, selectionBox, focusedPathId, selectedPointInfo, bgImageObject, hoveredPathIds,
    handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove,
    handleTouchEnd, handleTouchCancel, handleWheel, handleDoubleClick, getCursor, isMobile, HANDLE_SIZE, handles
  } = useDrawingCanvas({
    canvasRef, initialPaths, onPathsChange, tool, zoom, setZoom, viewOffset, setViewOffset,
    settings, backgroundImage, imageTransform, onImageTransformChange, selectedPathIds, onSelectionChange,
    isImageSelected, onImageSelectionChange, calligraphyAngle, disableTransformations, transformMode, movementConstraint
  });

  const drawControlPoints = useCallback((ctx: CanvasRenderingContext2D, pathsToDraw: Path[], focusedId: string | null, selectedPoint: DraggedPointInfo | null) => {
    const mobileMultiplier = isMobile ? 2.5 : 1;
    const anchorRadiusBase = (4 * mobileMultiplier) / zoom;
    const controlRadiusBase = (3 * mobileMultiplier) / zoom;
    ctx.save();
    
    pathsToDraw.forEach(path => {
        const isFocused = path.id === focusedId;
        const lineAlpha = isFocused ? 0.7 : 0.4;
        const pointAlpha = isFocused ? 1.0 : 0.7;

        if (path.type === 'outline' && path.segmentGroups) {
            path.segmentGroups.forEach((group, groupIndex) => {
                if (group.length < 1) return;
                group.forEach((segment, segmentIndex) => {
                    const anchorPoint = segment.point;
                    const handleInPoint = VEC.add(anchorPoint, segment.handleIn);
                    const handleOutPoint = VEC.add(anchorPoint, segment.handleOut);
                    
                    ctx.strokeStyle = `rgba(107, 114, 128, ${lineAlpha})`;
                    ctx.lineWidth = 1.5 / zoom;
                    ctx.beginPath();
                    ctx.moveTo(handleInPoint.x, handleInPoint.y);
                    ctx.lineTo(anchorPoint.x, anchorPoint.y);
                    ctx.lineTo(handleOutPoint.x, handleOutPoint.y);
                    ctx.stroke();

                    const isAnchorSelected = selectedPoint?.type === 'segment' && selectedPoint.pathId === path.id && selectedPoint.segmentGroupIndex === groupIndex && selectedPoint.segmentIndex === segmentIndex && selectedPoint.handleType === 'point';
                    const isHandleInSelected = selectedPoint?.type === 'segment' && selectedPoint.pathId === path.id && selectedPoint.segmentGroupIndex === groupIndex && selectedPoint.segmentIndex === segmentIndex && selectedPoint.handleType === 'handleIn';
                    const isHandleOutSelected = selectedPoint?.type === 'segment' && selectedPoint.pathId === path.id && selectedPoint.segmentGroupIndex === groupIndex && selectedPoint.segmentIndex === segmentIndex && selectedPoint.handleType === 'handleOut';
                    const controlRadius = isFocused ? controlRadiusBase * 1.2 : controlRadiusBase;
                    const anchorRadius = isFocused ? anchorRadiusBase * 1.2 : anchorRadiusBase;
                    
                    ctx.fillStyle = isHandleInSelected ? `rgba(99, 102, 241, ${pointAlpha})` : `rgba(251, 191, 36, ${pointAlpha})`;
                    ctx.strokeStyle = `rgba(0, 0, 0, ${pointAlpha / 2})`;
                    ctx.beginPath();
                    ctx.arc(handleInPoint.x, handleInPoint.y, isHandleInSelected ? controlRadius * 1.5 : controlRadius, 0, Math.PI * 2);
                    ctx.fill(); ctx.stroke();
                    
                    ctx.fillStyle = isHandleOutSelected ? `rgba(99, 102, 241, ${pointAlpha})` : `rgba(251, 191, 36, ${pointAlpha})`;
                    ctx.beginPath();
                    ctx.arc(handleOutPoint.x, handleOutPoint.y, isHandleOutSelected ? controlRadius * 1.5 : controlRadius, 0, Math.PI * 2);
                    ctx.fill(); ctx.stroke();
                    
                    ctx.fillStyle = isAnchorSelected ? `rgba(99, 102, 241, ${pointAlpha})` : `rgba(239, 68, 68, ${pointAlpha})`;
                    const ar = isAnchorSelected ? anchorRadius * 1.5 : anchorRadius;
                    ctx.beginPath();
                    ctx.rect(anchorPoint.x - ar, anchorPoint.y - ar, ar * 2, ar * 2);
                    ctx.fill(); ctx.stroke();
                });
            });
            return;
        }

        const { points, type } = path;
        if (!points || points.length < 1) return;
        const anchorRadius = isFocused ? anchorRadiusBase * 1.2 : anchorRadiusBase;
        const controlRadius = isFocused ? controlRadiusBase * 1.2 : controlRadiusBase;
        
        if (points.length >= 2) {
            ctx.strokeStyle = `rgba(107, 114, 128, ${lineAlpha})`;
            ctx.lineWidth = 1.5 / zoom;
            ctx.beginPath();
            if (type === 'curve') {
                ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y); ctx.lineTo(points[2].x, points[2].y);
            } else if (type === 'pen') {
                for (let i = 1; i < points.length - 2; i++) {
                    const xc = (points[i].x + points[i + 1].x) / 2;
                    const yc = (points[i].y + points[i + 1].y) / 2;
                    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
                }
                const lastP0 = { x: (points[points.length - 3].x + points[points.length - 2].x) / 2, y: (points[points.length - 3].y + points[points.length - 2].y) / 2 };
                ctx.moveTo(lastP0.x, lastP0.y); ctx.lineTo(points[points.length - 2].x, points[points.length - 2].y); ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
            } else {
                ctx.moveTo(points[0].x, points[0].y);
                for(let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        }
        points.forEach((p, index) => {
            const isSelected = selectedPoint?.type === 'freehand' && selectedPoint.pathId === path.id && selectedPoint.pointIndex === index;
            let isControlPoint = (type === 'pen' && index > 0 && index < points.length - 1) || (type === 'curve' && index === 1);
            if (isControlPoint) {
                ctx.fillStyle = isSelected ? `rgba(99, 102, 241, ${pointAlpha})` : `rgba(251, 191, 36, ${pointAlpha})`;
                ctx.strokeStyle = `rgba(0, 0, 0, ${pointAlpha / 2})`;
                ctx.beginPath();
                const currentControlRadius = isSelected ? controlRadius * 1.5 : controlRadius;
                ctx.rect(p.x - currentControlRadius, p.y - currentControlRadius, currentControlRadius * 2, currentControlRadius * 2);
                ctx.fill(); ctx.stroke();
            } else {
                ctx.fillStyle = isSelected ? `rgba(99, 102, 241, ${pointAlpha})` : `rgba(239, 68, 68, ${pointAlpha})`;
                ctx.strokeStyle = `rgba(0, 0, 0, ${pointAlpha / 2})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, isSelected ? anchorRadius * 1.5 : anchorRadius, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
            }
        });
    });
    ctx.restore();
  }, [zoom, isMobile]);

  const drawSelectionUI = useCallback((ctx: CanvasRenderingContext2D) => {
    if (marqueeBox) {
        ctx.strokeStyle = '#6366F1'; ctx.lineWidth = 1 / zoom; ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.strokeRect(marqueeBox.start.x, marqueeBox.start.y, marqueeBox.end.x - marqueeBox.start.x, marqueeBox.end.y - marqueeBox.start.y);
        ctx.setLineDash([]);
    }
    if (selectionBox) {
        if (transformMode === 'move-only' && !isImageSelected) {
            ctx.strokeStyle = '#4f46e5'; // A darker indigo for locked state
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([8 / zoom, 6 / zoom]);
            ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
        } else {
            ctx.strokeStyle = '#6366F1'; 
            ctx.lineWidth = 1 / zoom; 
            ctx.setLineDash([]);
            if (isImageSelected && imageTransform) {
                ctx.save();
                const center = {x: imageTransform.x + imageTransform.width/2, y: imageTransform.y + imageTransform.height/2};
                ctx.translate(center.x, center.y);
                ctx.rotate(imageTransform.rotation);
                ctx.strokeRect(-imageTransform.width/2, -imageTransform.height/2, imageTransform.width, imageTransform.height);
                ctx.restore();
            } else {
                ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
            }
        }
        ctx.setLineDash([]);
        
        if (handles && transformMode !== 'move-only') {
            const mobileMultiplier = isMobile ? 3 : 1;
            const adjustedHandleSize = HANDLE_SIZE * mobileMultiplier;
            const scaledHandleSize = adjustedHandleSize / zoom;

            Object.values(handles).forEach((handle: Handle & Point) => {
                if (handle.type === 'rotate') {
                    ctx.save(); ctx.strokeStyle = '#6366F1'; ctx.lineWidth = 1.5 / zoom;
                    const radius = (adjustedHandleSize + 2) / zoom;
                    ctx.beginPath(); ctx.arc(handle.x, handle.y, radius, 0.25 * Math.PI, 1.9 * Math.PI); ctx.stroke();
                    const arrowAngle = 1.9 * Math.PI; const arrowSize = 6 / zoom;
                    const arrowX = handle.x + radius * Math.cos(arrowAngle); const arrowY = handle.y + radius * Math.sin(arrowAngle);
                    ctx.beginPath(); ctx.moveTo(arrowX, arrowY);
                    ctx.lineTo(arrowX - arrowSize * Math.cos(arrowAngle - Math.PI / 6), arrowY - arrowSize * Math.sin(arrowAngle - Math.PI / 6));
                    ctx.moveTo(arrowX, arrowY);
                    ctx.lineTo(arrowX - arrowSize * Math.cos(arrowAngle + Math.PI / 6), arrowY - arrowSize * Math.sin(arrowAngle + Math.PI / 6));
                    ctx.stroke(); ctx.restore();
                } else if (handle.type === 'move') {
                    ctx.fillStyle = '#6366F1';
                    ctx.strokeStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
                    ctx.lineWidth = 2 / zoom; // Thicker line for circle
                    const radius = scaledHandleSize * 0.7; // Make the circle a bit bigger for touch
                    ctx.beginPath();
                    ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                } else { // All other scale handles
                    ctx.fillStyle = '#6366F1';
                    ctx.strokeStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
                    ctx.lineWidth = 1.5 / zoom;
                    ctx.fillRect(handle.x - scaledHandleSize / 2, handle.y - scaledHandleSize / 2, scaledHandleSize, scaledHandleSize);
                    ctx.strokeRect(handle.x - scaledHandleSize / 2, handle.y - scaledHandleSize / 2, scaledHandleSize, scaledHandleSize);
                }
            });
        }
    }
  }, [marqueeBox, zoom, selectionBox, isImageSelected, imageTransform, handles, HANDLE_SIZE, isMobile, theme, transformMode]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, width, height);
    
    ctx.strokeStyle = theme === 'dark' ? 'rgba(74, 85, 104, 0.5)' : 'rgba(209, 213, 219, 0.7)';
    ctx.lineWidth = 1; const gridSize = 50; const scaledGridSize = gridSize * zoom;
    const xStart = viewOffset.x % scaledGridSize; for (let x = xStart; x < width; x += scaledGridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    const yStart = viewOffset.y % scaledGridSize; for (let y = yStart; y < height; y += scaledGridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    
    ctx.save();
    ctx.translate(viewOffset.x, viewOffset.y);
    ctx.scale(zoom, zoom);
    
    const logicalViewX = -viewOffset.x / zoom;
    const logicalViewWidth = width / zoom;
    const logicalViewY = -viewOffset.y / zoom;
    const logicalViewHeight = height / zoom;

    if (bgImageObject && imageTransform) {
        ctx.save();
        ctx.globalAlpha = backgroundImageOpacity;
        const center = { x: imageTransform.x + imageTransform.width/2, y: imageTransform.y + imageTransform.height/2 };
        ctx.translate(center.x, center.y);
        ctx.rotate(imageTransform.rotation);
        ctx.drawImage(bgImageObject, -imageTransform.width/2, -imageTransform.height/2, imageTransform.width, imageTransform.height);
        ctx.restore();
    }

    // The parent controls this state via the prop, ensuring guides don't disappear until explicitly redrawn
    if (settings.showGridOutlines && !isInitiallyDrawn) {
      const textColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
      const guideFontFamily = getComputedStyle(document.documentElement).getPropertyValue('--guide-font-family').trim() || 'sans-serif';
      ctx.fillStyle = textColor; ctx.font = `bold ${gridConfig.characterNameSize}px ${guideFontFamily}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(currentCharacter.name, width / 2, metrics.baseLineY);
    }
    
    // Draw main guides
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

    // Draw optional super/sub guides
    if (metrics.superTopLineY || metrics.subBaseLineY) {
        ctx.strokeStyle = theme === 'dark' ? '#6366f1' : '#a5b4fc'; // Lighter Indigo
        ctx.setLineDash([8 / zoom, 6 / zoom]);
        if (metrics.superTopLineY) {
            ctx.beginPath();
            ctx.moveTo(logicalViewX, metrics.superTopLineY);
            ctx.lineTo(logicalViewX + logicalViewWidth, metrics.superTopLineY);
            ctx.stroke();
        }
        if (metrics.subBaseLineY) {
            ctx.beginPath();
            ctx.moveTo(logicalViewX, metrics.subBaseLineY);
            ctx.lineTo(logicalViewX + logicalViewWidth, metrics.subBaseLineY);
            ctx.stroke();
        }
    }

    ctx.setLineDash([]);
    
    if (showBearingGuides && settings.editorMode === 'advanced') {
        const allVisiblePaths = [...(backgroundPaths || []), ...currentPaths];
        if (allVisiblePaths.length > 0) {
            const glyphBBox = getAccurateGlyphBBox(allVisiblePaths, settings.strokeThickness);
            if (glyphBBox) {
                ctx.save();
                const PIXELS_PER_FONT_UNIT = width / metrics.unitsPerEm;
                const lsbInPixels = (lsb ?? metrics.defaultLSB) * PIXELS_PER_FONT_UNIT;
                const rsbInPixels = (rsb ?? metrics.defaultRSB) * PIXELS_PER_FONT_UNIT;

                ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                ctx.lineWidth = 1 / zoom; ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(glyphBBox.x, logicalViewY); ctx.lineTo(glyphBBox.x, logicalViewY + logicalViewHeight); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(glyphBBox.x + glyphBBox.width, logicalViewY); ctx.lineTo(glyphBBox.x + glyphBBox.width, logicalViewY + logicalViewHeight); ctx.stroke();

                ctx.strokeStyle = theme === 'dark' ? 'rgba(250, 204, 21, 0.4)' : 'rgba(217, 119, 6, 0.5)';
                ctx.lineWidth = 1.5 / zoom; ctx.setLineDash([6 / zoom, 4 / zoom]);
                ctx.beginPath(); ctx.moveTo(glyphBBox.x - lsbInPixels, logicalViewY); ctx.lineTo(glyphBBox.x - lsbInPixels, logicalViewY + logicalViewHeight); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(glyphBBox.x + glyphBBox.width + rsbInPixels, logicalViewY); ctx.lineTo(glyphBBox.x + glyphBBox.width + rsbInPixels, logicalViewY + logicalViewHeight); ctx.stroke();
                ctx.restore();
            }
        }
    }

    if (backgroundPaths) {
      renderPaths(ctx, backgroundPaths, { color: backgroundPathsColor || (theme === 'dark' ? '#4A5568' : '#A0AEC0'), strokeThickness: settings.strokeThickness });
    }

    const mainColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
    const highlightColor = theme === 'dark' ? '#A78BFA' : '#8B5CF6'; // For both hover and selection

    const hoveredPaths: Path[] = [];
    const selectedNotHoveredPaths: Path[] = [];
    const normalPaths: Path[] = [];
    
    currentPaths.forEach(path => {
        if ((tool === 'select' || tool === 'edit') && hoveredPathIds.has(path.id)) {
            hoveredPaths.push(path);
        } else if (selectedPathIds.has(path.id)) {
            selectedNotHoveredPaths.push(path);
        } else {
            normalPaths.push(path);
        }
    });

    // Render in layers: normal -> selected -> hovered
    renderPaths(ctx, normalPaths, { strokeThickness: settings.strokeThickness, color: mainColor });
    if (selectedNotHoveredPaths.length > 0) {
        renderPaths(ctx, selectedNotHoveredPaths, { strokeThickness: settings.strokeThickness, color: highlightColor });
    }
    if (hoveredPaths.length > 0) {
        renderPaths(ctx, hoveredPaths, { strokeThickness: settings.strokeThickness, color: highlightColor });
    }
    
    if (tool === 'edit') {
      drawControlPoints(ctx, currentPaths, focusedPathId, selectedPointInfo);
    }

    if (previewPath) renderPaths(ctx, [previewPath], { color: theme === 'dark' ? '#6366F1' : '#818CF8', strokeThickness: settings.strokeThickness, lineDash: [5, 5] });
    
    if (tool === 'select') drawSelectionUI(ctx);

    ctx.restore();
  }, [currentPaths, previewPath, marqueeBox, selectionBox, width, height, settings, metrics, theme, tool, zoom, viewOffset, currentCharacter, gridConfig, bgImageObject, backgroundImageOpacity, imageTransform, focusedPathId, selectedPointInfo, lsb, rsb, backgroundPaths, backgroundPathsColor, showBearingGuides, drawControlPoints, drawSelectionUI, hoveredPathIds, selectedPathIds, isInitiallyDrawn]);
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 max-w-full max-h-full"
      style={{ touchAction: 'none', cursor: getCursor() }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    />
  );
};

export default React.memo(DrawingCanvas);
