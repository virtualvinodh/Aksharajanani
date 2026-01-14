import React from 'react';
import DrawingCanvas from '../DrawingCanvas';
import PositioningToolbar from '../PositioningToolbar';
import ClassPreviewStrip from './ClassPreviewStrip';
import { Character, GlyphData, Path, Point, FontMetrics, MarkAttachmentRules, PositioningRules, CharacterSet, AttachmentClass } from '../../types';
import { DRAWING_CANVAS_SIZE } from '../../constants';

interface PositioningEditorWorkspaceProps {
    markPaths: Path[];
    basePaths: Path[];
    targetLigature: Character;
    onPathsChange: (paths: Path[]) => void;
    pageTool: 'select' | 'pan';
    onToggleTool: () => void;
    zoom: number;
    setZoom: (val: number) => void;
    viewOffset: Point;
    setViewOffset: (val: Point) => void;
    onZoom: (factor: number) => void;
    onReuseClick: () => void;
    canEdit: boolean;
    lockedMessage?: string;
    movementConstraint: 'horizontal' | 'vertical' | 'none';
    settings: any;
    metrics: FontMetrics;
    
    // Manual Coordinate Props
    manualX: string;
    manualY: string;
    onManualChange: (axis: 'x' | 'y', value: string) => void;
    onManualCommit: () => void;

    // Selection Props
    selectedPathIds: Set<string>;
    onSelectionChange: (ids: Set<string>) => void;

    // Sibling Strip Props
    showStrip: boolean;
    classSiblings: any[];
    activePair: any;
    pivotChar: Character | null | undefined;
    glyphDataMap: Map<number, GlyphData>;
    anchorDelta: Point;
    isLinked: boolean;
    onToggleLink: () => void;
    handleSelectSibling: (pair: any) => void;
    markAttachmentRules: MarkAttachmentRules | null;
    positioningRules: PositioningRules[] | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    isStripExpanded: boolean;
    setIsStripExpanded: (val: boolean) => void;
    activeAttachmentClass: AttachmentClass | undefined;
    hasDualContext: boolean;
    activeClassType: 'mark' | 'base' | null;
    onToggleContext: (type: 'mark' | 'base') => void;
    isLargeScreen: boolean;
}

const PositioningEditorWorkspace: React.FC<PositioningEditorWorkspaceProps> = ({
    markPaths, basePaths, targetLigature, onPathsChange, pageTool, onToggleTool, zoom, setZoom,
    viewOffset, setViewOffset, onZoom, onReuseClick, canEdit, lockedMessage, movementConstraint,
    settings, metrics, showStrip, classSiblings, activePair, pivotChar, glyphDataMap, anchorDelta,
    isLinked, onToggleLink, handleSelectSibling, markAttachmentRules, positioningRules,
    characterSets, groups, isStripExpanded, setIsStripExpanded, activeAttachmentClass,
    hasDualContext, activeClassType, onToggleContext, isLargeScreen,
    manualX, manualY, onManualChange, onManualCommit,
    selectedPathIds, onSelectionChange
}) => {
    return (
        <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950/20 relative h-full">
            {/* Morphic Toolbar: Vertically docked on desktop, floats for touch accessibility */}
            {isLargeScreen && !isStripExpanded && (
                <div className="absolute left-6 top-1/2 -translate-y-1/2 z-30 animate-fade-in-up">
                    <PositioningToolbar 
                        orientation="vertical"
                        onReuseClick={onReuseClick} 
                        pageTool={pageTool} 
                        onToggleTool={onToggleTool} 
                        onZoom={onZoom} 
                        reuseDisabled={!canEdit}
                        manualX={manualX}
                        manualY={manualY}
                        onManualChange={onManualChange}
                        onManualCommit={onManualCommit}
                        canEdit={canEdit}
                    />
                </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center w-full h-full overflow-hidden relative">
                
                {/* Hero Canvas Area: Standardized across all editors */}
                <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center p-4 sm:p-12 overflow-hidden relative">
                    <div 
                        className="rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800 max-h-full max-w-full aspect-square"
                        style={{ 
                            width: 'auto',
                            height: 'auto'
                        }}
                    >
                        <DrawingCanvas
                            width={DRAWING_CANVAS_SIZE} 
                            height={DRAWING_CANVAS_SIZE}
                            paths={markPaths} 
                            onPathsChange={onPathsChange} 
                            backgroundPaths={basePaths}
                            metrics={metrics} 
                            tool={pageTool} 
                            zoom={zoom} 
                            setZoom={setZoom} 
                            viewOffset={viewOffset} 
                            setViewOffset={setViewOffset}
                            settings={settings} 
                            allGlyphData={glyphDataMap} 
                            allCharacterSets={characterSets} 
                            currentCharacter={targetLigature}
                            gridConfig={{ characterNameSize: 450 }} 
                            backgroundImage={null} 
                            backgroundImageOpacity={1} 
                            imageTransform={null} 
                            onImageTransformChange={() => {}}
                            selectedPathIds={selectedPathIds} 
                            onSelectionChange={onSelectionChange} 
                            isImageSelected={false} 
                            onImageSelectionChange={() => {}}
                            lsb={targetLigature.lsb} 
                            rsb={targetLigature.rsb} 
                            showBearingGuides={false} 
                            disableTransformations={!canEdit} 
                            lockedMessage={lockedMessage}
                            transformMode="move-only" 
                            movementConstraint={movementConstraint} 
                            isInitiallyDrawn={true}
                            disableAutoFit={true} 
                        />
                    </div>
                </div>

                {/* Mobile Toolbar: Anchored for ergonomic thumb usage */}
                {!isLargeScreen && (
                    <div className="flex-shrink-0 w-full z-20 p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-center shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <PositioningToolbar 
                            orientation="horizontal"
                            onReuseClick={onReuseClick} 
                            pageTool={pageTool} 
                            onToggleTool={onToggleTool} 
                            onZoom={onZoom} 
                            reuseDisabled={!canEdit}
                            manualX={manualX}
                            manualY={manualY}
                            onManualChange={onManualChange}
                            onManualCommit={onManualCommit}
                            canEdit={canEdit}
                        />
                    </div>
                )}

                {/* Morphic Sibling Strip: Floats at the bottom, matching the Drawing Modal dependent strip style */}
                {showStrip && (
                    <div className="w-full max-w-5xl mx-auto flex-shrink-0 z-20 transition-all duration-300 px-2 pb-2">
                        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <ClassPreviewStrip 
                                siblings={classSiblings}
                                activePair={activePair}
                                pivotChar={pivotChar} 
                                glyphDataMap={glyphDataMap}
                                strokeThickness={settings.strokeThickness}
                                anchorDelta={anchorDelta}
                                isLinked={isLinked} 
                                onToggleLink={onToggleLink}
                                orientation="horizontal"
                                onSelectPair={handleSelectSibling}
                                metrics={metrics}
                                markAttachmentRules={markAttachmentRules}
                                positioningRules={positioningRules}
                                characterSets={characterSets}
                                groups={groups}
                                isExpanded={isStripExpanded}
                                setIsExpanded={setIsStripExpanded}
                                activeClass={activeAttachmentClass}
                                hasDualContext={hasDualContext}
                                activeClassType={activeClassType}
                                onToggleContext={onToggleContext}
                            />
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
};

export default React.memo(PositioningEditorWorkspace);