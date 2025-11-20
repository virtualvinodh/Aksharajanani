import { useState } from 'react';
import { Point, Path } from '../../types';
import { VEC } from '../../utils/vectorUtils';
import { generateId, ToolHookProps } from './types';

export const useCurveTool = ({ isDrawing, setIsDrawing, currentPaths, onPathsChange, previewPath, setPreviewPath }: ToolHookProps) => {
    // curvePoints length determines the stage: 0=idle, 1=start_set, 2=end_set (placing control)
    const [curvePoints, setCurvePoints] = useState<Point[]>([]);

    const start = (point: Point) => { // Mouse Down
        if (curvePoints.length === 2) {
            // Stage 3: Click to set the control point and finalize.
            const finalCurvePath: Path = { id: generateId(), type: 'curve', points: [curvePoints[0], point, curvePoints[1]] };
            onPathsChange([...currentPaths, finalCurvePath]);
            setCurvePoints([]);
            setPreviewPath(null);
        } else {
            // Stage 1: Press to set the start point.
            setIsDrawing(true);
            setCurvePoints([point]);
        }
    };

    const move = (point: Point) => { // Mouse Move
        if (curvePoints.length === 2) {
            // Stage 3 Preview: Moving mouse (no button down) to position control point.
            setPreviewPath({ id: 'preview', type: 'curve', points: [curvePoints[0], point, curvePoints[1]] });
        } else if (isDrawing && curvePoints.length === 1) {
            // Stage 2 Preview: Dragging to set the end point.
            setPreviewPath({ id: 'preview', type: 'line', points: [curvePoints[0], point] });
        }
    };

    const end = () => { // Mouse Up
        if (isDrawing && curvePoints.length === 1) { // Finished dragging to set end point.
            if (previewPath && previewPath.points.length === 2) {
                const endPoint = previewPath.points[1];
                if (VEC.len(VEC.sub(endPoint, curvePoints[0])) > 2) { // Check it was a drag
                    setCurvePoints(prev => [...prev, endPoint]);
                } else { // Was a click, not a drag. Reset.
                    setCurvePoints([]);
                    setPreviewPath(null);
                }
            }
            setIsDrawing(false); // Mouse is up, but interaction continues for control point.
        }
    };
    
    // Exposed for useDrawingCanvas to know when to listen for mouse move
    const isPlacingControlPoint = curvePoints.length === 2;
    const getCursor = () => isPlacingControlPoint ? 'pointer' : 'crosshair';

    return { start, move, end, getCursor, isPlacingControlPoint };
};
