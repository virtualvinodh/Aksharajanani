
import { useState } from 'react';
import { Point, Path } from '../../types';
import { generateId, ToolHookProps } from './types';

export const useShapeTool = ({ isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, tool, previewPath, setPreviewPath }: ToolHookProps) => {
    const [startPoint, setStartPoint] = useState<Point | null>(null);

    const start = (point: Point) => {
        setIsDrawing(true);
        setStartPoint(point);
    };

    const move = (point: Point) => {
        if (!isDrawing || !startPoint) return;

        if (tool === 'line') {
            setPreviewPath({ id: 'preview', type: 'line', points: [startPoint, point] });
        } else if (tool === 'dot') {
            setPreviewPath({ id: 'preview', type: 'dot', points: [startPoint, point] });
        } else if (tool === 'circle' || tool === 'ellipse') {
            const rx = Math.abs(point.x - startPoint.x);
            const ry = tool === 'circle' ? rx : Math.abs(point.y - startPoint.y);
            const segments = Math.max(16, Math.floor(Math.max(rx, ry) / 2));
            const points: Point[] = [];
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * 2 * Math.PI;
                points.push({ x: startPoint.x + rx * Math.cos(angle), y: startPoint.y + ry * Math.sin(angle) });
            }
            setPreviewPath({ id: 'preview', type: tool, points });
        }
    };

    const end = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (previewPath) {
            const newPath = { ...previewPath, id: generateId() };
            const finalPaths = [...currentPaths, newPath];
            setCurrentPaths(finalPaths);
            onPathsChange(finalPaths);
        }
        
        setPreviewPath(null);
        setStartPoint(null);
    };

    return { start, move, end };
};
