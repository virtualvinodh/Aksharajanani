
import { useState, useCallback, useRef } from 'react';
import { Point } from '../../types';
import { VEC } from '../../utils/vectorUtils';

interface PanToolProps {
    onPan: (newOffset: Point) => void;
}

export const usePanTool = ({ onPan }: PanToolProps) => {
    const [isPanning, setIsPanning] = useState(false);
    const panStartPointRef = useRef<Point>({ x: 0, y: 0 });
    const panStartOffsetRef = useRef<Point>({ x: 0, y: 0 });


    const startPan = useCallback((viewportPoint: Point, currentViewOffset: Point) => {
        setIsPanning(true);
        panStartPointRef.current = viewportPoint;
        panStartOffsetRef.current = currentViewOffset;
    }, []);

    const move = useCallback((viewportPoint: Point) => {
        if (!isPanning) return;
        const delta = VEC.sub(viewportPoint, panStartPointRef.current);
        const newOffset = VEC.add(panStartOffsetRef.current, delta);
        onPan(newOffset);
    }, [isPanning, onPan]);

    const end = useCallback(() => {
        setIsPanning(false);
    }, []);

    return {
        isPanning,
        startPan,
        move,
        end,
    };
};
