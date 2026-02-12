
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { DRAWING_CANVAS_SIZE } from '../../constants';
import { AppSettings, Character, FontMetrics, GlyphData, MarkAttachmentRules, MarkPositioningMap, Point, PositioningRules, CharacterSet, ComponentTransform, AttachmentClass } from '../../types';
import ReusePreviewCard from './ReusePreviewCard';
import UnsavedChangesModal from './UnsavedChangesModal';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Modal from './Modal';
import { useProject } from '../../contexts/ProjectContext';
import PositioningEditorHeader from './positioning/PositioningEditorHeader';
import PositioningEditorWorkspace from './positioning/PositioningEditorWorkspace';
import { CloseIcon } from '../../constants';
import { VEC } from '../../utils/vectorUtils';
import { usePositioningSession } from '../../hooks/positioning/usePositioningSession';
import { deepClone } from '../../utils/cloneUtils';
import { expandMembers } from '../../services/groupExpansionService';
import { useGlyphData as useGlyphDataContext } from '../../contexts/GlyphDataContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { isGlyphDrawn } from '../../utils/glyphUtils';

interface PositioningEditorPageProps {
    baseChar: Character;
    markChar: Character;
    targetLigature: Character;
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    onSave: (base: Character, mark: Character, targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newMetadata: any, isAutosave?: boolean, isManual?: boolean) => void;
    onConfirmPosition: (base: Character, mark: Character, ligature: Character) => void;
    onClose: () => void;
    onDelete: () => void;
    onReset: (baseChar: Character, markChar: Character, targetLigature: Character) => void;
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    positioningRules: PositioningRules[] | null;
    allChars: Map<string, Character>;
    onNavigate: (target: 'prev' | 'next' | Character) => void;
    hasPrev: boolean;
    hasNext: boolean;
    setEditingPair?: (pair: { base: Character, mark: Character, ligature: Character }) => void;
    characterSets: CharacterSet[];
    glyphVersion: number;
    allLigaturesByKey: Map<string, Character>;
    onConvertToComposite?: (newTransforms: ComponentTransform[]) => void;
    groups: Record<string, string[]>;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
}

