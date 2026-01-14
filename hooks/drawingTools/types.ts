
import React from 'react';
import { Point, Path, Tool, AppSettings, ImageTransform } from '../../types';
import { BoundingBox } from '../../services/glyphRenderService';

export const generateId = () => `${Date.now()}-${Math.random()}`;

export type HandleType = 'point' | 'handleIn' | 'handleOut';

export interface DraggedFreehandPointInfo {
    pathId: string;
    pointIndex: number;
    type: 'freehand';
}

export interface DraggedSegmentPointInfo {
    pathId: string;
    segmentGroupIndex: number;
    segmentIndex: number;
    handleType: HandleType;
    type: 'segment';
}

export type DraggedPointInfo = DraggedFreehandPointInfo | DraggedSegmentPointInfo;


export type HandleDirection = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w' | 'rotate' | 'move';
export type Handle = { type: 'scale' | 'rotate' | 'move', direction: HandleDirection };

export interface TransformAction {
    type: 'move' | 'scale' | 'rotate';
    target: 'paths' | 'image';
    startPoint: Point;
    initialPaths?: Path[];
    initialTransform?: ImageTransform;
    initialBox: BoundingBox;
    handle?: HandleDirection;
}

export interface UseDrawingCanvasProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    initialPaths: Path[];
    onPathsChange: (paths: Path[]) => void;
    tool: Tool;
    onToolChange?: (tool: Tool) => void;
    zoom: number;
    setZoom: (zoom: number) => void;
    viewOffset: Point;
    setViewOffset: (offset: Point) => void;
    settings: AppSettings;
    backgroundImage: string | null;
    imageTransform: ImageTransform | null;
    onImageTransformChange: (transform: ImageTransform | null) => void;
    selectedPathIds: Set<string>;
    onSelectionChange: (ids: Set<string>) => void;
    isImageSelected: boolean;
    onImageSelectionChange: (isSelected: boolean) => void;
    calligraphyAngle?: 45 | 30 | 15;
    // Positioning specific props removed from here as they move to PositioningCanvas
    previewTransform?: any; 
    lsb?: number;
    rsb?: number;
    onMetricsChange?: (lsb: number, rsb: number) => void;
    metrics?: any; // FontMetrics
    disableAutoFit?: boolean;
    // FIX: Added missing properties to resolve destructuring errors in tool hooks
    disableTransformations?: boolean;
    lockedMessage?: string;
    transformMode?: 'all' | 'move-only';
    movementConstraint?: 'horizontal' | 'vertical' | 'none';
}

export interface ToolHookProps extends UseDrawingCanvasProps {
    isDrawing: boolean;
    setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
    currentPaths: Path[];
    setCurrentPaths: React.Dispatch<React.SetStateAction<Path[]>>;
    previewPath: Path | null;
    setPreviewPath: React.Dispatch<React.SetStateAction<Path | null>>;
    getCanvasPoint: (viewportPoint: Point) => Point;
    showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
    t: (key: string, replacements?: { [key: string]: string | number }) => string;
    findPathAtPoint: (point: Point) => Path | null;
}