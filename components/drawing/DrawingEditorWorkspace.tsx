
import React, { useRef, useEffect, useState } from 'react';
import DrawingCanvas from '../DrawingCanvas';
import DrawingToolbar from '../DrawingToolbar';
import LinkedGlyphsStrip from './LinkedGlyphsStrip';
import ContextualToolbar from '../ContextualToolbar';
import { Character, GlyphData, Path, FontMetrics, Tool, AppSettings, CharacterSet, ImageTransform, TransformState, ComponentTransform, MarkAttachmentRules } from '../../types';
import { DRAWING_CANVAS_SIZE } from '../../constants';
import { getAccurateGlyphBBox } from '../../services/glyphRenderService';

interface DrawingEditorWorkspaceProps {
    character: Character;
    currentPaths: Path[];
    onPathsChange: (paths: Path[]) => void;
    metrics: FontMetrics;
    currentTool: Tool;
    setCurrentTool: (tool: Tool) => void;
    zoom: number;
    setZoom: (zoom: number) => void;
    viewOffset: { x: number; y: number };
    setViewOffset: (offset: { x: number; y: number }) => void;
    settings: AppSettings;
    allGlyphData: Map<number, GlyphData>;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    lsb?: number;
    rsb?: number;
    onMetricsChange: (l: number, r: number) => void;
    isLargeScreen: boolean;
    isTransitioning: boolean;
    wasEmptyOnLoad: boolean;
    isLocked: boolean;
    calligraphyAngle: 45 | 30 | 15;
    setCalligraphyAngle: (angle: 45 | 30 | 15) => void;
    selectedPathIds: Set<string>;
    setSelectedPathIds: (ids: Set<string>) => void;
    isImageSelected: boolean;
    setIsImageSelected: (val: boolean) => void;
    backgroundImage: string | null;
    backgroundImageOpacity: number;
    imageTransform: ImageTransform | null;
    setImageTransform: (t: ImageTransform | null) => void;
    previewTransform: TransformState | null;
    setPreviewTransform: (t: TransformState | null) => void;
    onApplyTransform: (t: TransformState) => void;
    onImageImportClick: () => void;
    onSvgImportClick: () => void;
    onImageTraceClick: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    handleCut: () => void;
    handleCopy: () => void;
    handlePaste: () => void;
    clipboard: Path[] | null;
    handleGroup: () => void;
    handleUngroup: () => void;
    canGroup: boolean;
    canUngroup: boolean;
    sourceGlyphs: Character[];
    dependentGlyphs: Character[];
    groups: Record<string, string[]>;
    handleNavigationAttempt: (char: Character | null) => void;
    markAttachmentRules: MarkAttachmentRules | null;
}

