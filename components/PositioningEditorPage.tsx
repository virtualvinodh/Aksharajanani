import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { CloseIcon, DRAWING_CANVAS_SIZE } from '../constants';
import { AppSettings, Character, FontMetrics, GlyphData, MarkAttachmentRules, MarkPositioningMap, Path, Point, PositioningRules, CharacterSet, AttachmentClass, AttachmentPoint } from '../types';
import { calculateDefaultMarkOffset, getAccurateGlyphBBox, resolveAttachmentRule, getAttachmentPointCoords } from '../services/glyphRenderService';
import { updatePositioningAndCascade } from '../services/positioningService';
import { isGlyphDrawn } from '../utils/glyphUtils';
import ReusePreviewCard from './ReusePreviewCard';
import UnsavedChangesModal from './UnsavedChangesModal';
import { VEC } from '../utils/vectorUtils';
import PositioningToolbar from './PositioningToolbar';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Modal from './Modal';
import { deepClone } from '../utils/cloneUtils';
import { useRules } from '../contexts/RulesContext';
import { expandMembers } from '../services/groupExpansionService';
import { useProject } from '../contexts/ProjectContext';
import PositioningEditorHeader from './positioning/PositioningEditorHeader';
import PositioningEditorWorkspace from './positioning/PositioningEditorWorkspace';

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

