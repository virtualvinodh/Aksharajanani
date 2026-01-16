import React from 'react';
import PositioningCanvas from '../PositioningCanvas';
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
    setViewOffset: (offset: Point) => void;
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
    onManualCommit: (x?: string, y?: string) => void;
    setIsInputFocused: (focused: boolean) => void;

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
    manualX, manualY, onManualChange, onManualCommit, setIsInputFocused
}) => {
    return (
        <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950/20 relative min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center w-full h-full overflow-hidden relative">
                
                {/* Hero Canvas Area: Explicit flex-1 and min-h-0 to allow correct height resolution */}
                <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center p-4 sm:p-8 overflow-hidden relative">
                    
                    {/* Centering wrapper that fills available space */}
                    <div className="relative w-full h-full flex items-center justify-center">
                        {/* The item forced to be square based on available parent height */}
                        <div className="relative h-full max-h-full aspect-square flex items-center justify-center max-w-full">
                            
                            {/* Toolbar: Anchored to the left of the square container */}
                            {isLargeScreen && !isStripExpanded && (
                                <div className="absolute right-full mr-6 top-0 z-30 animate-fade-in-up">
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
                                        setIsInputFocused={setIsInputFocused}
                                        canEdit={canEdit}
                                    />
                                </div>
                            )}

                            <div 
                                className="rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800 w-full h-full"
                            >
                                <PositioningCanvas
                                    width={DRAWING_CANVAS_SIZE} 
                                    height={DRAWING_CANVAS_SIZE}
                                    markPaths={markPaths}
                                    basePaths={basePaths}
                                    onPathsChange={onPathsChange} 
                                    metrics={metrics} 
                                    tool={pageTool} 
                                    zoom={zoom} 
                                    setZoom={setZoom} 
                                    viewOffset={viewOffset} 
                                    setViewOffset={setViewOffset}
                                    settings={settings} 
                                    movementConstraint={movementConstraint}
                                    canEdit={canEdit}
                                    character={targetLigature}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Toolbar */}
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
                            setIsInputFocused={setIsInputFocused}
                            canEdit={canEdit}
                        />
                    </div>
                )}

                {/* Morphic Sibling Strip */}
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
