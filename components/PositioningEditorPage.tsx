
import React, { useState, useMemo, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { DRAWING_CANVAS_SIZE } from '../constants';
import { AppSettings, Character, FontMetrics, GlyphData, MarkAttachmentRules, MarkPositioningMap, Point, PositioningRules, CharacterSet } from '../types';
import ReusePreviewCard from './ReusePreviewCard';
import UnsavedChangesModal from './UnsavedChangesModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Modal from './Modal';
import { useRules } from '../contexts/RulesContext';
import { useProject } from '../contexts/ProjectContext';
import PositioningEditorHeader from './positioning/PositioningEditorHeader';
import PositioningEditorWorkspace from './positioning/PositioningEditorWorkspace';
import { CloseIcon } from '../constants';
import { VEC } from '../utils/vectorUtils';
import { usePositioningSession } from '../hooks/positioning/usePositioningSession';
import { deepClone } from '../utils/cloneUtils';
import { expandMembers } from '../services/groupExpansionService';

interface PositioningEditorPageProps {
    baseChar: Character;
    markChar: Character;
    targetLigature: Character;
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    onSave: (targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newBearings: { lsb?: number, rsb?: number }, isAutosave?: boolean) => void;
    onClose: () => void;
    onReset: (baseChar: Character, markChar: Character, targetLigature: Character) => void;
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    positioningRules: PositioningRules[] | null;
    allChars: Map<string, Character>;
    allPairs: { base: Character, mark: Character, ligature: Character }[];
    currentIndex: number | null;
    onNavigate: (newIndex: number) => void;
    setEditingPair?: (pair: { base: Character, mark: Character, ligature: Character }) => void;
    characterSets: CharacterSet[];
    glyphVersion: number;
    allLigaturesByKey: Map<string, Character>;
}

const PositioningEditorPage: React.FC<PositioningEditorPageProps> = (props) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const { state: rulesState } = useRules();
    const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);
    const { markAttachmentClasses, setMarkAttachmentClasses, baseAttachmentClasses, setBaseAttachmentClasses } = useProject();
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    const [isReusePanelOpen, setIsReusePanelOpen] = useState(false);
    const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isStripExpanded, setIsStripExpanded] = useState(false);
    const [pageTool, setPageTool] = useState<'select' | 'pan'>('select');

    const session = usePositioningSession({
        ...props,
        groups,
        markAttachmentClasses,
        baseAttachmentClasses,
        allPairsCount: props.allPairs.length
    });

    const isPositioned = useMemo(() => props.markPositioningMap.has(`${props.baseChar.unicode}-${props.markChar.unicode}`), [props.markPositioningMap, props.baseChar, props.markChar]);
    const isGsubPair = useMemo(() => {
        if (!props.positioningRules) return false;
        const rule = props.positioningRules.find(r => 
            expandMembers(r.base, groups, props.characterSets).includes(props.baseChar.name) && 
            expandMembers(r.mark, groups, props.characterSets).includes(props.markChar.name)
        );
        return !!rule?.gsub;
    }, [props.positioningRules, props.baseChar, props.markChar, groups, props.characterSets]);

    const classSiblings = useMemo(() => {
        if (session.activeAttachmentClass && session.activeClassType) {
             const members = expandMembers(session.activeAttachmentClass.members, groups, props.characterSets);
             const siblings: any[] = [];
             members.forEach(memberName => {
                 let sBase = props.baseChar; let sMark = props.markChar;
                 if (session.activeClassType === 'mark') { const c = props.allChars.get(memberName); if (c) sMark = c; }
                 else { const c = props.allChars.get(memberName); if (c) sBase = c; }
                 if (sBase.unicode === undefined || sMark.unicode === undefined) return;
                 const key = `${sBase.unicode}-${sMark.unicode}`;
                 const lig = props.allLigaturesByKey.get(key);
                 if (lig) siblings.push({ base: sBase, mark: sMark, ligature: lig });
             });
             return siblings;
        }
        return [];
    }, [session.activeAttachmentClass, session.activeClassType, props.baseChar, props.markChar, groups, props.characterSets, props.allChars, props.allLigaturesByKey]);

    const handleToggleLink = () => {
        const newIsLinked = !session.isLinked;
        session.setIsLinked(newIsLinked);
        const pairNameKey = `${props.baseChar.name}-${props.markChar.name}`;
        
        const updateClassList = (classes: any[], setter: (c: any[]) => void) => {
             const newClasses = deepClone(classes);
             const cls = newClasses.find(c => expandMembers(c.members, groups, props.characterSets).includes(session.activeClassType === 'mark' ? props.markChar.name : props.baseChar.name));
             if (cls) {
                 if (!cls.exceptPairs) cls.exceptPairs = [];
                 if (newIsLinked) cls.exceptPairs = cls.exceptPairs.filter((p: string) => p !== pairNameKey);
                 else if (!cls.exceptPairs.includes(pairNameKey)) cls.exceptPairs.push(pairNameKey);
                 setter(newClasses);
             }
        };

        if (session.activeClassType === 'mark' && markAttachmentClasses) updateClassList(markAttachmentClasses, setMarkAttachmentClasses);
        if (session.activeClassType === 'base' && baseAttachmentClasses) updateClassList(baseAttachmentClasses, setBaseAttachmentClasses);
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

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-800 animate-fade-in-up">
            <PositioningEditorHeader 
                targetLigature={props.targetLigature} prevPair={props.currentIndex! > 0} nextPair={props.currentIndex! < props.allPairs.length - 1}
                onNavigate={session.handleNavigationAttempt} activeAttachmentClass={session.activeAttachmentClass} isLinked={session.isLinked} isPivot={session.isPivot}
                canEdit={session.canEdit} isPositioned={isPositioned} onResetRequest={() => setIsResetConfirmOpen(true)} isGsubPair={isGsubPair}
                isPropertiesPanelOpen={isPropertiesPanelOpen} setIsPropertiesPanelOpen={setIsPropertiesPanelOpen}
                lsb={session.lsb} setLsb={session.setLsb} rsb={session.rsb} setRsb={session.setRsb} metrics={props.metrics} isAutosaveEnabled={props.settings.isAutosaveEnabled}
                onSaveRequest={() => session.handleSave()} isLargeScreen={isLargeScreen} isStripExpanded={isStripExpanded}
            />

            <PositioningEditorWorkspace 
                markPaths={session.markPaths} basePaths={session.basePaths} targetLigature={props.targetLigature} onPathsChange={session.handlePathsChange}
                pageTool={pageTool} onToggleTool={() => setPageTool(t => t === 'select' ? 'pan' : 'select')} zoom={session.zoom} setZoom={session.setZoom}
                viewOffset={session.viewOffset} setViewOffset={session.setViewOffset} onZoom={(f) => { const nZ = Math.max(0.1, Math.min(10, session.zoom*f)); const c = DRAWING_CANVAS_SIZE/2; session.setViewOffset({ x: c - (c - session.viewOffset.x) * (nZ / session.zoom), y: c - (c - session.viewOffset.y) * (nZ / session.zoom) }); session.setZoom(nZ); }}
                onReuseClick={() => setIsReusePanelOpen(!isReusePanelOpen)} canEdit={session.canEdit} 
                lockedMessage={!session.canEdit ? t('This pair is synced to {pivot}. Unlink to edit this specific pair, or edit {pivot} to update the whole class.', { pivot: session.pivotName || 'Class Representative' }) : undefined}
                movementConstraint={session.movementConstraint as 'horizontal' | 'vertical' | 'none'} settings={props.settings} metrics={props.metrics} showStrip={!!session.activeAttachmentClass}
                classSiblings={classSiblings} activePair={{ base: props.baseChar, mark: props.markChar, ligature: props.targetLigature }} 
                pivotChar={session.isPivot ? (session.activeAttachmentClass?.name ? null : props.markChar) : (session.pivotName ? props.allChars.get(session.pivotName) : null)}
                glyphDataMap={props.glyphDataMap} anchorDelta={VEC.sub(session.currentOffset, session.alignmentOffset)} isLinked={session.isLinked} onToggleLink={handleToggleLink}
                handleSelectSibling={(p) => { if (props.setEditingPair) props.setEditingPair(p); }} markAttachmentRules={props.markAttachmentRules} positioningRules={props.positioningRules}
                characterSets={props.characterSets} groups={groups} isStripExpanded={isStripExpanded} setIsStripExpanded={setIsStripExpanded}
                activeAttachmentClass={session.activeAttachmentClass} hasDualContext={session.hasDualContext} activeClassType={session.activeClassType} onToggleContext={session.setOverrideClassType}
                isLargeScreen={isLargeScreen}
                manualX={session.manualX} manualY={session.manualY} onManualChange={(a, v) => a === 'x' ? session.setManualX(v) : session.setManualY(v)} onManualCommit={session.handleManualCommit}
                setIsInputFocused={session.setIsInputFocused}
                selectedPathIds={session.selectedPathIds} onSelectionChange={session.setSelectedPathIds}
            />

            {isReusePanelOpen && (
                 <div className="absolute top-20 left-4 z-30 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80 max-h-[500px] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-gray-900 dark:text-white">{t('copyPositionFrom')}</h4>
                        <button onClick={() => setIsReusePanelOpen(false)}><CloseIcon className="w-5 h-5"/></button>
                    </div>
                    <div className="flex-grow overflow-y-auto pr-1 grid grid-cols-2 gap-3">
                        {reuseSources.length > 0 ? reuseSources.map(s => <ReusePreviewCard key={s.unicode} baseChar={s} markChar={props.markChar} onClick={() => handleReuse(s)} glyphDataMap={props.glyphDataMap} strokeThickness={props.settings.strokeThickness} markPositioningMap={props.markPositioningMap} glyphVersion={props.glyphVersion} displayLabel={s.name} />) : <div className="col-span-2 text-center text-gray-500 italic py-4">{t('noCompleteSources')}</div>}
                    </div>
                 </div>
            )}
            
            <UnsavedChangesModal isOpen={session.isUnsavedModalOpen} onClose={() => session.setIsUnsavedModalOpen(false)} onSave={() => {session.handleSave(); if(session.pendingNavigation) session.handleNavigationAttempt(session.pendingNavigation);}} onDiscard={() => {if(session.pendingNavigation) { if (session.pendingNavigation === 'back') props.onClose(); else if (session.pendingNavigation === 'prev') props.onNavigate(props.currentIndex! - 1); else if (session.pendingNavigation === 'next') props.onNavigate(props.currentIndex! + 1); } session.setIsUnsavedModalOpen(false);}} />
            <Modal isOpen={isResetConfirmOpen} onClose={() => setIsResetConfirmOpen(false)} title={t('confirmResetTitle')} footer={<><button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={() => { props.onReset(props.baseChar, props.markChar, props.targetLigature); setIsResetConfirmOpen(false); }} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button></>}><p>{t('confirmResetSingleMessage', { name: props.targetLigature.name })}</p></Modal>
        </div>
    );
};

export default React.memo(PositioningEditorPage);
