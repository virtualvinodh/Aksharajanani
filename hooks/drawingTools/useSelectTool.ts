
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Point, Path, ImageTransform, Segment } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { VEC } from '../../utils/vectorUtils';
import { getAccurateGlyphBBox, BoundingBox } from '../../services/glyphRenderService';
import { ToolHookProps, TransformAction, Handle, HandleDirection } from './types';

declare var paper: any;

export const useSelectTool = ({
    isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange,
    zoom, settings, imageTransform, onImageTransformChange, selectedPathIds, onSelectionChange,
    isImageSelected, onImageSelectionChange, disableTransformations, transformMode = 'all', movementConstraint = 'none',
    findPathAtPoint
}: ToolHookProps) => {
    const { theme } = useTheme();
    const [selectionBox, setSelectionBox] = useState<BoundingBox | null>(null);
    const [transformAction, setTransformAction] = useState<TransformAction | null>(null);
    const [marqueeBox, setMarqueeBox] = useState<{ start: Point; end: Point } | null>(null);
    const [lastPoint, setLastPoint] = useState<Point | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [hoveredHandle, setHoveredHandle] = useState<Handle | null>(null);


    const HANDLE_SIZE = isMobile ? 20 : 14;
    const ROTATE_HANDLE_OFFSET = isMobile ? 30 : 25;
    const ROTATE_CURSOR_SVG_STRING = (color: string) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.5 12C22.5 17.799 17.799 22.5 12 22.5C6.201 22.5 1.5 17.799 1.5 12C1.5 6.201 6.201 1.5 12 1.5" stroke="${color}" stroke-width="2" stroke-linecap="round"/><path d="M12 4.5V1.5L8.25 5.25" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const ROTATE_CURSOR_URL = `url('data:image/svg+xml;utf8,${encodeURIComponent(ROTATE_CURSOR_SVG_STRING(theme === 'dark' ? 'white' : 'black'))}') 12 12, auto`;

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        setIsMobile(mediaQuery.matches);
        const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
    }, []);

    useEffect(() => {
        if (isImageSelected && imageTransform) {
            setSelectionBox({ x: imageTransform.x, y: imageTransform.y, width: imageTransform.width, height: imageTransform.height });
        } else if (selectedPathIds.size > 0) {
            const selectedPaths = currentPaths.filter(p => selectedPathIds.has(p.id));
            setSelectionBox(getAccurateGlyphBBox(selectedPaths, settings.strokeThickness));
        } else {
            setSelectionBox(null);
        }
    }, [selectedPathIds, currentPaths, isImageSelected, imageTransform, settings.strokeThickness]);

    const isPointOnImage = useCallback((point: Point, transform: ImageTransform) => {
        const center = { x: transform.x + transform.width/2, y: transform.y + transform.height/2 };
        const translatedPoint = VEC.sub(point, center);
        const rotatedPoint = VEC.rotate(translatedPoint, -transform.rotation);
        return Math.abs(rotatedPoint.x) <= transform.width/2 && Math.abs(rotatedPoint.y) <= transform.height/2;
    }, []);

    const getPathHandles = useCallback((box: BoundingBox): ({ [key: string]: Handle & Point }) => {
        const handles: { [key: string]: Handle & Point } = {};
        if (disableTransformations) return handles;
        
        const { x, y, width, height } = box;
        
        if (transformMode === 'move-only') {
            handles.nw = { x, y, direction: 'nw', type: 'move' };
            return handles;
        }

        const cx = x + width / 2;
        const cy = y + height / 2;
    
        handles.nw = { x, y, direction: 'nw', type: isMobile ? 'move' : 'scale' };
        handles.ne = { x: x + width, y, direction: 'ne', type: 'scale' };
        handles.sw = { x, y: y + height, direction: 'sw', type: 'scale' };
        handles.se = { x: x + width, y: y + height, direction: 'se', type: 'scale' };
        handles.n = { x: cx, y, direction: 'n', type: 'scale' };
        handles.s = { x: cx, y: y + height, direction: 's', type: 'scale' };
        handles.w = { x, y: cy, direction: 'w', type: 'scale' };
        handles.e = { x: x + width, y: cy, direction: 'e', type: 'scale' };
    
        handles.rotate = { x: cx, y: y - ROTATE_HANDLE_OFFSET / zoom, direction: 'rotate', type: 'rotate' };
    
        return handles;
    }, [disableTransformations, transformMode, ROTATE_HANDLE_OFFSET, zoom, isMobile]);
    
    const getImageHandles = useCallback((transform: ImageTransform): ({ [key: string]: Handle & Point }) => {
        const { x, y, width, height, rotation } = transform;
        const center = { x: x + width / 2, y: y + height / 2 };
    
        const corners = {
            nw: VEC.add(center, VEC.rotate({ x: -width / 2, y: -height / 2 }, rotation)),
            ne: VEC.add(center, VEC.rotate({ x: width / 2, y: -height / 2 }, rotation)),
            se: VEC.add(center, VEC.rotate({ x: width / 2, y: height / 2 }, rotation)),
            sw: VEC.add(center, VEC.rotate({ x: -width / 2, y: height / 2 }, rotation)),
        };
        
        const middles = {
            n: VEC.add(center, VEC.rotate({ x: 0, y: -height / 2 }, rotation)),
            e: VEC.add(center, VEC.rotate({ x: width / 2, y: 0 }, rotation)),
            s: VEC.add(center, VEC.rotate({ x: 0, y: height / 2 }, rotation)),
            w: VEC.add(center, VEC.rotate({ x: -width / 2, y: 0 }, rotation)),
        };
    
        const rotateHandlePos = VEC.add(center, VEC.rotate({ x: 0, y: -height / 2 - ROTATE_HANDLE_OFFSET / zoom }, rotation));
    
        const handles: { [key: string]: Handle & Point } = {};
        if (disableTransformations) return handles;
    
        if (transformMode === 'move-only') {
            handles.nw = { ...corners.nw, direction: 'nw', type: 'move' };
            return handles;
        }

        handles.nw = { ...corners.nw, direction: 'nw', type: isMobile ? 'move' : 'scale' };
        handles.ne = { ...corners.ne, direction: 'ne', type: 'scale' };
        handles.sw = { ...corners.sw, direction: 'sw', type: 'scale' };
        handles.se = { ...corners.se, direction: 'se', type: 'scale' };
        handles.n = { ...middles.n, direction: 'n', type: 'scale' };
        handles.s = { ...middles.s, direction: 's', type: 'scale' };
        handles.w = { ...middles.w, direction: 'w', type: 'scale' };
        handles.e = { ...middles.e, direction: 'e', type: 'scale' };
    
        handles.rotate = { ...rotateHandlePos, direction: 'rotate', type: 'rotate' };
        
        return handles;
    }, [disableTransformations, transformMode, ROTATE_HANDLE_OFFSET, zoom, isMobile]);

    const handles = useMemo(() => {
        if (isImageSelected && imageTransform) return getImageHandles(imageTransform);
        if (selectionBox) return getPathHandles(selectionBox);
        return null;
    }, [selectionBox, isImageSelected, imageTransform, getImageHandles, getPathHandles]);

    const getHandleAtPoint = useCallback((point: Point): Handle | null => {
        if (!handles) return null;
        const handleSize = HANDLE_SIZE / zoom;
        
        // Check rotate handle first due to different size and offset
        const rotateHandle = (handles as any).rotate;
        if (rotateHandle) {
            if (VEC.len(VEC.sub(point, rotateHandle)) < ((HANDLE_SIZE + 4) / zoom)) {
                return rotateHandle;
            }
        }

        for (const key in handles) {
            const handle = (handles as any)[key];
            if (handle.type === 'scale' || handle.type === 'move') {
                if (VEC.len(VEC.sub(point, handle)) < (handleSize / 1.5)) { // larger touch area for mobile
                    return handle;
                }
            }
        }
        return null;
    }, [handles, zoom, HANDLE_SIZE]);

    const start = (point: Point, e: React.MouseEvent) => {
        const handle = getHandleAtPoint(point);

        if (handle) {
            setIsDrawing(true);
            setTransformAction({
                type: handle.type,
                target: isImageSelected ? 'image' : 'paths',
                startPoint: point,
                initialPaths: currentPaths.map(p => ({...p, points: [...p.points]})), // Deep copy
                initialTransform: imageTransform ? { ...imageTransform } : undefined,
                initialBox: selectionBox!,
                handle: handle.direction,
            });
            return;
        }

        // Check if click is inside an existing selection box first.
        if (selectionBox) {
            let isInside = false;
            if (isImageSelected && imageTransform) {
                isInside = isPointOnImage(point, imageTransform);
            } else {
                isInside = point.x >= selectionBox.x && point.x <= selectionBox.x + selectionBox.width &&
                           point.y >= selectionBox.y && point.y <= selectionBox.y + selectionBox.height;
            }

            if (isInside) {
                // Click is inside the current selection. Start a move operation on the whole selection.
                setIsDrawing(true);
                setTransformAction({
                    type: 'move',
                    target: isImageSelected ? 'image' : 'paths',
                    startPoint: point,
                    initialPaths: currentPaths.map(p => ({...p, points: [...p.points]})),
                    initialTransform: imageTransform ? { ...imageTransform } : undefined,
                    initialBox: selectionBox,
                });
                setLastPoint(point);
                return;
            }
        }

        // If not inside an existing selection, proceed with detecting a new selection.
        if (imageTransform && isPointOnImage(point, imageTransform)) {
            onImageSelectionChange(true);
            onSelectionChange(new Set());
            const imageBox = { x: imageTransform.x, y: imageTransform.y, width: imageTransform.width, height: imageTransform.height };
            setIsDrawing(true);
            setTransformAction({
                type: 'move',
                target: 'image',
                startPoint: point,
                initialTransform: imageTransform,
                initialBox: imageBox,
            });
        } else {
            const clickedPath = findPathAtPoint(point);
            if (clickedPath) {
                const isShift = e.shiftKey;
                const newSelection = isShift ? new Set(selectedPathIds) : new Set<string>();

                if (clickedPath.groupId) {
                    const groupPaths = currentPaths.filter(p => p.groupId === clickedPath.groupId);
                    const groupIds = groupPaths.map(p => p.id);
                    const isAnyInGroupSelected = groupIds.some(id => selectedPathIds.has(id));

                    if (isShift) {
                        if (isAnyInGroupSelected) {
                            groupIds.forEach(id => newSelection.delete(id));
                        } else {
                            groupIds.forEach(id => newSelection.add(id));
                        }
                    } else { // Not shift
                        // Always select the group. If it was already selected, this effectively keeps it selected.
                        // If it wasn't, it selects it and deselects others (since newSelection is fresh).
                        newSelection.clear();
                        groupIds.forEach(id => newSelection.add(id));
                    }
                } else { // Not a grouped path
                    if (isShift) {
                        if (newSelection.has(clickedPath.id)) {
                            newSelection.delete(clickedPath.id);
                        } else {
                            newSelection.add(clickedPath.id);
                        }
                    } else {
                        if (!newSelection.has(clickedPath.id)) {
                             newSelection.clear();
                             newSelection.add(clickedPath.id);
                        }
                    }
                }
                
                onSelectionChange(newSelection);
                onImageSelectionChange(false);
                
                const newSelectedPaths = currentPaths.filter(p => newSelection.has(p.id));
                const box = getAccurateGlyphBBox(newSelectedPaths, settings.strokeThickness);
                if (box) {
                     setIsDrawing(true);
                     setTransformAction({
                         type: 'move', target: 'paths', startPoint: point,
                         initialPaths: currentPaths.map(p => ({...p, points: [...p.points]})), // deep enough copy
                         initialBox: box,
                     });
                }

            } else { // Clicked on empty space
                onSelectionChange(new Set());
                onImageSelectionChange(false);
                setMarqueeBox({ start: point, end: point });
                setIsDrawing(true);
            }
        }
        setLastPoint(point);
    };

    const move = (point: Point) => {
        if (!isDrawing) {
            setHoveredHandle(getHandleAtPoint(point));
            return;
        }

        setLastPoint(point);

        if (marqueeBox) {
            setMarqueeBox(prev => prev ? { ...prev, end: point } : null);
            return;
        }

        if (!transformAction) return;
        
        const { type, target, startPoint, initialPaths, initialTransform, initialBox, handle } = transformAction;

        if (type === 'move') {
            let delta = VEC.sub(point, startPoint);
            
            if (target === 'paths') {
                if (movementConstraint === 'horizontal') {
                    delta.y = 0;
                } else if (movementConstraint === 'vertical') {
                    delta.x = 0;
                }
            }

            if (target === 'paths' && initialPaths) {
                const movedPaths = initialPaths.map(p => {
                    if (selectedPathIds.has(p.id)) {
                        if (p.type === 'outline' && p.segmentGroups) {
                            return {
                                ...p,
                                segmentGroups: p.segmentGroups.map(group => group.map(seg => ({
                                    ...seg,
                                    point: VEC.add(seg.point, delta),
                                })))
                            };
                        }
                        return { ...p, points: p.points.map(pt => VEC.add(pt, delta)) };
                    }
                    return p;
                });
                setCurrentPaths(movedPaths);
            } else if (target === 'image' && initialTransform) {
                onImageTransformChange({
                    ...initialTransform,
                    x: initialTransform.x + delta.x,
                    y: initialTransform.y + delta.y,
                });
            }
        } else if (type === 'rotate') {
            const center = { x: initialBox.x + initialBox.width / 2, y: initialBox.y + initialBox.height / 2 };
            const startVector = VEC.sub(startPoint, center);
            const currentVector = VEC.sub(point, center);
            const angleDelta = Math.atan2(currentVector.y, currentVector.x) - Math.atan2(startVector.y, startVector.x);

            if (target === 'paths' && initialPaths) {
                const rotatedPaths = initialPaths.map(p => {
                    if (selectedPathIds.has(p.id)) {
                        if (p.type === 'outline' && p.segmentGroups) {
                            return {
                                ...p,
                                segmentGroups: p.segmentGroups.map(group => group.map(seg => ({
                                    point: VEC.add(center, VEC.rotate(VEC.sub(seg.point, center), angleDelta)),
                                    handleIn: VEC.rotate(seg.handleIn, angleDelta),
                                    handleOut: VEC.rotate(seg.handleOut, angleDelta),
                                })))
                            };
                        }
                        return {
                            ...p,
                            points: p.points.map(pt => VEC.add(center, VEC.rotate(VEC.sub(pt, center), angleDelta)))
                        };
                    }
                    return p;
                });
                setCurrentPaths(rotatedPaths);
            } else if (target === 'image' && initialTransform) {
                onImageTransformChange({
                    ...initialTransform,
                    rotation: initialTransform.rotation + angleDelta,
                });
            }
        } else if (type === 'scale') {
            if (target === 'paths' && initialPaths) {
                const scaledPaths = initialPaths.map(p => {
                    if (selectedPathIds.has(p.id)) {
                        const delta = VEC.sub(point, startPoint);
                        const sx = initialBox.width !== 0 ? (initialBox.width + (handle.includes('e') ? delta.x : (handle.includes('w') ? -delta.x : 0))) / initialBox.width : 1;
                        const sy = initialBox.height !== 0 ? (initialBox.height + (handle.includes('s') ? delta.y : (handle.includes('n') ? -delta.y : 0))) / initialBox.height : 1;
                        
                        const anchorX = handle.includes('w') ? initialBox.x + initialBox.width : initialBox.x;
                        const anchorY = handle.includes('n') ? initialBox.y + initialBox.height : initialBox.y;
                        
                        const transformPoint = (pt: Point) => {
                            let newPoint = { ...pt };
                            if (handle.includes('e') || handle.includes('w')) newPoint.x = anchorX + (pt.x - anchorX) * sx;
                            if (handle.includes('n') || handle.includes('s')) newPoint.y = anchorY + (pt.y - anchorY) * sy;
                            return newPoint;
                        };

                        if (p.type === 'outline' && p.segmentGroups) {
                            return {
                                ...p,
                                segmentGroups: p.segmentGroups.map(group => group.map(seg => ({
                                    point: transformPoint(seg.point),
                                    handleIn: { x: seg.handleIn.x * sx, y: seg.handleIn.y * sy },
                                    handleOut: { x: seg.handleOut.x * sx, y: seg.handleOut.y * sy }
                                })))
                            };
                        }
                        return { ...p, points: p.points.map(transformPoint) };
                    }
                    return p;
                });
                setCurrentPaths(scaledPaths);
            } else if (target === 'image' && initialTransform) {
                const { rotation, width: iW, height: iH, x: iX, y: iY } = initialTransform;
                const center = { x: iX + iW / 2, y: iY + iH / 2 };

                if (isMobile && handle && ['ne', 'se', 'sw'].includes(handle)) {
                    const corners = {
                        nw: VEC.add(center, VEC.rotate({ x: -iW/2, y: -iH/2 }, rotation)),
                        ne: VEC.add(center, VEC.rotate({ x:  iW/2, y: -iH/2 }, rotation)),
                        sw: VEC.add(center, VEC.rotate({ x: -iW/2, y:  iH/2 }, rotation)),
                        se: VEC.add(center, VEC.rotate({ x:  iW/2, y:  iH/2 }, rotation)),
                    };
                    const oppositeCorner = {
                        ne: corners.sw,
                        sw: corners.ne,
                        se: corners.nw,
                    }[handle as 'ne' | 'se' | 'sw'];
        
                    const startDist = VEC.len(VEC.sub(startPoint, oppositeCorner));
                    const currentDist = VEC.len(VEC.sub(point, oppositeCorner));
                    const scaleFactor = startDist > 1 ? currentDist / startDist : 1;
        
                    const newWidth = iW * scaleFactor;
                    const newHeight = iH * scaleFactor;
        
                    const vectorFromAnchorToCenter = VEC.sub(center, oppositeCorner);
                    const newCenter = VEC.add(oppositeCorner, VEC.scale(vectorFromAnchorToCenter, scaleFactor));
        
                    onImageTransformChange({
                        ...initialTransform,
                        width: Math.max(1, newWidth),
                        height: Math.max(1, newHeight),
                        x: newCenter.x - Math.max(1, newWidth) / 2,
                        y: newCenter.y - Math.max(1, newHeight) / 2,
                    });
                } else {
                    const localPoint = VEC.rotate(VEC.sub(point, center), -rotation);
                    const localStartPoint = VEC.rotate(VEC.sub(startPoint, center), -rotation);
                    const localDelta = VEC.sub(localPoint, localStartPoint);
                    let newWidth = iW; let newHeight = iH;
                    let centerShift = { x: 0, y: 0 };
                    if (handle?.includes('e')) { newWidth += localDelta.x; centerShift.x += localDelta.x / 2; }
                    if (handle?.includes('w')) { newWidth -= localDelta.x; centerShift.x += localDelta.x / 2; }
                    if (handle?.includes('s')) { newHeight += localDelta.y; centerShift.y += localDelta.y / 2; }
                    if (handle?.includes('n')) { newHeight -= localDelta.y; centerShift.y += localDelta.y / 2; }
                    const worldCenterShift = VEC.rotate(centerShift, rotation);
                    const newCenter = VEC.add(center, worldCenterShift);
                    onImageTransformChange({
                        ...initialTransform,
                        width: Math.max(1, newWidth), height: Math.max(1, newHeight),
                        x: newCenter.x - Math.max(1, newWidth) / 2, y: newCenter.y - Math.max(1, newHeight) / 2,
                    });
                }
            }
        }
    };

    const end = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (transformAction) {
            if (transformAction.target === 'paths') {
                onPathsChange(currentPaths);
            }
        } else if (marqueeBox) {
            const endPoint = lastPoint || marqueeBox.end;
            const minX = Math.min(marqueeBox.start.x, endPoint.x);
            const minY = Math.min(marqueeBox.start.y, endPoint.y);
            const maxX = Math.max(marqueeBox.start.x, endPoint.x);
            const maxY = Math.max(marqueeBox.start.y, endPoint.y);
            
            const selectedIds = new Set<string>();
            const groupsFound = new Set<string>();

            currentPaths.forEach(path => {
                const box = getAccurateGlyphBBox([path], settings.strokeThickness);
                if (box && box.x < maxX && box.x + box.width > minX && box.y < maxY && box.y + box.height > minY) {
                    selectedIds.add(path.id);
                    if (path.groupId) {
                        groupsFound.add(path.groupId);
                    }
                }
            });

            if (groupsFound.size > 0) {
                currentPaths.forEach(path => {
                   if (path.groupId && groupsFound.has(path.groupId)) {
                       selectedIds.add(path.id);
                   }
                });
           }

            onSelectionChange(selectedIds);
        }
        
        setTransformAction(null);
        setMarqueeBox(null);
    };

    const getCursor = () => {
        if (isDrawing && transformAction) {
            if (transformAction.type === 'move') return 'grabbing';
            if (transformAction.type === 'rotate') return ROTATE_CURSOR_URL;
        }
        if (hoveredHandle) {
             if (hoveredHandle.type === 'move') return 'grab';
             if (hoveredHandle.type === 'rotate') return ROTATE_CURSOR_URL;
             const dir = hoveredHandle.direction;
             if (dir === 'n' || dir === 's') return 'ns-resize';
             if (dir === 'e' || dir === 'w') return 'ew-resize';
             if (dir === 'nw' || dir === 'se') return 'nwse-resize';
             if (dir === 'ne' || dir === 'sw') return 'nesw-resize';
        }
        if (selectionBox && lastPoint) {
            let isOverSelection = false;
            if (isImageSelected && imageTransform) {
                isOverSelection = isPointOnImage(lastPoint, imageTransform);
            } else if (selectedPathIds.size > 0 && selectionBox) {
                const box = selectionBox;
                if (lastPoint.x > box.x && lastPoint.x < box.x + box.width && lastPoint.y > box.y && lastPoint.y < box.y + box.height) {
                    isOverSelection = true;
                }
            }
            if (isOverSelection) return 'grab';
        }
        return 'default';
    };

    return { start, move, end, getCursor, selectionBox, marqueeBox, handles, isMobile, HANDLE_SIZE };
};
