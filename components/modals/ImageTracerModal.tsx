


import React, { useState, useEffect, useRef } from 'react';
import Modal from '../Modal';
import { SpinnerIcon } from '../../constants';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { traceImageToSVG } from '../../services/imageTracerService';
import { Path, Segment } from '../../types';
import { VEC } from '../../utils/vectorUtils';
import { generateId } from '../../hooks/drawingTools/types';
import { paperScope } from '../../services/glyphRenderService';

declare var paper: any;

interface ImageTracerModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string | null;
    onInsertSVG: (paths: Path[]) => void;
    drawingCanvasSize: number;
    metrics: any;
}

const ImageTracerModal: React.FC<ImageTracerModalProps> = ({ isOpen, onClose, imageSrc, onInsertSVG, drawingCanvasSize, metrics }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();

    const [tracerPreview, setTracerPreview] = useState<string | null>(null);
    const [isTracing, setIsTracing] = useState(false);
    const [traceOptions, setTraceOptions] = useState({ ltres: 1, qtres: 1, pathomit: 8 });
    const [traceRemoveBackground, setTraceRemoveBackground] = useState(true);
    const traceTimeoutRef = useRef<number | null>(null);

    // Reset state when modal opens with new image
    useEffect(() => {
        if (isOpen) {
            setTracerPreview(null);
            setIsTracing(false);
        }
    }, [isOpen, imageSrc]);

    useEffect(() => {
        if (!isOpen || !imageSrc) return;
        
        let isCancelled = false;
        setIsTracing(true);
        if (traceTimeoutRef.current) clearTimeout(traceTimeoutRef.current);

        traceTimeoutRef.current = window.setTimeout(async () => {
            try {
                const svgString = await traceImageToSVG(imageSrc, traceOptions, traceRemoveBackground);
                if (!isCancelled) {
                    setTracerPreview(svgString);
                }
            } catch (error) {
                if (!isCancelled) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown tracing error';
                    showNotification(errorMessage, 'error');
                }
            } finally {
                if (!isCancelled) {
                    setIsTracing(false);
                }
            }
        }, 300); // Debounce tracing

        return () => {
            isCancelled = true;
            if (traceTimeoutRef.current) clearTimeout(traceTimeoutRef.current);
        };
    }, [isOpen, imageSrc, traceOptions, traceRemoveBackground, showNotification]);

    const handleInsert = () => {
        if (!tracerPreview) return;

        paperScope.project.clear();
        const importedItem = paperScope.project.importSVG(tracerPreview, { expandShapes: true });

        if (!importedItem || importedItem.bounds.width === 0 || importedItem.bounds.height === 0) {
            showNotification(t('errorInvalidSvg'), 'error');
            onClose();
            return;
        }

        const bounds = importedItem.bounds;
        const availableHeight = metrics.baseLineY - metrics.topLineY;
        const scale = availableHeight / bounds.height;
        importedItem.scale(scale, new paper.Point(0, 0));
        const newBounds = importedItem.bounds;
        const targetCenter = { x: drawingCanvasSize / 2, y: metrics.topLineY + availableHeight / 2 };
        const translation = VEC.sub(targetCenter, { x: newBounds.center.x, y: newBounds.center.y });
        importedItem.translate(new paper.Point(translation.x, translation.y));
        
        const newPaths: Path[] = [];
        const extractPaths = (item: any) => {
            if (item.className === 'CompoundPath') {
                const segmentGroups: Segment[][] = item.children.map((child: any) => child.segments.map((seg: any) => ({ point: { x: seg.point.x, y: seg.point.y }, handleIn: { x: seg.handleIn.x, y: seg.handleIn.y }, handleOut: { x: seg.handleOut.x, y: seg.handleOut.y } })));
                newPaths.push({ id: generateId(), type: 'outline', points: [], segmentGroups: segmentGroups });
            } else if (item.className === 'Path') {
                const segments: Segment[] = item.segments.map((seg: any) => ({ point: { x: seg.point.x, y: seg.point.y }, handleIn: { x: seg.handleIn.x, y: seg.handleIn.y }, handleOut: { x: seg.handleOut.x, y: seg.handleOut.y } }));
                newPaths.push({ id: generateId(), type: 'outline', points: [], segmentGroups: [segments] });
            } else if (item.children) {
                item.children.forEach(extractPaths);
            }
        };
        extractPaths(importedItem);
        
        onInsertSVG(newPaths);
        showNotification(t('svgImportSuccess'), 'info');
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('traceImageTitle')}
            size="xl"
            footer={<>
                <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button>
                <button onClick={handleInsert} disabled={isTracing || !tracerPreview} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg disabled:bg-indigo-400">{t('insertAsVectorPath')}</button>
            </>}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border p-2 rounded-md dark:border-gray-700">
                    <h4 className="font-semibold mb-2">{t('originalImage')}</h4>
                    <img src={imageSrc || ''} alt="Original for tracing" className="w-full h-auto object-contain max-h-64" />
                </div>
                <div className="border p-2 rounded-md dark:border-gray-700">
                    <h4 className="font-semibold mb-2">{t('livePreview')}</h4>
                    <div className="w-full h-64 bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                        {isTracing ? <SpinnerIcon /> : (tracerPreview && <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: tracerPreview }} />)}
                    </div>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="text-sm font-medium">{t('detailLevel')}: {traceOptions.ltres}</label>
                    <input type="range" min="0" max="10" step="0.5" value={traceOptions.ltres} onChange={e => setTraceOptions(o => ({...o, ltres: parseFloat(e.target.value)}))} className="w-full accent-indigo-600" />
                </div>
                <div>
                    <label className="text-sm font-medium">{t('noiseReduction')}: {traceOptions.qtres}</label>
                    <input type="range" min="0" max="10" step="0.5" value={traceOptions.qtres} onChange={e => setTraceOptions(o => ({...o, qtres: parseFloat(e.target.value)}))} className="w-full accent-indigo-600" />
                </div>
                <div>
                    <label className="text-sm font-medium">{t('cornerSmoothing')}: {traceOptions.pathomit}</label>
                    <input type="range" min="0" max="16" step="1" value={traceOptions.pathomit} onChange={e => setTraceOptions(o => ({...o, pathomit: parseInt(e.target.value)}))} className="w-full accent-indigo-600" />
                </div>
            </div>
            <div className="mt-4">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                        type="checkbox"
                        checked={traceRemoveBackground}
                        onChange={e => setTraceRemoveBackground(e.target.checked)}
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
                    />
                    <span>{t('removeWhiteBackground')}</span>
                </label>
            </div>
        </Modal>
    );
};

export default ImageTracerModal;