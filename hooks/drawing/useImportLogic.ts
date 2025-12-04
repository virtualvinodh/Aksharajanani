


import React, { useRef, useCallback } from 'react';
import { Path, FontMetrics, Segment, ImageTransform } from '../../types';
import { generateId } from '../drawingTools/types';
import { VEC } from '../../utils/vectorUtils';
import { DRAWING_CANVAS_SIZE } from '../../constants';
import { paperScope } from '../../services/glyphRenderService';

declare var paper: any;

interface UseImportLogicProps {
    setBackgroundImage: (img: string | null) => void;
    setImageTransform: (transform: ImageTransform | null) => void;
    setTracerImageSrc: (src: string | null) => void;
    setIsTracerModalOpen: (isOpen: boolean) => void;
    handlePathsChange: (paths: Path[]) => void;
    setCurrentTool: (tool: any) => void;
    setSelectedPathIds: (ids: Set<string>) => void;
    currentPaths: Path[];
    metrics: FontMetrics;
    showNotification: (msg: string, type?: 'info' | 'error' | 'success') => void;
    t: (key: string) => string;
}

export const useImportLogic = ({
    setBackgroundImage, setImageTransform, setTracerImageSrc, setIsTracerModalOpen,
    handlePathsChange, setCurrentTool, setSelectedPathIds, currentPaths, metrics, showNotification, t
}: UseImportLogicProps) => {
    
    const imageImportRef = useRef<HTMLInputElement>(null);
    const svgImportRef = useRef<HTMLInputElement>(null);
    const imageTraceRef = useRef<HTMLInputElement>(null);

    const handleImageImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgSrc = e.target?.result as string;
            setBackgroundImage(imgSrc);
            const img = new Image();
            img.onload = () => {
                const canvasAspectRatio = DRAWING_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
                const imageAspectRatio = img.width / img.height;
                let width, height;
                if (imageAspectRatio > canvasAspectRatio) {
                    width = DRAWING_CANVAS_SIZE * 0.9;
                    height = (DRAWING_CANVAS_SIZE * 0.9) / imageAspectRatio;
                } else {
                    height = DRAWING_CANVAS_SIZE * 0.9;
                    width = (DRAWING_CANVAS_SIZE * 0.9) * imageAspectRatio;
                }
                const x = (DRAWING_CANVAS_SIZE - width) / 2;
                const y = (DRAWING_CANVAS_SIZE - height) / 2;
                setImageTransform({ x, y, width, height, rotation: 0 });
            };
            img.src = imgSrc;
        };
        reader.readAsDataURL(file);
        if(imageImportRef.current) imageImportRef.current.value = "";
    }, [setBackgroundImage, setImageTransform]);

    const handleSvgImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const svgText = e.target?.result as string;
            if (!svgText) return;
            
            paperScope.project.clear();
            
            const importedItem = paperScope.project.importSVG(svgText, { expandShapes: true });
            if (!importedItem || importedItem.bounds.width === 0 || importedItem.bounds.height === 0) {
                showNotification(t('errorInvalidSvg'), 'error');
                return;
            }

            const bounds = importedItem.bounds;
            const availableHeight = metrics.baseLineY - metrics.topLineY;
            const scale = availableHeight / bounds.height;
            importedItem.scale(scale, new paper.Point(0,0));
            
            const newBounds = importedItem.bounds;
            const targetCenter = {
                x: DRAWING_CANVAS_SIZE / 2,
                y: metrics.topLineY + availableHeight / 2
            };
            const translation = VEC.sub(targetCenter, {x: newBounds.center.x, y: newBounds.center.y});
            importedItem.translate(new paper.Point(translation.x, translation.y));
            
            const newPaths: Path[] = [];
            const extractPaths = (item: any) => {
                if (item.className === 'CompoundPath') {
                     const segmentGroups: Segment[][] = item.children.map((child: any) =>
                        child.segments.map((seg: any) => ({
                            point: { x: seg.point.x, y: seg.point.y },
                            handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
                            handleOut: { x: seg.handleOut.x, y: seg.handleOut.y }
                        }))
                    );
                    newPaths.push({ id: generateId(), type: 'outline', points: [], segmentGroups: segmentGroups });
                } else if (item.className === 'Path') {
                    const segments: Segment[] = item.segments.map((seg: any) => ({
                        point: { x: seg.point.x, y: seg.point.y },
                        handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
                        handleOut: { x: seg.handleOut.x, y: seg.handleOut.y }
                    }));
                     newPaths.push({ id: generateId(), type: 'outline', points: [], segmentGroups: [segments] });
                } else if (item.children) {
                    item.children.forEach(extractPaths);
                }
            };
            extractPaths(importedItem);
            handlePathsChange([...currentPaths, ...newPaths]);
            setCurrentTool('select');
            setTimeout(() => { setSelectedPathIds(new Set(newPaths.map(p => p.id))); }, 0);
            showNotification(t('svgImportSuccess'), 'info');
        };
        reader.readAsText(file);
        if(svgImportRef.current) svgImportRef.current.value = "";
    }, [metrics, currentPaths, handlePathsChange, setCurrentTool, setSelectedPathIds, showNotification, t]);

    const handleImageTraceFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgSrc = e.target?.result as string;
            setTracerImageSrc(imgSrc);
            setIsTracerModalOpen(true);
        };
        reader.readAsDataURL(file);
        if (imageTraceRef.current) imageTraceRef.current.value = "";
    }, [setTracerImageSrc, setIsTracerModalOpen]);

    const handleInsertTracedSVG = useCallback((newPaths: Path[]) => {
        handlePathsChange([...currentPaths, ...newPaths]);
        setCurrentTool('select');
        setTimeout(() => { setSelectedPathIds(new Set(newPaths.map(p => p.id))); }, 0);
    }, [currentPaths, handlePathsChange, setCurrentTool, setSelectedPathIds]);

    return {
        imageImportRef,
        svgImportRef,
        imageTraceRef,
        handleImageImport,
        handleSvgImport,
        handleImageTraceFileChange,
        handleInsertTracedSVG
    };
};