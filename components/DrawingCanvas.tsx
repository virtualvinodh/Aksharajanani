
import React, { useRef, useEffect, useCallback } from 'react';
import { Point, Path, FontMetrics, Tool, AppSettings, GlyphData, CharacterSet, Character, ImageTransform, TransformState, Segment, ComponentTransform } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { VEC } from '../utils/vectorUtils';
import { renderPaths } from '../services/glyphRenderService';
import { useDrawingCanvas } from '../hooks/useDrawingCanvas';
import type { Handle, DraggedPointInfo } from '../hooks/useDrawingCanvas';


interface DrawingCanvasProps {
  width: number;
  height: number;
  paths: Path[];
  onPathsChange: (paths: Path[]) => void;
  metrics: FontMetrics;
  tool: Tool;
  onToolChange?: (tool: Tool) => void;
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
  onMetricsChange?: (lsb: number, rsb: number) => void;
  backgroundPaths?: Path[];
  backgroundPathsColor?: string;
  showBearingGuides?: boolean;
  calligraphyAngle?: 45 | 30 | 15;
  isInitiallyDrawn?: boolean;
  previewTransform?: TransformState | null;
  disableAutoFit?: boolean;
  disableTransformations?: boolean;
  lockedMessage?: string;
  transformMode?: 'all' | 'move-only';
  movementConstraint?: 'horizontal' | 'vertical' | 'none';
  onTransformComponent?: (index: number, action: 'start' | 'move' | 'end', delta: ComponentTransform) => void;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ 
    width, height, paths: initialPaths, onPathsChange, metrics, tool, onToolChange, zoom, setZoom, viewOffset, setViewOffset, 
    settings, currentCharacter, gridConfig, backgroundImage, backgroundImageOpacity, imageTransform, 
    onImageTransformChange, selectedPathIds, onSelectionChange, isImageSelected, onImageSelectionChange, 
    lsb, rsb, onMetricsChange, backgroundPaths, backgroundPathsColor, showBearingGuides = true,
    calligraphyAngle = 45, isInitiallyDrawn = false,
    previewTransform = null, disableAutoFit = false,
    disableTransformations, lockedMessage, transformMode, movementConstraint, onTransformComponent
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  const {
    currentPaths, previewPath, marqueeBox, selectionBox, focusedPathId, selectedPointInfo, bgImageObject, hoveredPathIds,
    handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove,
    handleTouchEnd, handleTouchCancel, handleWheel, handleDoubleClick, getCursor, isMobile, HANDLE_SIZE, handles,
    glyphBBox, hoveredMetric, draggingMetric,
    highlightedPathId
  } = useDrawingCanvas({
    canvasRef, initialPaths, onPathsChange, tool, onToolChange, zoom, setZoom, viewOffset, setViewOffset,
    settings, backgroundImage, imageTransform, onImageTransformChange, selectedPathIds, onSelectionChange,
    isImageSelected, onImageSelectionChange, 
    calligraphyAngle: calligraphyAngle as 45 | 30 | 15,
    lsb, rsb, onMetricsChange, metrics,
    disableAutoFit,
    disableTransformations, lockedMessage, transformMode, movementConstraint,
    currentCharacter,
    onTransformComponent
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
            ctx.moveTo(points[0].x, points[0].y);
            for(let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();
        }
        points.forEach((p, index) => {
            const isSelected = selectedPointInfo?.type === 'freehand' && selectedPointInfo.pathId === path.id && selectedPointInfo.pointIndex === index;
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
            if (!previewTransform) {
                ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
            }
        }
        
        if (handles && !previewTransform) {
            const scaledHandleSize = HANDLE_SIZE / zoom;

            Object.values(handles).forEach((handle: Handle & Point) => {
                if (handle.type === 'rotate') {
                    ctx.save(); ctx.strokeStyle = '#6366F1'; ctx.lineWidth = 1.5 / zoom;
                    const radius = (HANDLE_SIZE / 2 + 10) / zoom;
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
                    ctx.lineWidth = 2 / zoom;
                    const radius = scaledHandleSize * 0.7;
                    ctx.beginPath();
                    ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                } else {
                    ctx.fillStyle = '#6366F1';
                    ctx.strokeStyle = theme === 'dark' ? '#111827' : '#FFFFFF';
                    ctx.lineWidth = 1.5 / zoom;
                    ctx.fillRect(handle.x - scaledHandleSize / 2, handle.y - scaledHandleSize / 2, scaledHandleSize, scaledHandleSize);
                    ctx.strokeRect(handle.x - scaledHandleSize / 2, handle.y - scaledHandleSize / 2, scaledHandleSize, scaledHandleSize);
                }
            });
        }
    }
  }, [marqueeBox, zoom, selectionBox, isImageSelected, imageTransform, handles, HANDLE_SIZE, isMobile, theme, previewTransform]);

