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
        <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-900 relative">
            {/* Desktop Toolbar: Floating over the workspace like Drawing Modal */}
            {isLargeScreen && !isStripExpanded && (
                <div className="absolute left-6 top-1/2 -translate-y-1/2 z-20">
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
                {/* Central Canvas Area: Using fixed aspect container to ensure layout stability */}
                <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-4 sm:p-8 overflow-hidden relative">
                    <div 
                        className="rounded-md overflow-hidden shadow-2xl aspect-square relative flex items-center justify-center bg-white dark:bg-gray-900"
                        style={{ 
                            maxHeight: '100%', 
                            maxWidth: '100%', 
                            height: isLargeScreen ? '80vh' : '60vh', 
                            width: isLargeScreen ? '80vh' : '60vh',
                            minHeight: '200px',
                            minWidth: '200px'
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

                {/* Mobile Toolbar: Shown only on small screens, fixed at bottom bar */}
                {!isLargeScreen && (
                    <div className="flex-shrink-0 w-full z-20 p-2 bg-white dark:bg-gray-800 border-t dark:border-gray-700 flex justify-center">
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

                {/* Sibling Strip: Positioned directly below canvas */}
                {showStrip && (
                    <div className="w-full max-w-5xl mx-auto flex-shrink-0 z-10 transition-all duration-300">
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
                )}
            </div>
        </main>
    );
};

export default React.memo(PositioningEditorWorkspace);