const DrawingEditorWorkspace: React.FC<DrawingEditorWorkspaceProps> = (props) => {
    const canvasWrapperRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (canvasWrapperRef.current) {
            const updateSize = () => {
                if (canvasWrapperRef.current) {
                    setContainerSize({ 
                        width: canvasWrapperRef.current.clientWidth, 
                        height: canvasWrapperRef.current.clientHeight 
                    });
                }
            };
            updateSize();
            const ro = new ResizeObserver(updateSize);
            ro.observe(canvasWrapperRef.current);
            return () => ro.disconnect();
        }
    }, []);

    const activeSelectionBBox = React.useMemo(() => {
        if (props.selectedPathIds.size === 0 || props.isLocked) return null;
        const selectedPaths = props.currentPaths.filter(p => props.selectedPathIds.has(p.id));
        return getAccurateGlyphBBox(selectedPaths, props.settings.strokeThickness);
    }, [props.selectedPathIds, props.currentPaths, props.settings.strokeThickness, props.isLocked]);

    const handleZoomAction = (factor: number) => {
        const newZoom = Math.max(0.1, Math.min(10, props.zoom * factor));
        const center = { x: DRAWING_CANVAS_SIZE / 2, y: DRAWING_CANVAS_SIZE / 2 };
        const newOffset = {
            x: center.x - (center.x - props.viewOffset.x) * (newZoom / props.zoom),
            y: center.y - (center.y - props.viewOffset.y) * (newZoom / props.zoom)
        };
        props.setZoom(newZoom);
        props.setViewOffset(newOffset);
    };

    const mainContentClasses = `flex-grow transition-opacity duration-150 ${props.isTransitioning ? 'opacity-0' : 'opacity-100'} flex flex-col lg:flex-row items-center bg-gray-50 dark:bg-gray-950/20 overflow-hidden relative`;

    return (
        <main className={mainContentClasses}>
            {/* Morphic Toolbar */}
            {props.isLargeScreen && (
                <div className="absolute left-6 top-1/2 -translate-y-1/2 z-30 animate-fade-in-up">
                    <DrawingToolbar
                        character={props.character} currentTool={props.currentTool} setCurrentTool={props.setCurrentTool} 
                        settings={props.settings} isLargeScreen={true}
                        onUndo={props.undo} canUndo={props.canUndo} onRedo={props.redo} canRedo={props.canRedo}
                        onCut={props.handleCut} selectedPathIds={props.selectedPathIds} onCopy={props.handleCopy} onPaste={props.handlePaste} clipboard={props.clipboard}
                        onGroup={props.handleGroup} canGroup={props.canGroup} onUngroup={props.handleUngroup} canUngroup={props.canUngroup}
                        onZoom={handleZoomAction} onImageImportClick={props.onImageImportClick} onSvgImportClick={props.onSvgImportClick}
                        onImageTraceClick={props.onImageTraceClick} calligraphyAngle={props.calligraphyAngle} setCalligraphyAngle={props.setCalligraphyAngle}
                        onApplyTransform={props.onApplyTransform} previewTransform={props.previewTransform} setPreviewTransform={props.setPreviewTransform}
                    />
                </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center w-full h-full min-h-0 relative">
                {/* Hero Canvas Area */}
                <div className="flex-1 w-full min-h-0 flex items-center justify-center p-4 lg:p-12 overflow-hidden relative" ref={canvasWrapperRef}>
                    <div className="rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800 max-h-full max-w-full aspect-square">
                        {activeSelectionBBox && (
                            <ContextualToolbar 
                                selectionBox={activeSelectionBBox} zoom={props.zoom} viewOffset={props.viewOffset}
                                onApplyTransform={props.onApplyTransform} previewTransform={props.previewTransform} setPreviewTransform={props.setPreviewTransform}
                                containerWidth={containerSize.width} containerHeight={containerSize.height} internalCanvasSize={DRAWING_CANVAS_SIZE}
                                onEditMode={() => props.setCurrentTool('edit')}
                            />
                        )}
                        <DrawingCanvas 
                            width={DRAWING_CANVAS_SIZE} height={DRAWING_CANVAS_SIZE} 
                            paths={props.currentPaths} onPathsChange={props.onPathsChange} metrics={props.metrics}
                            tool={props.currentTool} onToolChange={props.setCurrentTool}
                            zoom={props.zoom} setZoom={props.setZoom} viewOffset={props.viewOffset} setViewOffset={props.setViewOffset}
                            settings={props.settings} allGlyphData={props.allGlyphData} allCharacterSets={props.allCharacterSets} currentCharacter={props.character}
                            gridConfig={{ characterNameSize: 450 }} backgroundImage={props.backgroundImage} backgroundImageOpacity={props.backgroundImageOpacity}
                            imageTransform={props.imageTransform} onImageTransformChange={props.setImageTransform}
                            selectedPathIds={props.selectedPathIds} onSelectionChange={props.setSelectedPathIds}
                            isImageSelected={props.isImageSelected} onImageSelectionChange={props.setIsImageSelected}
                            lsb={props.lsb} rsb={props.rsb} onMetricsChange={props.onMetricsChange} 
                            calligraphyAngle={props.calligraphyAngle} isInitiallyDrawn={!props.wasEmptyOnLoad}
                            transformMode={props.isLocked ? 'move-only' : 'all'} previewTransform={props.previewTransform}
                        />
                    </div>
                </div>

                {/* Relationship Strips */}
                <div className="w-full max-w-5xl px-4 pb-4 flex flex-col gap-1 flex-shrink-0 z-20">
                    {props.sourceGlyphs.length > 0 && (
                        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <LinkedGlyphsStrip 
                                title="Sources" items={props.sourceGlyphs} glyphDataMap={props.allGlyphData} 
                                settings={props.settings} onSelect={props.handleNavigationAttempt} variant="sources"
                            />
                        </div>
                    )}
                    {props.dependentGlyphs.length > 0 && (
                        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <LinkedGlyphsStrip 
                                title="Used In" items={props.dependentGlyphs} glyphDataMap={props.allGlyphData} settings={props.settings}
                                onSelect={props.handleNavigationAttempt} variant="dependents" liveSourcePaths={props.currentPaths}
                                sourceCharacter={props.character} allCharsByName={props.allCharsByName} metrics={props.metrics}
                                markAttachmentRules={props.markAttachmentRules} characterSets={props.allCharacterSets} groups={props.groups}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile Toolbar */}
            {!props.isLargeScreen && (
                <div className="flex-shrink-0 w-full z-20 p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-center shadow-lg">
                    <DrawingToolbar
                        character={props.character} currentTool={props.currentTool} setCurrentTool={props.setCurrentTool} 
                        settings={props.settings} isLargeScreen={false}
                        onUndo={props.undo} canUndo={props.canUndo} onRedo={props.redo} canRedo={props.canRedo}
                        onCut={props.handleCut} selectedPathIds={props.selectedPathIds} onCopy={props.handleCopy} onPaste={props.handlePaste} clipboard={props.clipboard}
                        onGroup={props.handleGroup} canGroup={props.canGroup} onUngroup={props.handleUngroup} canUngroup={props.canUngroup}
                        onZoom={handleZoomAction} onImageImportClick={props.onImageImportClick} onSvgImportClick={props.onSvgImportClick}
                        onImageTraceClick={props.onImageTraceClick} calligraphyAngle={props.calligraphyAngle} setCalligraphyAngle={props.setCalligraphyAngle}
                        onApplyTransform={props.onApplyTransform} previewTransform={props.previewTransform} setPreviewTransform={props.setPreviewTransform}
                    />
                </div>
            )}
        </main>
    );
};

export default React.memo(DrawingEditorWorkspace);
