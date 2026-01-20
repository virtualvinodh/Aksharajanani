
import React, { useRef, useEffect, useCallback } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, RecommendedKerning } from '../types';
import KerningEditorHeader from './kerning/KerningEditorHeader';
import KerningEditorWorkspace from './kerning/KerningEditorWorkspace';
import KerningCanvas from './KerningCanvas';
import { useKerningSession } from '../hooks/kerning/useKerningSession';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface KerningEditorPageProps {
    pair: { left: Character, right: Character };
    onClose: () => void;
    onSave: (value: number) => void;
    onRemove: () => void;
    initialValue: number;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    metrics: FontMetrics;
    settings: AppSettings;
    recommendedKerning: RecommendedKerning[] | null;
    onNavigate: (direction: 'prev' | 'next') => void;
    hasPrev: boolean;
    hasNext: boolean;
    glyphVersion: number;
}

const KerningEditorPage: React.FC<KerningEditorPageProps> = (props) => {
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');
    const xDistInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const session = useKerningSession(props);

    const updateSize = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const w = container.offsetWidth;
        const h = container.offsetHeight;

        if (w > 0 && h > 0) {
            session.setContainerSize({ width: w, height: h });
        }
    }, [session.setContainerSize]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        updateSize();
        
        const ro = new ResizeObserver(() => {
            requestAnimationFrame(updateSize);
        });
        ro.observe(container);
        
        return () => ro.disconnect();
    }, [updateSize]);

    // Centered Zoom Action
    const handleZoomAction = useCallback((factor: number) => {
        const oldZoom = session.zoom;
        const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));
        const scaleRatio = newZoom / oldZoom;

        session.setViewOffset({
            x: session.viewOffset.x * scaleRatio,
            y: session.viewOffset.y * scaleRatio
        });
        session.setZoom(newZoom);
    }, [session]);

    return (
        <div className="flex-1 flex flex-col h-full w-full bg-white dark:bg-gray-800 min-h-0 overflow-hidden">
            <KerningEditorHeader 
                pair={props.pair} 
                onClose={props.onClose} 
                onNavigate={props.onNavigate} 
                hasPrev={props.hasPrev} 
                hasNext={props.hasNext} 
                onAutoKern={session.handleAutoKern} 
                isAutoKerning={session.isAutoKerning} 
                onSave={session.handleSave} 
                onRemove={props.onRemove} 
                isDirty={session.isDirty} 
                settings={props.settings} 
            />
            
            <KerningEditorWorkspace 
                isLargeScreen={isLargeScreen}
                containerRef={containerRef}
                onZoom={handleZoomAction} 
                kernValue={session.kernValue} 
                onKernChange={(e) => session.setKernValue(e.target.value)} 
                onKernFocus={session.setIsKernFocused} 
                onKernHover={session.setIsKernHovered} 
                isKernDirty={session.isDirty} 
                xDistValue={session.xDistValue} 
                onXDistChange={(e) => session.setXDistValue(e.target.value)} 
                onXDistCommit={session.handleXDistCommit} 
                isXDistFocused={session.isXDistFocused} 
                isXDistHovered={session.isXDistHovered} 
                onXDistFocus={session.setIsXDistFocused} 
                onXDistHover={session.setIsXDistHovered} 
                xDistInputRef={xDistInputRef} 
            >
                <div 
                    className="rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800"
                    style={{ 
                        width: session.canvasDisplaySize.width || '80vw', 
                        height: session.canvasDisplaySize.height || '60vh'
                    }}
                >
                    <KerningCanvas
                        width={session.canvasDisplaySize.width || 800}
                        height={session.canvasDisplaySize.height || 533}
                        leftChar={props.pair.left}
                        rightChar={props.pair.right}
                        glyphDataMap={props.glyphDataMap}
                        kernValue={session.kernValue}
                        onKernChange={session.setKernValue}
                        metrics={props.metrics}
                        tool="select" 
                        zoom={session.zoom}
                        setZoom={session.setZoom}
                        viewOffset={session.viewOffset}
                        setViewOffset={session.setViewOffset}
                        settings={props.settings}
                        baseScale={session.baseScale}
                        strokeThickness={props.strokeThickness}
                        showMeasurement={session.showMeasurement}
                    />
                </div>
            </KerningEditorWorkspace>
        </div>
    );
};

export default React.memo(KerningEditorPage);