const PositioningEditorPage: React.FC<PositioningEditorPageProps> = (props) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    
    // Removed internal useRules/groups fetching to prevent shadowing. 
    // Using props.groups, props.markAttachmentClasses, etc.
    
    const { setMarkAttachmentClasses, setBaseAttachmentClasses, dispatch: characterDispatch } = useProject();
    const { dispatch: glyphDataDispatch } = useGlyphDataContext();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();

    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    const [isReusePanelOpen, setIsReusePanelOpen] = useState(false);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isStripExpanded, setIsStripExpanded] = useState(false);
    const [isDetachConfirmOpen, setIsDetachConfirmOpen] = useState(false);
    const [pageTool, setPageTool] = useState<'select' | 'pan'>('select');

    const sourceGlyphs = useMemo(() => [props.baseChar, props.markChar], [props.baseChar, props.markChar]);

    const session = usePositioningSession({
        ...props,
        groups: props.groups,
        markAttachmentClasses: props.markAttachmentClasses,
        baseAttachmentClasses: props.baseAttachmentClasses
    });

    const onSaveConstruction = useCallback((type: 'drawing' | 'composite' | 'link' | 'positioning' | 'kerning', components: string[], transforms?: ComponentTransform[]) => {
        const character = props.targetLigature;
        if (!character.unicode) {
            showNotification("Cannot modify a character without a Unicode ID.", "error");
            return;
        }

        // Cleanup Positioning Map if removing 'positioning' type
        if (character.position && type !== 'positioning') {
             const [b, m] = character.position;
             const baseC = props.allChars.get(b);
             const markC = props.allChars.get(m);
             if (baseC?.unicode !== undefined && markC?.unicode !== undefined) {
                 const key = `${baseC.unicode}-${markC.unicode}`;
                 if (markPositioningMap.has(key)) {
                     const nm = new Map(markPositioningMap);
                     nm.delete(key);
                     positioningDispatch({type: 'SET_MAP', payload: nm});
                 }
             }
        }
    
        characterDispatch({
            type: 'UPDATE_CHARACTER_SETS',
            payload: (prevSets: CharacterSet[] | null) => {
                if (!prevSets) return null;
                return prevSets.map(set => ({
                    ...set,
                    characters: set.characters.map(c => {
                        if (c.unicode === character.unicode) {
                            const updated: Character = { ...character };
                            // Clear all construction types
                            delete updated.kern;
                            delete updated.position;
                            delete updated.link;
                            delete updated.composite;
                            delete updated.compositeTransform;
    
                            // Set the new type
                            if (type === 'link') updated.link = components;
                            if (type === 'composite') {
                                updated.composite = components;
                                if (transforms) updated.compositeTransform = transforms;
                            }
                            if (type === 'positioning') updated.position = components as [string, string];
                            if (type === 'kerning') updated.kern = components as [string, string];
                            
                            // Update tags
                            if (type === 'positioning' && session.gpos) updated.gpos = session.gpos;
                            if (type === 'positioning' && session.gsub) updated.gsub = session.gsub;

                            // Update metadata
                            if (session.glyphClass) updated.glyphClass = session.glyphClass;
                            if (session.advWidth !== undefined) updated.advWidth = session.advWidth;

                            return updated;
                        }
                        return c;
                    })
                }));
            }
        });
    
        // If changing to a virtual type, ensure any old drawing data is removed.
        if (type === 'positioning' || type === 'kerning') {
            glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode: character.unicode } });
        } 
        
        showNotification("Construction type changed.", "success");
    
    }, [props, characterDispatch, glyphDataDispatch, showNotification, markPositioningMap, positioningDispatch, session.gpos, session.gsub, session.glyphClass, session.advWidth]);


    const isPositioned = useMemo(() => props.markPositioningMap.has(`${props.baseChar.unicode}-${props.markChar.unicode}`), [props.markPositioningMap, props.baseChar, props.markChar]);
    const isGsubPair = useMemo(() => {
        if (!props.positioningRules) return false;
        const rule = props.positioningRules.find(r => 
            expandMembers(r.base, props.groups, props.characterSets).includes(props.baseChar.name) && 
            expandMembers(r.mark, props.groups, props.characterSets).includes(props.baseChar.name)
        );
        return !!rule?.gsub;
    }, [props.positioningRules, props.baseChar, props.groups, props.characterSets]);

    const classSiblings = useMemo(() => {
        if (session.activeAttachmentClass && session.activeClassType) {
             const members = expandMembers(session.activeAttachmentClass.members, props.groups, props.characterSets);
             const siblings: any[] = [];
             members.forEach(memberName => {
                 let sBase = props.baseChar; let sMark = props.markChar;
                 if (session.activeClassType === 'mark') { const c = props.allChars.get(memberName); if (c) sMark = c; }
                 else { const c = props.allChars.get(memberName); if (c) sBase = c; }
                 
                 if (sBase.unicode === undefined || sMark.unicode === undefined) return;
                 
                 // Filter out pairs where either component is not drawn
                 const baseDrawn = isGlyphDrawn(props.glyphDataMap.get(sBase.unicode));
                 const markDrawn = isGlyphDrawn(props.glyphDataMap.get(sMark.unicode));
                 if (!baseDrawn || !markDrawn) return;

                 const key = `${sBase.unicode}-${sMark.unicode}`;
                 const lig = props.allLigaturesByKey.get(key);
                 if (lig) siblings.push({ base: sBase, mark: sMark, ligature: lig });
             });
             return siblings;
        }
        return [];
    }, [session.activeAttachmentClass, session.activeClassType, props.baseChar, props.markChar, props.groups, props.characterSets, props.allChars, props.allLigaturesByKey, props.glyphDataMap]);

    const handleToggleLink = () => {
        const newIsLinked = !session.isLinked;
        session.setIsLinked(newIsLinked);
        const pairNameKey = `${props.baseChar.name}-${props.markChar.name}`;
        
        const updateClassList = (classes: any[], setter: (c: any[]) => void) => {
             const newClasses = deepClone(classes);
             const cls = newClasses.find(c => expandMembers(c.members, props.groups, props.characterSets).includes(session.activeClassType === 'mark' ? props.markChar.name : props.baseChar.name));
             if (cls) {
                 if (!cls.exceptPairs) cls.exceptPairs = [];
                 if (newIsLinked) cls.exceptPairs = cls.exceptPairs.filter((p: string) => p !== pairNameKey);
                 else if (!cls.exceptPairs.includes(pairNameKey)) cls.exceptPairs.push(pairNameKey);
                 setter(newClasses);
             }
        };

        if (session.activeClassType === 'mark' && props.markAttachmentClasses) updateClassList(props.markAttachmentClasses, setMarkAttachmentClasses);
        if (session.activeClassType === 'base' && props.baseAttachmentClasses) updateClassList(props.baseAttachmentClasses, setBaseAttachmentClasses);
        if (newIsLinked) showNotification(t('glyphRelinkedSuccess'), "success");
    };

    const reuseSources = useMemo(() => {
        const sources: Character[] = []; const seen = new Set<number>();
        props.characterSets.forEach(set => set.characters.forEach(c => {
            if (c.unicode !== undefined && c.glyphClass !== 'mark' && c.unicode !== props.baseChar.unicode && props.markPositioningMap.has(`${c.unicode}-${props.markChar.unicode}`)) {
                if (!seen.has(c.unicode)) { sources.push(c); seen.add(c.unicode); }
            }
        }));
        return sources;
    }, [props.characterSets, props.markPositioningMap, props.baseChar, props.markChar]);

    const handleReuse = (sourceBase: Character) => {
        const sourceOffset = props.markPositioningMap.get(`${sourceBase.unicode}-${props.markChar.unicode}`);
        if (!sourceOffset) return;
        const moveX = sourceOffset.x - session.currentOffset.x, moveY = sourceOffset.y - session.currentOffset.y;
        const newPaths = session.markPaths.map(p => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + moveX, y: seg.point.y + moveY }}))) : undefined
        }));
        session.handlePathsChange(newPaths); setIsReusePanelOpen(false); showNotification(t('positionsCopied'), 'success');
    };

    const handleZoomAction = useCallback((factor: number) => {
        const oldZoom = session.zoom;
        const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));
        const screenCenter = 500;
        const designPointAtCenter = {
            x: (screenCenter - session.viewOffset.x) / oldZoom,
            y: (screenCenter - session.viewOffset.y) / oldZoom
        };
        const newOffset = {
            x: screenCenter - designPointAtCenter.x * newZoom,
            y: screenCenter - designPointAtCenter.y * newZoom
        };
        session.setViewOffset(newOffset);
        session.setZoom(newZoom);
    }, [session]);
    
    const handleDetach = () => {
        if (!props.onConvertToComposite) return;
        const transforms: ComponentTransform[] = [
            { scale: 1, x: 0, y: 0, mode: 'relative' }, // Base
            { scale: 1, x: session.currentOffset.x, y: session.currentOffset.y, mode: 'absolute' } // Mark
        ];
        props.onConvertToComposite(transforms);
        setIsDetachConfirmOpen(false);
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full bg-white dark:bg-gray-900 min-h-0 relative overflow-hidden">
            <PositioningEditorHeader 
                targetLigature={props.targetLigature} 
                prevPair={props.hasPrev} 
                nextPair={props.hasNext}
                onNavigate={session.handleNavigationAttempt} 
                onDelete={props.onDelete}
                activeAttachmentClass={session.activeAttachmentClass} 
                isLinked={session.isLinked} 
                isPivot={session.isPivot}
                canEdit={session.canEdit} 
                isPositioned={isPositioned} 
                onResetRequest={() => setIsResetConfirmOpen(true)} 
                isGsubPair={isGsubPair}
                lsb={session.lsb} setLsb={session.setLsb} rsb={session.rsb} setRsb={session.setRsb} 
                metrics={props.metrics} 
                isAutosaveEnabled={props.settings.isAutosaveEnabled}
                onSaveRequest={() => session.handleSave()} 
                isLargeScreen={isLargeScreen} 
                isStripExpanded={isStripExpanded}
                isDirty={session.hasUnsavedChanges}
                onConfirmPosition={() => props.onConfirmPosition(props.baseChar, props.markChar, props.targetLigature)}
                onDetach={props.onConvertToComposite ? () => setIsDetachConfirmOpen(true) : undefined}
                allCharacterSets={props.characterSets}
                onSaveConstruction={onSaveConstruction}
                characterDispatch={characterDispatch}
                glyphDataDispatch={glyphDataDispatch}
                onPathsChange={session.handlePathsChange}
                glyphClass={session.glyphClass} setGlyphClass={session.setGlyphClass}
                advWidth={session.advWidth} setAdvWidth={session.setAdvWidth}
                liga={session.liga} setLiga={session.setLiga}
                position={session.position} setPosition={session.setPosition}
                /* FIX: Added missing 'session.' prefix to setKern, setGpos, and setGsub props to resolve 'Cannot find name' errors. */
                kern={session.kern} setKern={session.setKern}
                gpos={session.gpos} setGpos={session.setGpos}
                gsub={session.gsub} setGsub={session.setGsub}
            />

            <PositioningEditorWorkspace 
                markPaths={session.markPaths} basePaths={session.basePaths} targetLigature={props.targetLigature} onPathsChange={session.handlePathsChange}
                pageTool={pageTool} onToggleTool={() => setPageTool(t => t === 'select' ? 'pan' : 'select')} zoom={session.zoom} setZoom={session.setZoom}
                viewOffset={session.viewOffset} setViewOffset={session.setViewOffset} onZoom={handleZoomAction}
                onReuseClick={() => setIsReusePanelOpen(!isReusePanelOpen)} canEdit={session.canEdit} 
                lockedMessage={!session.canEdit ? t('This pair is synced to {pivot}. Unlink to edit this specific pair, or edit {pivot} to update the whole class.', { pivot: session.pivotName || 'Class Representative' }) : undefined}
                movementConstraint={session.movementConstraint as 'horizontal' | 'vertical' | 'none'} settings={props.settings} metrics={props.metrics} showStrip={!!session.activeAttachmentClass}
                classSiblings={classSiblings} activePair={{ base: props.baseChar, mark: props.markChar, ligature: props.targetLigature }} 
                pivotChar={session.isPivot ? (session.activeAttachmentClass?.name ? null : props.markChar) : (session.pivotName ? props.allChars.get(session.pivotName) : null)}
                glyphDataMap={props.glyphDataMap} anchorDelta={VEC.sub(session.currentOffset, session.alignmentOffset)} isLinked={session.isLinked} onToggleLink={handleToggleLink}
                handleSelectSibling={(p) => { if (props.setEditingPair) props.setEditingPair(p); }} markAttachmentRules={props.markAttachmentRules} positioningRules={props.positioningRules}
                characterSets={props.characterSets} groups={props.groups} isStripExpanded={isStripExpanded} setIsStripExpanded={setIsStripExpanded}
                activeAttachmentClass={session.activeAttachmentClass} hasDualContext={session.hasDualContext} activeClassType={session.activeClassType} onToggleContext={session.setOverrideClassType}
                isLargeScreen={isLargeScreen}
                manualX={session.manualX} manualY={session.manualY} onManualChange={(a, v) => a === 'x' ? session.setManualX(v) : session.setManualY(v)} onManualCommit={session.handleManualCommit}
                setIsInputFocused={session.setIsInputFocused}
                selectedPathIds={session.selectedPathIds} onSelectionChange={session.setSelectedPathIds}
                sourceGlyphs={sourceGlyphs}
                onSelectCharacter={session.handleNavigationAttempt}
                allCharsByName={props.allChars}
                markPositioningMap={props.markPositioningMap}
            />

            {isReusePanelOpen && (
                 <div className="absolute top-20 left-4 z-30 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80 max-h-[500px] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-gray-900 dark:text-white">{t('copyPositionFrom')}</h4>
                        <button onClick={() => setIsReusePanelOpen(false)}><CloseIcon className="w-5 h-5"/></button>
                    </div>
                    <div className="flex-grow overflow-y-auto pr-1 grid grid-cols-2 gap-3">
                        {reuseSources.length > 0 ? reuseSources.map(s => <ReusePreviewCard key={s.unicode} baseChar={s} markChar={props.markChar} onClick={() => handleReuse(s)} glyphDataMap={props.glyphDataMap} strokeThickness={props.settings.strokeThickness} markPositioningMap={props.markPositioningMap} glyphVersion={props.glyphVersion} displayLabel={s.label || s.name} />) : <div className="col-span-2 text-center text-gray-500 italic py-4">{t('noCompleteSources')}</div>}
                    </div>
                 </div>
            )}
            
            <UnsavedChangesModal isOpen={session.isUnsavedModalOpen} onClose={() => session.setIsUnsavedModalOpen(false)} onSave={() => {session.handleSave(); if(session.pendingNavigation) session.handleNavigationAttempt(session.pendingNavigation);}} onDiscard={session.confirmDiscard} />
            <Modal isOpen={isResetConfirmOpen} onClose={() => setIsResetConfirmOpen(false)} title={t('confirmResetTitle')} footer={<><button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={() => { props.onReset(props.baseChar, props.markChar, props.targetLigature); setIsResetConfirmOpen(false); }} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button></>}><p>{t('confirmResetSingleMessage', { name: props.targetLigature.name })}</p></Modal>
            
            <Modal 
                isOpen={isDetachConfirmOpen} 
                onClose={() => setIsDetachConfirmOpen(false)} 
                title="Detach Rule?" 
                footer={<><button onClick={() => setIsDetachConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={handleDetach} className="px-4 py-2 bg-indigo-600 text-white rounded">Detach & Edit</button></>}
            >
                <p>This will convert the positioning rule into a static composite glyph. It will no longer update automatically if the rule changes, but you will be able to edit the paths manually.</p>
            </Modal>
        </div>
    );
};

export default React.memo(PositioningEditorPage);