const PositioningEditorPage: React.FC<PositioningEditorPageProps> = ({
    baseChar, markChar, targetLigature, glyphDataMap, markPositioningMap, onSave, onClose, onReset, settings, metrics, markAttachmentRules, positioningRules, allChars,
    allPairs, currentIndex, onNavigate, setEditingPair, characterSets, glyphVersion, allLigaturesByKey
}) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const { state: rulesState } = useRules();
    const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);
    
    const { 
        markAttachmentClasses, setMarkAttachmentClasses,
        baseAttachmentClasses, setBaseAttachmentClasses 
    } = useProject();

    const [markPaths, setMarkPaths] = useState<Path[]>([]);
    const [initialMarkPaths, setInitialMarkPaths] = useState<Path[]>([]);
    const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
    
    const [isReusePanelOpen, setIsReusePanelOpen] = useState(false);
    const autosaveTimeout = useRef<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [pageTool, setPageTool] = useState<'select' | 'pan'>('select');
    
    const [isLinked, setIsLinked] = useState(true);
    const [currentOffset, setCurrentOffset] = useState<Point>({ x: 0, y: 0 });
    const [overrideClassType, setOverrideClassType] = useState<'mark' | 'base' | null>(null);
    const [isStripExpanded, setIsStripExpanded] = useState(false);
    
    const [lsb, setLsb] = useState<number | undefined>(targetLigature.lsb);
    const [rsb, setRsb] = useState<number | undefined>(targetLigature.rsb);
    const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);

    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | 'back' | null>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    const [manualX, setManualX] = useState<string>('0');
    const [manualY, setManualY] = useState<string>('0');
    const [isInputFocused, setIsInputFocused] = useState(false);

    const pairIdentifier = `${baseChar.unicode}-${markChar.unicode}`;
    const pairNameKey = `${baseChar.name}-${markChar.name}`;
    const lastPairIdentifierRef = useRef<string | null>(null);
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    const isPositioned = useMemo(() => markPositioningMap.has(pairIdentifier), [markPositioningMap, pairIdentifier]);
    
    const parentRule = useMemo(() => {
        if (!positioningRules) return null;
        return positioningRules.find(rule => 
            expandMembers(rule.base, groups, characterSets).includes(baseChar.name) && 
            expandMembers(rule.mark, groups, characterSets).includes(markChar.name)
        );
    }, [positioningRules, baseChar, markChar, groups, characterSets]);

    const isGsubPair = !!parentRule?.gsub;

    const { pivotName, isPivot, activeAttachmentClass, activeClassType, hasDualContext } = useMemo(() => {
        let mClass = markAttachmentClasses?.find(c => expandMembers(c.members, groups, characterSets).includes(markChar.name));
        let bClass = baseAttachmentClasses?.find(c => expandMembers(c.members, groups, characterSets).includes(baseChar.name));
        const hasDual = !!(mClass && bClass);
        let targetType: 'mark' | 'base' | null = null;
        let activeClass: AttachmentClass | undefined;
        if (overrideClassType) {
             if (overrideClassType === 'mark' && mClass) { targetType = 'mark'; activeClass = mClass; }
             else if (overrideClassType === 'base' && bClass) { targetType = 'base'; activeClass = bClass; }
        }
        if (!activeClass) {
             if (mClass) { targetType = 'mark'; activeClass = mClass; }
             else if (bClass) { targetType = 'base'; activeClass = bClass; }
        }
        let pName: string | undefined;
        let isP = false;
        if (activeClass && targetType) {
             const members = expandMembers(activeClass.members, groups, characterSets);
             const effectiveLeader = members.find(memberName => {
                 const pairKey = targetType === 'mark' ? `${baseChar.name}-${memberName}` : `${memberName}-${markChar.name}`;
                 return !activeClass?.exceptPairs?.includes(pairKey);
             });
             pName = effectiveLeader || members[0];
             if (targetType === 'mark') isP = markChar.name === pName;
             else isP = baseChar.name === pName;
        }
        return { pivotName: pName, isPivot: isP, activeAttachmentClass: activeClass, activeClassType: targetType, hasDualContext: hasDual };
    }, [markAttachmentClasses, baseAttachmentClasses, markChar.name, baseChar.name, groups, characterSets, overrideClassType]);

    const classSiblings = useMemo(() => {
        if (activeAttachmentClass && activeClassType) {
             const members = expandMembers(activeAttachmentClass.members, groups, characterSets);
             const siblings: any[] = [];
             members.forEach(memberName => {
                 let sBase = baseChar; let sMark = markChar;
                 if (activeClassType === 'mark') { const c = allChars.get(memberName); if (c) sMark = c; }
                 else { const c = allChars.get(memberName); if (c) sBase = c; }
                 if (sBase.unicode === undefined || sMark.unicode === undefined) return;
                 const bData = glyphDataMap.get(sBase.unicode); const mData = glyphDataMap.get(sMark.unicode);
                 if (isGlyphDrawn(bData) && isGlyphDrawn(mData)) {
                      const key = `${sBase.unicode}-${sMark.unicode}`;
                      const lig = allLigaturesByKey.get(key);
                      if (lig) siblings.push({ base: sBase, mark: sMark, ligature: lig });
                 }
             });
             return siblings;
        }
        return [];
    }, [activeAttachmentClass, activeClassType, baseChar, markChar, groups, characterSets, allChars, glyphDataMap, allLigaturesByKey]);

    const canEdit = !activeAttachmentClass || !isLinked || isPivot;
    const movementConstraint = (parentRule && (parentRule.movement === 'horizontal' || parentRule.movement === 'vertical')) ? parentRule.movement : 'none';

    const baseGlyph = glyphDataMap.get(baseChar.unicode);
    const baseBbox = useMemo(() => getAccurateGlyphBBox(baseGlyph?.paths ?? [], settings.strokeThickness), [baseGlyph, settings.strokeThickness]);
    
    const alignmentOffset = useMemo(() => {
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
        if (!baseBbox || !markBbox) return { x: 0, y: 0 };
        let rule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups) || ["topCenter", "bottomCenter"];
        const baseAnchor = getAttachmentPointCoords(baseBbox, rule[0] as AttachmentPoint);
        const markAnchor = getAttachmentPointCoords(markBbox, rule[1] as AttachmentPoint);
        const calculatedOffset = VEC.sub(baseAnchor, markAnchor);
        if (movementConstraint === 'horizontal') calculatedOffset.y = 0;
        if (movementConstraint === 'vertical') calculatedOffset.x = 0;
        return calculatedOffset;
    }, [baseChar, markChar, baseBbox, markAttachmentRules, characterSets, groups, settings.strokeThickness, glyphDataMap, movementConstraint]);

    useEffect(() => {
        const key = `${baseChar.unicode}-${markChar.unicode}`;
        let offset = markPositioningMap.get(key);
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
        if (!offset && baseBbox) {
            offset = calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups, movementConstraint);
        }
        
        // Safety: ensure offset is never undefined
        const effectiveOffset = offset || { x: 0, y: 0 };
        setCurrentOffset(effectiveOffset);

        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths || [];
        const newMarkPaths = deepClone(originalMarkPaths).map((p: Path) => ({
            ...p,
            groupId: "positioning-mark-group",
            points: p.points.map(pt => ({ x: pt.x + effectiveOffset.x, y: pt.y + effectiveOffset.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + effectiveOffset.x, y: seg.point.y + effectiveOffset.y }}))) : undefined
        }));
        setMarkPaths(newMarkPaths);
        setInitialMarkPaths(deepClone(newMarkPaths));
        
        setSelectedPathIds(new Set(newMarkPaths.map(p => p.id)));

        setLsb(targetLigature.lsb); setRsb(targetLigature.rsb);
        setIsLinked(!(activeAttachmentClass?.exceptPairs?.includes(pairNameKey)));

        // Robust auto-fit logic
        const allPaths = [...(baseGlyph?.paths || []), ...newMarkPaths];
        if (allPaths.length > 0) {
            const combinedBbox = getAccurateGlyphBBox(allPaths, settings.strokeThickness);
            // Check if we need to fit (either first time or pair changed)
            if (combinedBbox && (lastPairIdentifierRef.current !== pairIdentifier || zoom === 1)) {
                const padding = 100;
                const newZoom = Math.min(DRAWING_CANVAS_SIZE / (combinedBbox.width + padding), DRAWING_CANVAS_SIZE / (combinedBbox.height + padding), 2.5);
                const newViewOffset = { 
                    x: (DRAWING_CANVAS_SIZE/2) - (combinedBbox.x + combinedBbox.width/2) * newZoom, 
                    y: (DRAWING_CANVAS_SIZE/2) - (combinedBbox.y + combinedBbox.height/2) * newZoom 
                };
                setZoom(newZoom); setViewOffset(newViewOffset);
                lastPairIdentifierRef.current = pairIdentifier;
            }
        }
    }, [baseChar, markChar, targetLigature, markPositioningMap, glyphDataMap, markAttachmentRules, baseBbox, metrics, settings.strokeThickness, characterSets, pairIdentifier, groups, activeAttachmentClass, pairNameKey, movementConstraint, glyphVersion]);

    const handleSave = useCallback((pathsToSave: Path[], isAutosave: boolean = false) => {
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
        const finalBbox = getAccurateGlyphBBox(pathsToSave, settings.strokeThickness);
        let finalOffset: Point = { x: 0, y: 0 };
        if (originalBbox && finalBbox) finalOffset = { x: finalBbox.x - originalBbox.x, y: finalBbox.y - originalBbox.y };
        
        onSave(targetLigature, { paths: [...(baseGlyph?.paths ?? []), ...pathsToSave] }, finalOffset, { lsb, rsb }, isAutosave);
        
        setInitialMarkPaths(deepClone(pathsToSave));
    }, [glyphDataMap, markChar.unicode, baseGlyph?.paths, onSave, targetLigature, lsb, rsb, settings.strokeThickness, isLinked, activeAttachmentClass, parentRule]);

    const handlePathsChange = useCallback((newPaths: Path[]) => {
        if (!canEdit) return;
        setMarkPaths(newPaths);
        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => handleSave(newPaths, true), 500);
        }
    }, [settings.isAutosaveEnabled, handleSave, canEdit]);

    useEffect(() => {
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
        const currentBbox = getAccurateGlyphBBox(markPaths, settings.strokeThickness);
        let newCurrentOffset = { x: 0, y: 0 };
        if (originalBbox && currentBbox) newCurrentOffset = { x: currentBbox.x - originalBbox.x, y: currentBbox.y - originalBbox.y };
        setCurrentOffset(newCurrentOffset);
        if (!isInputFocused) {
            setManualX(Math.round(newCurrentOffset.x - alignmentOffset.x).toString());
            setManualY(Math.round(newCurrentOffset.y - alignmentOffset.y).toString());
        }
    }, [markPaths, glyphDataMap, markChar, settings.strokeThickness, isInputFocused, alignmentOffset]);

    const handleManualCommit = () => {
        if (!canEdit) return;
        const inputX = parseFloat(manualX), inputY = parseFloat(manualY);
        if (isNaN(inputX) || isNaN(inputY)) return;
        const targetX = alignmentOffset.x + inputX, targetY = alignmentOffset.y + inputY;
        const moveX = targetX - currentOffset.x, moveY = targetY - currentOffset.y;
        if (Math.abs(moveX) < 0.01 && Math.abs(moveY) < 0.01) return;
        const newPaths = markPaths.map(p => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + moveX, y: seg.point.y + moveY }}))) : undefined
        }));
        handlePathsChange(newPaths);
    };

    const handleNavigationAttempt = useCallback((direction: 'prev' | 'next' | 'back') => {
        const hasChanges = JSON.stringify(markPaths) !== JSON.stringify(initialMarkPaths) || lsb !== targetLigature.lsb || rsb !== targetLigature.rsb;
        const proceed = () => { if (direction === 'back') onClose(); else if (direction === 'prev' && currentIndex! > 0) onNavigate(currentIndex! - 1); else if (currentIndex! < allPairs.length - 1) onNavigate(currentIndex! + 1); };
        if (settings.isAutosaveEnabled) { if (hasChanges) handleSave(markPaths, false); proceed(); }
        else if (hasChanges) { setPendingNavigation(direction); setIsUnsavedModalOpen(true); }
        else proceed();
    }, [settings.isAutosaveEnabled, markPaths, initialMarkPaths, lsb, rsb, targetLigature, onClose, currentIndex, onNavigate, allPairs.length, handleSave]);

    const handleToggleLink = () => {
        const newIsLinked = !isLinked;
        setIsLinked(newIsLinked);
        
        const updateClassList = (classes: AttachmentClass[], setter: (c: AttachmentClass[]) => void) => {
             const newClasses = deepClone(classes);
             const cls = newClasses.find(c => expandMembers(c.members, groups, characterSets).includes(activeClassType === 'mark' ? markChar.name : baseChar.name));
             if (cls) {
                 if (!cls.exceptPairs) cls.exceptPairs = [];
                 if (newIsLinked) cls.exceptPairs = cls.exceptPairs.filter(p => p !== pairNameKey);
                 else if (!cls.exceptPairs.includes(pairNameKey)) cls.exceptPairs.push(pairNameKey);
                 setter(newClasses);
                 return cls;
             }
             return null;
        };

        let activeClsRef: AttachmentClass | null = null;
        if (activeClassType === 'mark' && markAttachmentClasses) activeClsRef = updateClassList(markAttachmentClasses, setMarkAttachmentClasses);
        if (activeClassType === 'base' && baseAttachmentClasses) activeClsRef = updateClassList(baseAttachmentClasses, setBaseAttachmentClasses);
        
        if (newIsLinked && activeClsRef) {
            const members = expandMembers(activeClsRef.members, groups, characterSets);
            const pivotName = members.find(m => !activeClsRef?.exceptPairs?.includes(activeClassType === 'mark' ? `${baseChar.name}-${m}` : `${m}-${markChar.name}`)) || members[0];
            
            const pivotBase = activeClassType === 'mark' ? baseChar : allChars.get(pivotName);
            const pivotMark = activeClassType === 'mark' ? allChars.get(pivotName) : markChar;
            
            if (pivotBase && pivotMark) {
                const pivotKey = `${pivotBase.unicode}-${pivotMark.unicode}`;
                const pivotOffset = markPositioningMap.get(pivotKey);
                
                if (pivotOffset) {
                    const pbGlyph = glyphDataMap.get(pivotBase.unicode);
                    const pmGlyph = glyphDataMap.get(pivotMark.unicode);
                    if (pbGlyph && pmGlyph) {
                        const pbBbox = getAccurateGlyphBBox(pbGlyph.paths, settings.strokeThickness);
                        const pmBbox = getAccurateGlyphBBox(pmGlyph.paths, settings.strokeThickness);
                        const pSnap = calculateDefaultMarkOffset(pivotBase, pivotMark, pbBbox, pmBbox, markAttachmentRules, metrics, characterSets, false, groups, movementConstraint);
                        const pDelta = VEC.sub(pivotOffset, pSnap);
                        const syncedOffset = VEC.add(alignmentOffset, pDelta);
                        
                        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
                        const newPaths = deepClone(originalMarkPaths).map((p: Path) => ({
                            ...p,
                            groupId: "positioning-mark-group",
                            points: p.points.map(pt => ({ x: pt.x + syncedOffset.x, y: pt.y + syncedOffset.y })),
                            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + syncedOffset.x, y: seg.point.y + syncedOffset.y }}))) : undefined
                        }));
                        
                        setMarkPaths(newPaths);
                        setCurrentOffset(syncedOffset);
                        handleSave(newPaths, false);
                        showNotification(t('glyphRelinkedSuccess'), "success");
                        return;
                    }
                }
            }
            handleSave(markPaths, false);
            showNotification(t('glyphRelinkedSuccess'), "success");
        }
    };

    const reuseSources = useMemo(() => {
        const sources: Character[] = []; const seen = new Set<number>();
        characterSets.forEach(set => set.characters.forEach(c => {
            if (c.unicode !== undefined && c.glyphClass !== 'mark' && c.unicode !== baseChar.unicode && markPositioningMap.has(`${c.unicode}-${markChar.unicode}`)) {
                if (!seen.has(c.unicode)) { sources.push(c); seen.add(c.unicode); }
            }
        }));
        return sources;
    }, [characterSets, markPositioningMap, baseChar, markChar]);

    const handleReuse = (sourceBase: Character) => {
        const sourceOffset = markPositioningMap.get(`${sourceBase.unicode}-${markChar.unicode}`);
        if (!sourceOffset) return;
        const moveX = sourceOffset.x - currentOffset.x, moveY = sourceOffset.y - currentOffset.y;
        const newPaths = markPaths.map(p => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + moveX, y: seg.point.y + moveY }}))) : undefined
        }));
        handlePathsChange(newPaths); setIsReusePanelOpen(false); showNotification(t('positionsCopied'), 'success');
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-800 animate-fade-in-up">
            <PositioningEditorHeader 
                targetLigature={targetLigature} prevPair={currentIndex! > 0} nextPair={currentIndex! < allPairs.length - 1}
                onNavigate={handleNavigationAttempt} activeAttachmentClass={activeAttachmentClass} isLinked={isLinked} isPivot={isPivot}
                canEdit={canEdit} isPositioned={isPositioned} onResetRequest={() => setIsResetConfirmOpen(true)} isGsubPair={isGsubPair}
                isPropertiesPanelOpen={isPropertiesPanelOpen} setIsPropertiesPanelOpen={setIsPropertiesPanelOpen}
                lsb={lsb} setLsb={setLsb} rsb={rsb} setRsb={setRsb} metrics={metrics} isAutosaveEnabled={settings.isAutosaveEnabled}
                onSaveRequest={() => handleSave(markPaths)} isLargeScreen={isLargeScreen} isStripExpanded={isStripExpanded}
            />

            <PositioningEditorWorkspace 
                markPaths={markPaths} basePaths={baseGlyph?.paths || []} targetLigature={targetLigature} onPathsChange={handlePathsChange}
                pageTool={pageTool} onToggleTool={() => setPageTool(t => t === 'select' ? 'pan' : 'select')} zoom={zoom} setZoom={setZoom}
                viewOffset={viewOffset} setViewOffset={setViewOffset} onZoom={(f) => { const nZ = Math.max(0.1, Math.min(10, zoom*f)); const c = DRAWING_CANVAS_SIZE/2; setViewOffset({ x: c - (c - viewOffset.x) * (nZ / zoom), y: c - (c - viewOffset.y) * (nZ / zoom) }); setZoom(nZ); }}
                onReuseClick={() => setIsReusePanelOpen(!isReusePanelOpen)} canEdit={canEdit} lockedMessage={!canEdit ? t('This pair is synced to {pivot}. Unlink to edit this specific pair, or edit {pivot} to update the whole class.', { pivot: pivotName || 'Class Representative' }) : undefined}
                movementConstraint={movementConstraint} settings={settings} metrics={metrics} showStrip={!!activeAttachmentClass}
                classSiblings={classSiblings} activePair={{ base: baseChar, mark: markChar, ligature: targetLigature }} pivotChar={isPivot ? (activeAttachmentClass?.name ? null : markChar) : (pivotName ? allChars.get(pivotName) : null)}
                glyphDataMap={glyphDataMap} anchorDelta={VEC.sub(currentOffset, alignmentOffset)} isLinked={isLinked} onToggleLink={handleToggleLink}
                handleSelectSibling={(p) => { if (setEditingPair) setEditingPair(p); }} markAttachmentRules={markAttachmentRules} positioningRules={positioningRules}
                characterSets={characterSets} groups={groups} isStripExpanded={isStripExpanded} setIsStripExpanded={setIsStripExpanded}
                activeAttachmentClass={activeAttachmentClass} hasDualContext={hasDualContext} activeClassType={activeClassType} onToggleContext={setOverrideClassType}
                isLargeScreen={isLargeScreen}
                manualX={manualX} manualY={manualY} onManualChange={(a, v) => a === 'x' ? setManualX(v) : setManualY(v)} onManualCommit={handleManualCommit}
                selectedPathIds={selectedPathIds} onSelectionChange={setSelectedPathIds}
            />

            {isReusePanelOpen && (
                 <div className="absolute top-20 left-4 z-30 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80 max-h-[500px] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-gray-900 dark:text-white">{t('copyPositionFrom')}</h4>
                        <button onClick={() => setIsReusePanelOpen(false)}><CloseIcon className="w-5 h-5"/></button>
                    </div>
                    <div className="flex-grow overflow-y-auto pr-1 grid grid-cols-2 gap-3">
                        {reuseSources.length > 0 ? reuseSources.map(s => <ReusePreviewCard key={s.unicode} baseChar={s} markChar={markChar} onClick={() => handleReuse(s)} glyphDataMap={glyphDataMap} strokeThickness={settings.strokeThickness} markPositioningMap={markPositioningMap} glyphVersion={glyphVersion} displayLabel={s.name} />) : <div className="col-span-2 text-center text-gray-500 italic py-4">{t('noCompleteSources')}</div>}
                    </div>
                 </div>
            )}
            
            <UnsavedChangesModal isOpen={isUnsavedModalOpen} onClose={() => setIsUnsavedModalOpen(false)} onSave={() => {handleSave(markPaths); if(pendingNavigation) handleNavigationAttempt(pendingNavigation);}} onDiscard={() => {if(pendingNavigation) { if (pendingNavigation === 'back') onClose(); else if (pendingNavigation === 'prev') onNavigate(currentIndex! - 1); else if (pendingNavigation === 'next') onNavigate(currentIndex! + 1); } setIsUnsavedModalOpen(false);}} />
            <Modal isOpen={isResetConfirmOpen} onClose={() => setIsResetConfirmOpen(false)} title={t('confirmResetTitle')} footer={<><button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={() => { onReset(baseChar, markChar, targetLigature); setIsResetConfirmOpen(false); }} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button></>}><p>{t('confirmResetSingleMessage', { name: targetLigature.name })}</p></Modal>
        </div>
    );
};

export default React.memo(PositioningEditorPage);