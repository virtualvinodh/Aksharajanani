import { Path } from '../../types';
import { simplifyPath } from '../../utils/pathUtils';
import { generateId, ToolHookProps } from './types';

export const usePenTool = ({ isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, settings, calligraphyAngle, tool }: ToolHookProps) => {
    
    const start = (point: any) => {
        setIsDrawing(true);
        const newPath: Path = { id: generateId(), type: tool === 'calligraphy' ? 'calligraphy' : 'pen', points: [point] };
        if (newPath.type === 'calligraphy') {
            newPath.angle = calligraphyAngle;
        }
        setCurrentPaths(prev => [...prev, newPath]);
    };

    const move = (point: any) => {
        if (!isDrawing) return;
        setCurrentPaths(prev => {
            const newPaths = [...prev];
            if (newPaths.length > 0) {
                newPaths[newPaths.length - 1].points.push(point);
            }
            return newPaths;
        });
    };

    const end = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        const lastPath = currentPaths[currentPaths.length - 1];
        if (!lastPath) {
            return;
        }
        
        if (lastPath.points.length === 1) {
            const finalPaths = [...currentPaths];
            // This was a click, not a drag. Convert it to a dot.
            finalPaths[finalPaths.length - 1] = { ...lastPath, type: 'dot' };
            setCurrentPaths(finalPaths);
            onPathsChange(finalPaths);
        } else if (lastPath.points.length > 1) {
            let finalPaths = [...currentPaths];
            if (settings.pathSimplification > 0) {
                const simplifiedPoints = simplifyPath(lastPath.points, settings.pathSimplification);
                finalPaths[finalPaths.length - 1] = { ...lastPath, points: simplifiedPoints };
                setCurrentPaths(finalPaths);
            }
            onPathsChange(finalPaths);
        }
    };
    
    return { start, move, end };
};
