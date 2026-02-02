
import React, { useState, useEffect } from 'react';
import PositioningCanvas from '../PositioningCanvas';
import PositioningToolbar from '../PositioningToolbar';
import ClassPreviewStrip from './ClassPreviewStrip';
import LinkedGlyphsStrip from '../drawing/LinkedGlyphsStrip';
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
    
    // Source Fallback Props
    sourceGlyphs: Character[];
    onSelectCharacter: (char: Character) => void;
    allCharsByName: Map<string, Character>;
}

const PositioningEditorWorkspace: React.FC<PositioningEditorWorkspaceProps> = ({
    markPaths, basePaths, targetLigature, onPathsChange, pageTool, onToggleTool, zoom, setZoom,
    viewOffset, setViewOffset, onZoom, onReuseClick, canEdit, lockedMessage, movementConstraint,
    settings, metrics, showStrip, classSiblings, activePair, pivotChar, glyphDataMap, anchorDelta,
    isLinked, onToggleLink, handleSelectSibling, markAttachmentRules, positioningRules,
    characterSets, groups, isStripExpanded, setIsStripExpanded, activeAttachmentClass,
    hasDualContext, activeClassType, onToggleContext, isLargeScreen,
    manualX, manualY, onManualChange, onManualCommit, setIsInputFocused,
    sourceGlyphs, onSelectCharacter, allCharsByName
}) => {
    const [activeTab, setActiveTab] = useState<'class' | 'sources'>('class');
    const [isClassStripCollapsed, setIsClassStripCollapsed] = useState(false);

    // Automatically switch tabs based on class availability
    useEffect(() => {
        if (activeAttachmentClass) {
            setActiveTab('class');
        } else {
            setActiveTab('sources');
        }
    }, [activeAttachmentClass]);

    return (
        <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950/20 relative min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center w-full h-full overflow-hidden relative">
                <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center overflow-hidden relative">
                    <div className="relative w-full h-full flex items-center justify-center">
                        <div className="relative h-[92%] max-h-full aspect-square flex items-center justify-center max-w-full">
                            {isLargeScreen && !isStripExpanded && (
                                <div className="absolute right-full mr-6 top-6 z-30">
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

                <div className="w-full max-w-5xl mx-auto flex-shrink-0 z-20 px-2 pb-2">
                    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                        
                        {/* Tab Header */}
                        <div className="flex flex-row items-center bg-gray-50/50 dark:bg-gray-900/30 px-2 pt-1">
                            <button
                                onClick={() => setActiveTab('class')}
                                disabled={!activeAttachmentClass}
                                className={`
                                    flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all rounded-t-md
                                    ${activeTab === 'class' 
                                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white/50 dark:bg-gray-800/50' 
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/30 dark:hover:bg-gray-700/30'}
                                    ${!activeAttachmentClass ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                            >
                                Related Pairs
                                {classSiblings && classSiblings.length > 0 && (
                                    <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-full text-[9px] min-w-[16px] text-center">
                                        {classSiblings.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('sources')}
                                className={`
                                    flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all rounded-t-md
                                    ${activeTab === 'sources' 
                                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white/50 dark:bg-gray-800/50' 
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/30 dark:hover:bg-gray-700/30'}
                                `}
                            >
                                Components
                                {sourceGlyphs && sourceGlyphs.length > 0 && (
                                    <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-full text-[9px] min-w-[16px] text-center">
                                        {sourceGlyphs.length}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="relative bg-white/50 dark:bg-gray-800/50">
                            {activeTab === 'class' ? (
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
                                    isCollapsed={isClassStripCollapsed}
                                    onToggleCollapse={() => setIsClassStripCollapsed(!isClassStripCollapsed)}
                                />
                            ) : (
                                <LinkedGlyphsStrip
                                    title="Sources"
                                    items={sourceGlyphs}
                                    glyphDataMap={glyphDataMap}
                                    settings={settings}
                                    onSelect={onSelectCharacter}
                                    variant="sources"
                                    allCharsByName={allCharsByName}
                                    characterSets={characterSets}
                                    groups={groups}
                                    markAttachmentRules={markAttachmentRules}
                                    metrics={metrics}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default React.memo(PositioningEditorWorkspace);