  useEffect(() => {
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

    // --- Responsive Grid ---
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

    if (bgImageObject && imageTransform) {
        ctx.save();
        ctx.globalAlpha = backgroundImageOpacity;
        const center = { x: imageTransform.x + imageTransform.width/2, y: imageTransform.y + imageTransform.height/2 };
        ctx.translate(center.x, center.y);
        ctx.rotate(imageTransform.rotation);
        ctx.drawImage(bgImageObject, -imageTransform.width/2, -imageTransform.height/2, imageTransform.width, imageTransform.height);
        ctx.restore();
    }

    // GHOST HINT LOGIC
    if (settings.showGridOutlines && !isInitiallyDrawn) {
      const textColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)';
      const guideFontFamily = getComputedStyle(document.documentElement).getPropertyValue('--guide-font-family').trim() || 'sans-serif';
      const hintSize = settings.gridGhostSize ?? gridConfig.characterNameSize;
      ctx.fillStyle = textColor; ctx.font = `bold ${hintSize}px ${guideFontFamily}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(currentCharacter.label || currentCharacter.name, 500, metrics.baseLineY);
    }
    
    // --- Responsive Guide Lines ---
    const guideWidth = 20000; 
    const guideStart = -10000;
    
    ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
    // Ensure visibility on high-DPI and when zoomed out
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

    // Additional Script-Specific Guides
    if (metrics.superTopLineY || metrics.subBaseLineY) {
        ctx.strokeStyle = theme === 'dark' ? '#A5B4FC' : '#818CF8'; 
        ctx.setLineDash([10 / zoom, 8 / zoom]);
        ctx.lineWidth = Math.max(1.2, 1.5 / zoom);
        if (metrics.superTopLineY) {
            ctx.beginPath();
            ctx.moveTo(guideStart, metrics.superTopLineY);
            ctx.lineTo(guideStart + guideWidth, metrics.superTopLineY);
            ctx.stroke();
        }
        if (metrics.subBaseLineY) {
            ctx.beginPath();
            ctx.moveTo(guideStart, metrics.subBaseLineY);
            ctx.lineTo(guideStart + guideWidth, metrics.subBaseLineY);
            ctx.stroke();
        }
    }

    ctx.setLineDash([]);
    
    if (showBearingGuides && glyphBBox) {
        const PIXELS_PER_FONT_UNIT = 1000 / metrics.unitsPerEm; 
        const lsbVal = lsb ?? metrics.defaultLSB;
        const rsbVal = rsb ?? metrics.defaultRSB;
        const lsbInPixels = lsbVal * PIXELS_PER_FONT_UNIT;
        const rsbInPixels = rsbVal * PIXELS_PER_FONT_UNIT;
        const lsbX = glyphBBox.x - lsbInPixels;
        const rsbX = glyphBBox.x + glyphBBox.width + rsbInPixels;

        // Content BBox
        ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = Math.max(1.0, 1.0 / zoom); 
        ctx.beginPath(); 
        ctx.moveTo(glyphBBox.x, guideStart); ctx.lineTo(glyphBBox.x, guideStart + guideWidth); ctx.stroke();
        ctx.beginPath(); 
        ctx.moveTo(glyphBBox.x + glyphBBox.width, guideStart); ctx.lineTo(glyphBBox.x + glyphBBox.width, guideStart + guideWidth); ctx.stroke();

        // Check for non-spacing
        const isNonSpacing = currentCharacter.advWidth === 0 || currentCharacter.advWidth === '0';

        if (!isNonSpacing) {
            const isLsbActive = hoveredMetric === 'lsb' || draggingMetric === 'lsb';
            ctx.strokeStyle = isLsbActive ? '#10b981' : (theme === 'dark' ? 'rgba(250, 204, 21, 0.5)' : 'rgba(217, 119, 6, 0.6)');
            ctx.lineWidth = (isLsbActive ? 4 : 2) / zoom;
            ctx.setLineDash(isLsbActive ? [] : [8 / zoom, 6 / zoom]);
            ctx.beginPath(); 
            ctx.moveTo(lsbX, guideStart); ctx.lineTo(lsbX, guideStart + guideWidth); 
            ctx.stroke();

            const isRsbActive = hoveredMetric === 'rsb' || draggingMetric === 'rsb';
            ctx.strokeStyle = isRsbActive ? '#10b981' : (theme === 'dark' ? 'rgba(250, 204, 21, 0.5)' : 'rgba(217, 119, 6, 0.6)');
            ctx.lineWidth = (isRsbActive ? 4 : 2) / zoom;
            ctx.setLineDash(isRsbActive ? [] : [8 / zoom, 6 / zoom]);
            ctx.beginPath(); 
            ctx.moveTo(rsbX, guideStart); ctx.lineTo(rsbX, guideStart + guideWidth); 
            ctx.stroke();

            if (draggingMetric) {
                const activeX = draggingMetric === 'lsb' ? lsbX : rsbX;
                const activeVal = draggingMetric === 'lsb' ? lsbVal : rsbVal;
                const label = draggingMetric === 'lsb' ? 'LSB' : 'RSB';
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0); 
                const screenX = (activeX * zoom) + viewOffset.x;
                const screenY = (glyphBBox.y * zoom) + viewOffset.y - 30;
                const text = `${label}: ${Math.round(activeVal)}`;
                ctx.font = 'bold 14px sans-serif';
                const textWidth = ctx.measureText(text).width + 16;
                ctx.fillStyle = theme === 'dark' ? '#1f2937' : '#ffffff';
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(screenX - textWidth/2, screenY - 20, textWidth, 30, 6);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#111827';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, screenX, screenY - 5);
                ctx.restore();
            }
        }
    }

    if (backgroundPaths) {
      renderPaths(ctx, backgroundPaths, { color: backgroundPathsColor || (theme === 'dark' ? '#4A5568' : '#A0AEC0'), strokeThickness: settings.strokeThickness });
    }

    // --- Visual Bounding Box Overlay ---
    if (settings.showBoundingBox && glyphBBox) {
        ctx.save();
        const cyan = '#06b6d4'; // Cyan-500
        ctx.strokeStyle = cyan;
        ctx.lineWidth = 1 / zoom;
        
        // Draw 8 Crosshair Markers (Rectangle outline removed per request)
        ctx.setLineDash([]); 
        const markerSize = 4 / zoom; 
        
        const x1 = glyphBBox.x;
        const x2 = glyphBBox.x + glyphBBox.width / 2;
        const x3 = glyphBBox.x + glyphBBox.width;
        
        const y1 = glyphBBox.y;
        const y2 = glyphBBox.y + glyphBBox.height / 2;
        const y3 = glyphBBox.y + glyphBBox.height;

        const points = [
            { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x3, y: y1 },
            { x: x3, y: y2 }, { x: x3, y: y3 }, { x: x2, y: y3 },
            { x: x1, y: y3 }, { x: x1, y: y2 }
        ];
        
        ctx.beginPath();
        points.forEach(p => {
            // Horizontal line of crosshair
            ctx.moveTo(p.x - markerSize, p.y);
            ctx.lineTo(p.x + markerSize, p.y);
            // Vertical line of crosshair
            ctx.moveTo(p.x, p.y - markerSize);
            ctx.lineTo(p.x, p.y + markerSize);
        });
        ctx.stroke();
        ctx.restore();
    }

    const mainColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
    const highlightColor = theme === 'dark' ? '#A78BFA' : '#8B5CF6'; 

    const hoveredPaths: Path[] = [];
    const selectedNotHoveredPaths: Path[] = [];
    const normalPaths: Path[] = [];
    const highlightedPaths: Path[] = [];
    
    let pathsToRender = currentPaths;
    if (previewTransform && selectionBox && selectedPathIds.size > 0) {
        const { x, y, width, height } = selectionBox;
        const center = { x: x + width / 2, y: y + height / 2 };
        const angleRad = (previewTransform.rotate * Math.PI) / 180;
        
        const sx = (previewTransform.flipX ? -1 : 1) * previewTransform.scale;
        const sy = (previewTransform.flipY ? -1 : 1) * previewTransform.scale;

        pathsToRender = currentPaths.map(p => {
            if (!selectedPathIds.has(p.id)) return p;
            const transformPoint = (pt: Point) => {
                let px = pt.x - center.x;
                let py = pt.y - center.y;
                const rx = px * Math.cos(angleRad) - py * Math.sin(angleRad);
                const ry = px * Math.sin(angleRad) + py * Math.cos(angleRad);
                px = rx * sx;
                py = ry * sy;
                return { x: px + center.x, y: py + center.y };
            };
            const newP = { ...p, points: p.points.map(transformPoint) };
            if (p.segmentGroups) {
                newP.segmentGroups = p.segmentGroups.map(g => g.map(s => {
                    const hInRot = VEC.rotate(s.handleIn, angleRad);
                    const hOutRot = VEC.rotate(s.handleOut, angleRad);
                    const hInTransformed = { x: hInRot.x * sx, y: hInRot.y * sy };
                    const hOutTransformed = { x: hOutRot.x * sx, y: hOutRot.y * sy };
                    return {
                        ...s,
                        point: transformPoint(s.point),
                        handleIn: hInTransformed,
                        handleOut: hOutTransformed
                    };
                }));
            }
            return newP;
        });
    }

    pathsToRender.forEach(path => {
        if (highlightedPathId === path.id) highlightedPaths.push(path);
        if ((tool === 'select' || tool === 'edit') && hoveredPathIds.has(path.id)) hoveredPaths.push(path);
        else if (selectedPathIds.has(path.id)) selectedNotHoveredPaths.push(path);
        else normalPaths.push(path);
    });

    if (highlightedPaths.length > 0) renderPaths(ctx, highlightedPaths, { strokeThickness: settings.strokeThickness + 4, contrast: settings.contrast, color: '#22D3EE' });
    renderPaths(ctx, normalPaths, { strokeThickness: settings.strokeThickness, contrast: settings.contrast, color: mainColor });
    if (selectedNotHoveredPaths.length > 0) renderPaths(ctx, selectedNotHoveredPaths, { strokeThickness: settings.strokeThickness, contrast: settings.contrast, color: highlightColor });
    if (hoveredPaths.length > 0) renderPaths(ctx, hoveredPaths, { strokeThickness: settings.strokeThickness, contrast: settings.contrast, color: highlightColor });
    
    if (tool === 'edit') drawControlPoints(ctx, pathsToRender, focusedPathId, selectedPointInfo);

    if (previewPath) {
        if (tool === 'slice') renderPaths(ctx, [previewPath], { color: '#EF4444', strokeThickness: 2 / zoom, lineDash: [4 / zoom, 4 / zoom] });
        else renderPaths(ctx, [previewPath], { color: theme === 'dark' ? '#6366F1' : '#818CF8', strokeThickness: settings.strokeThickness, contrast: settings.contrast, lineDash: [5, 5] });
    }
    
    if (tool === 'select') drawSelectionUI(ctx);
    ctx.restore();
  }, [currentPaths, previewPath, marqueeBox, selectionBox, width, height, settings, metrics, theme, tool, zoom, viewOffset, currentCharacter, gridConfig, bgImageObject, backgroundImageOpacity, imageTransform, focusedPathId, selectedPointInfo, lsb, rsb, backgroundPaths, backgroundPathsColor, showBearingGuides, drawControlPoints, drawSelectionUI, hoveredPathIds, selectedPathIds, isInitiallyDrawn, previewTransform, glyphBBox, hoveredMetric, draggingMetric, highlightedPathId]);
  
  return (
    <canvas
      ref={canvasRef}
      data-tour="drawing-canvas"
      width={width}
      height={height}
      className="bg-white dark:bg-gray-900 max-w-full max-h-full block mx-auto shadow-inner"
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
