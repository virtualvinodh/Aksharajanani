
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon, SaveIcon, PropertiesIcon, LeftArrowIcon, RightArrowIcon, UndoIcon, LinkIcon, BrokenLinkIcon } from '../constants';
import DrawingCanvas from './DrawingCanvas';
import { AppSettings, Character, FontMetrics, GlyphData, MarkAttachmentRules, MarkPositioningMap, Path, Point, PositioningRules, CharacterSet, AttachmentClass, AttachmentPoint } from '../types';
import { calculateDefaultMarkOffset, getAccurateGlyphBBox, resolveAttachmentRule, getAttachmentPointCoords } from '../services/glyphRenderService';
import { updatePositioningAndCascade } from '../services/positioningService';
import { isGlyphDrawn } from '../utils/glyphUtils';
import ReusePreviewCard from './ReusePreviewCard';
import UnsavedChangesModal from './UnsavedChangesModal';
import { VEC } from '../utils/vectorUtils';
import GlyphPropertiesPanel from './GlyphPropertiesPanel';
import PositioningToolbar from './PositioningToolbar';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Modal from './Modal';
import { deepClone } from '../utils/cloneUtils';
import { useRules } from '../contexts/RulesContext';
import { expandMembers } from '../services/groupExpansionService';
import ClassPreviewStrip from './positioning/ClassPreviewStrip';
import { useProject } from '../contexts/ProjectContext';


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
    characterSets: CharacterSet[];
    glyphVersion: number;
}

const PositioningEditorPage: React.FC<PositioningEditorPageProps> = ({
    baseChar, markChar, targetLigature, glyphDataMap, markPositioningMap, onSave, onClose, onReset, settings, metrics, markAttachmentRules, positioningRules, allChars,
    allPairs, currentIndex, onNavigate, characterSets, glyphVersion
}) => {
    const { t } = useLocale();
    const { state: rulesState } = useRules();
    const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);
    
    // Access context setters for class modifications
    const { 
        markAttachmentClasses, setMarkAttachmentClasses,
        baseAttachmentClasses, setBaseAttachmentClasses 
    } = useProject();

    const [markPaths, setMarkPaths] = useState<Path[]>([]);
    const [initialMarkPaths, setInitialMarkPaths] = useState<Path[]>([]);
    const [isReusePanelOpen, setIsReusePanelOpen] = useState(false);
    const autosaveTimeout = useRef<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [pageTool, setPageTool] = useState<'select' | 'pan'>('select');
    
    // Class Linking State
    const [isLinked, setIsLinked] = useState(true);
    const [currentOffset, setCurrentOffset] = useState<Point>({ x: 0, y: 0 }); // Visual offset from origin
    
    const [lsb, setLsb] = useState<number | undefined>(targetLigature.lsb);
    const [rsb, setRsb] = useState<number | undefined>(targetLigature.rsb);
    const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
    const propertiesPanelRef = useRef<HTMLDivElement>(null);

    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | 'back' | null>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    // Manual Coordinate Inputs (Anchor Delta)
    const [manualX, setManualX] = useState<string>('0');
    const [manualY, setManualY] = useState<string>('0');
    const [isInputFocused, setIsInputFocused] = useState(false);

    const pairIdentifier = `${baseChar.unicode}-${markChar.unicode}`;
    const pairNameKey = `${baseChar.name}-${markChar.name}`;
    
    const lastPairIdentifierRef = useRef<string | null>(null);
    
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    const isPositioned = useMemo(() => markPositioningMap.has(pairIdentifier), [markPositioningMap, pairIdentifier]);
    
    // Identify the specific rule that generated this pair to find siblings
    const parentRule = useMemo(() => {
        if (!positioningRules) return null;
        return positioningRules.find(rule => 
            expandMembers(rule.base, groups, characterSets).includes(baseChar.name) && 
            expandMembers(rule.mark, groups, characterSets).includes(markChar.name)
        );
    }, [positioningRules, baseChar, markChar, groups, characterSets]);

    const isGsubPair = !!parentRule?.gsub;

    // Find siblings in the same class (same rule)
    const classSiblings = useMemo(() => {
        if (!parentRule || !allPairs) return [];
        
        // Optimize: Use Set for fast lookup
        const basesInRule = new Set(expandMembers(parentRule.base, groups, characterSets));
        const marksInRule = new Set(expandMembers(parentRule.mark, groups, characterSets));

        // Filter the displayed combinations list for efficiency (assuming it contains all valid pairs)
        return allPairs.filter(p => 
            // Must match rule criteria
            basesInRule.has(p.base.name) && marksInRule.has(p.mark.name) &&
            // Exclude self
            (p.base.unicode !== baseChar.unicode || p.mark.unicode !== markChar.unicode)
        );
    }, [parentRule, allPairs, baseChar, markChar, groups, characterSets]);

    const movementConstraint = useMemo(() => {
        if (parentRule && (parentRule.movement === 'horizontal' || parentRule.movement === 'vertical')) {
            return parentRule.movement;
        }
        return 'none';
    }, [parentRule]);

    const baseGlyph = glyphDataMap.get(baseChar.unicode);
    const baseBbox = useMemo(() => getAccurateGlyphBBox(baseGlyph?.paths ?? [], settings.strokeThickness), [baseGlyph, settings.strokeThickness]);
    
    // Geometric Alignment Offset: The offset required to make anchors touch (Delta = 0)
    // We calculate this dynamically based on the current rule definition or default
    const alignmentOffset = useMemo(() => {
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
        
        if (!baseBbox || !markBbox) return { x: 0, y: 0 };

        let rule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups);
        if (!rule) {
            rule = ["topCenter", "bottomCenter"]; // Default
        }
        
        // We only care about the anchor POINTS here, ignoring any hardcoded offsets (index 2, 3) in the rule
        // because we want the UI to show the deviation from the geometric anchor.
        const basePointName = rule[0] as AttachmentPoint;
        const markPointName = rule[1] as AttachmentPoint;

        const baseAnchor = getAttachmentPointCoords(baseBbox, basePointName);
        const markAnchor = getAttachmentPointCoords(markBbox, markPointName);
        
        // Offset needed to move Mark Anchor to Base Anchor
        // NewMarkPos = OldMarkPos + Offset
        // Target: NewMarkAnchor = BaseAnchor
        // (OldMarkAnchor + Offset) = BaseAnchor
        // Offset = BaseAnchor - OldMarkAnchor
        return VEC.sub(baseAnchor, markAnchor);

    }, [baseChar, markChar, baseBbox, markAttachmentRules, characterSets, groups, settings.strokeThickness, glyphDataMap]);


    // Initial Load Logic
    useEffect(() => {
        const key = `${baseChar.unicode}-${markChar.unicode}`;
        let offset = markPositioningMap.get(key);
        
        // If not manually positioned, calculate default
        if (!offset && baseBbox) {
            const markGlyph = glyphDataMap.get(markChar.unicode);
            const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
            offset = calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups);
        }
        
        // Set initial offset state for strip
        if (offset) setCurrentOffset(offset);
        
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        const newMarkPaths = deepClone(originalMarkPaths);
        if (offset) {
            newMarkPaths.forEach((p: Path) => {
                p.points = p.points.map(pt => ({ x: pt.x + offset!.x, y: pt.y + offset!.y }));
                if (p.segmentGroups) {
                    p.segmentGroups = p.segmentGroups.map(group =>
                        group.map(seg => ({
                            ...seg,
                            point: { x: seg.point.x + offset!.x, y: seg.point.y + offset!.y }
                        }))
                    );
                }
            });
        }
        setMarkPaths(newMarkPaths);
        setInitialMarkPaths(deepClone(newMarkPaths));
        setLsb(targetLigature.lsb);
        setRsb(targetLigature.rsb);
        setIsPropertiesPanelOpen(false);
        
        // Determine Linked Status based on Class Definition Exceptions
        let foundException = false;
        
        // Check Mark Classes
        if (markAttachmentClasses) {
            const mClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(markChar.name));
            if (mClass && mClass.exceptPairs && mClass.exceptPairs.includes(pairNameKey)) {
                foundException = true;
            }
        }
        // Check Base Classes
        if (!foundException && baseAttachmentClasses) {
            const bClass = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(baseChar.name));
            if (bClass && bClass.exceptPairs && bClass.exceptPairs.includes(pairNameKey)) {
                foundException = true;
            }
        }
        
        setIsLinked(!foundException);

        if (lastPairIdentifierRef.current !== pairIdentifier) {
            // Auto-scale view logic...
            const allPaths = [...(baseGlyph?.paths || []), ...newMarkPaths];
            const hasDrawableContent = allPaths.some(p => (p.points?.length || 0) > 0 || (p.segmentGroups?.length || 0) > 0);

            if (allPaths.length === 0 || !hasDrawableContent) {
                setZoom(1);
                setViewOffset({ x: 0, y: 0 });
                lastPairIdentifierRef.current = pairIdentifier;
                return;
            }
        
            const CANVAS_DIM = 700; 
            const PADDING = 100;
        
            const bbox = getAccurateGlyphBBox(allPaths, settings.strokeThickness);
            if (!bbox) {
                lastPairIdentifierRef.current = pairIdentifier;
                return;
            }
        
            const requiredWidth = bbox.width + PADDING * 2;
            const requiredHeight = bbox.height + PADDING * 2;
        
            if (requiredWidth <= 0 || requiredHeight <= 0) {
                lastPairIdentifierRef.current = pairIdentifier;
                return;
            }
        
            const newZoom = Math.min(CANVAS_DIM / requiredWidth, CANVAS_DIM / requiredHeight);
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
        
            const newViewOffset = {
                x: (CANVAS_DIM / 2) - (centerX * newZoom),
                y: (CANVAS_DIM / 2) - (centerY * newZoom)
            };
        
            setZoom(newZoom);
            setViewOffset(newViewOffset);
            lastPairIdentifierRef.current = pairIdentifier;
        }

    }, [baseChar, markChar, targetLigature, markPositioningMap, glyphDataMap, markAttachmentRules, baseBbox, metrics, baseGlyph, settings.strokeThickness, characterSets, pairIdentifier, groups, markAttachmentClasses, baseAttachmentClasses, pairNameKey]);
    
    // Toggle Link Handler
    const handleToggleLink = () => {
        const newIsLinked = !isLinked;
        setIsLinked(newIsLinked);
        
        // Helper to update exception list in classes
        const updateClassList = (classes: AttachmentClass[], setter: (c: AttachmentClass[]) => void, targetName: string) => {
             if (!classes) return;
             const newClasses = deepClone(classes);
             // Find class containing this member
             const cls = newClasses.find(c => expandMembers(c.members, groups, characterSets).includes(targetName));
             
             if (cls) {
                 if (!cls.exceptPairs) cls.exceptPairs = [];
                 
                 if (newIsLinked) {
                     // Remove from exceptions (Re-link)
                     cls.exceptPairs = cls.exceptPairs.filter(p => p !== pairNameKey);
                 } else {
                     // Add to exceptions (Unlink)
                     if (!cls.exceptPairs.includes(pairNameKey)) {
                         cls.exceptPairs.push(pairNameKey);
                     }
                 }
                 setter(newClasses);
             }
        };

        // Update Mark Classes
        if (markAttachmentClasses) {
            updateClassList(markAttachmentClasses, setMarkAttachmentClasses, markChar.name);
        }
        
        // Update Base Classes
        if (baseAttachmentClasses) {
            updateClassList(baseAttachmentClasses, setBaseAttachmentClasses, baseChar.name);
        }
    };

     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (propertiesPanelRef.current && !propertiesPanelRef.current.contains(event.target as Node)) {
                const propertiesButton = document.getElementById('pos-properties-button');
                if (propertiesButton && propertiesButton.contains(event.target as Node)) return;
                setIsPropertiesPanelOpen(false);
            }
        };
        if (isPropertiesPanelOpen) document.addEventListener('mousedown', handleClickOutside);
        else document.removeEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, [isPropertiesPanelOpen]);
    
    // Updated Save Logic to handle Linked Propagation
    const handleSave = useCallback((pathsToSave: Path[], isAutosave: boolean = false) => {
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
        const finalBbox = getAccurateGlyphBBox(pathsToSave, settings.strokeThickness);

        let finalOffset: Point = { x: 0, y: 0 };
        if (originalBbox && finalBbox) {
            finalOffset = {
                x: finalBbox.x - originalBbox.x,
                y: finalBbox.y - originalBbox.y
            };
        }
        
        // We overload the `options` argument in `onSave` to pass `propagateToRule: boolean`.
        // Even if unlinked, the service needs to know to check exceptions.
        const saveOptions = { isDraft: isAutosave, propagateToRule: isLinked, ruleContext: parentRule };

        onSave(targetLigature, { paths: [...(baseGlyph?.paths ?? []), ...pathsToSave] }, finalOffset, { lsb, rsb }, saveOptions as any);
        
        setInitialMarkPaths(deepClone(pathsToSave));
    }, [glyphDataMap, markChar.unicode, baseGlyph?.paths, onSave, targetLigature, lsb, rsb, settings.strokeThickness, isLinked, parentRule, groups, characterSets]);

    // Recalculate current offset whenever markPaths change (dragging)
    useEffect(() => {
        // Calculate offset for the strip visualization
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
        const currentBbox = getAccurateGlyphBBox(markPaths, settings.strokeThickness);
        
        let newCurrentOffset = { x: 0, y: 0 };
        if (originalBbox && currentBbox) {
             const dx = currentBbox.x - originalBbox.x;
             const dy = currentBbox.y - originalBbox.y;
             newCurrentOffset = { x: dx, y: dy };
        }
        setCurrentOffset(newCurrentOffset);
        
        // Sync manual inputs with Delta (Current - Alignment)
        if (!isInputFocused) {
            const deltaX = newCurrentOffset.x - alignmentOffset.x;
            const deltaY = newCurrentOffset.y - alignmentOffset.y;
            // Round for display
            setManualX(Math.round(deltaX).toString());
            setManualY(Math.round(deltaY).toString());
        }

    }, [markPaths, glyphDataMap, markChar, settings.strokeThickness, isInputFocused, alignmentOffset]);

    useEffect(() => {
        return () => {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        };
    }, []);
    
    const hasPathChanges = JSON.stringify(markPaths) !== JSON.stringify(initialMarkPaths);
    const hasBearingChanges = lsb !== targetLigature.lsb || rsb !== targetLigature.rsb;
    const hasUnsavedChanges = hasPathChanges || hasBearingChanges;

    const handlePathsChange = useCallback((newPaths: Path[]) => {
        setMarkPaths(newPaths);

        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => {
                handleSave(newPaths, true);
            }, 500);
        }
    }, [settings.isAutosaveEnabled, handleSave]);

    // ... (Existing Zoom, Navigation, Key handlers same as before) ...
    const handleZoom = (factor: number) => {
        const newZoom = Math.max(0.1, Math.min(10, zoom * factor));
        const center = { x: 700 / 2, y: 700 / 2 };
        const newOffset = {
            x: center.x - (center.x - viewOffset.x) * (newZoom / zoom),
            y: center.y - (center.y - viewOffset.y) * (newZoom / zoom)
        };
        setZoom(newZoom);
        setViewOffset(newOffset);
    };
    
    const handleSelectionChange = useCallback((ids: Set<string>) => setSelectedPathIds(ids), []);
    const [selectedPathIds, setSelectedPathIds] = useState(new Set<string>());
    
    const handleNavigationAttempt = useCallback((direction: 'prev' | 'next' | 'back') => {
        if (!settings.isAutosaveEnabled && hasUnsavedChanges) {
            setPendingNavigation(direction);
            setIsUnsavedModalOpen(true);
        } else {
            if (hasUnsavedChanges) handleSave(markPaths);
            
            if (direction === 'back') onClose();
            else if (direction === 'prev' && currentIndex !== null && currentIndex > 0) onNavigate(currentIndex - 1);
            else if (direction === 'next' && currentIndex !== null && currentIndex < allPairs.length - 1) onNavigate(currentIndex + 1);
        }
    }, [settings.isAutosaveEnabled, hasUnsavedChanges, handleSave, markPaths, onClose, currentIndex, onNavigate, allPairs.length]);

    const handleConfirmReset = useCallback(() => {
        onReset(baseChar, markChar, targetLigature);
        setIsResetConfirmOpen(false);
    }, [onReset, baseChar, markChar, targetLigature]);

    const prevPair = currentIndex !== null && currentIndex > 0 ? allPairs[currentIndex - 1] : null;
    const nextPair = currentIndex !== null && currentIndex < allPairs.length - 1 ? allPairs[currentIndex + 1] : null;

    // Show strip if linked OR if unlinked but has siblings (to show what *would* happen)
    // Actually, strip is mainly useful to visualize the cascade.
    const showStrip = classSiblings.length > 0;
    
    // --- Manual Coordinate Handlers ---
    const handleManualChange = (axis: 'x' | 'y', value: string) => {
        if (axis === 'x') setManualX(value);
        else setManualY(value);
    };

    const commitManualChange = () => {
        const inputDeltaX = parseFloat(manualX);
        const inputDeltaY = parseFloat(manualY);

        if (isNaN(inputDeltaX) || isNaN(inputDeltaY)) return;

        // Target Visual Offset = Alignment Offset + Delta
        const targetOffsetX = alignmentOffset.x + inputDeltaX;
        const targetOffsetY = alignmentOffset.y + inputDeltaY;

        // Move Delta = Target Offset - Current Offset
        const moveDeltaX = targetOffsetX - currentOffset.x;
        const moveDeltaY = targetOffsetY - currentOffset.y;

        if (Math.abs(moveDeltaX) < 0.01 && Math.abs(moveDeltaY) < 0.01) return;

        const newPaths = markPaths.map(p => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + moveDeltaX, y: pt.y + moveDeltaY })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({
                ...seg,
                point: { x: seg.point.x + moveDeltaX, y: seg.point.y + moveDeltaY }
            }))) : undefined
        }));

        handlePathsChange(newPaths);
    };

    const coordinateControls = (
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 mr-2 flex-shrink-0">
             <div className="flex items-center gap-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase select-none">X</label>
                <input
                    type="text"
                    value={manualX}
                    onChange={(e) => handleManualChange('x', e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => { setIsInputFocused(false); commitManualChange(); }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="w-10 sm:w-12 p-1 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 font-mono text-center text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    title="X Deviation from Anchor"
                />
            </div>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            <div className="flex items-center gap-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase select-none">Y</label>
                <input
                    type="text"
                    value={manualY}
                    onChange={(e) => handleManualChange('y', e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => { setIsInputFocused(false); commitManualChange(); }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="w-10 sm:w-12 p-1 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 font-mono text-center text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    title="Y Deviation from Anchor"
                />
            </div>
        </div>
    );

    // --- RENDER ---
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-800 animate-fade-in-up">
            <header className="p-4 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0 bg-white dark:bg-gray-800 z-10">
                 <div className="flex-1 flex justify-start">
                    <button onClick={() => handleNavigationAttempt('back')} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <BackIcon /><span className="hidden sm:inline">{t('back')}</span>
                    </button>
                </div>

                <div className="flex-1 flex justify-center items-center gap-2 sm:gap-4">
                     <button onClick={() => handleNavigationAttempt('prev')} disabled={!prevPair} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"><LeftArrowIcon /></button>
                     <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--guide-font-family)' }}>{targetLigature.name}</h2>
                    </div>
                     <button onClick={() => handleNavigationAttempt('next')} disabled={!nextPair} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"><RightArrowIcon /></button>
                </div>
                
                 <div className="flex-1 flex justify-end items-center gap-2 overflow-x-auto no-scrollbar">
                    
                    {isLargeScreen && coordinateControls}
                    
                    {/* Link Toggle - Only show if siblings exist */}
                    {classSiblings.length > 0 && (
                        isLinked ? (
                            <button
                                onClick={handleToggleLink}
                                title="Unlink from Class"
                                className="flex items-center gap-2 justify-center p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-semibold rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors duration-200"
                            >
                                <BrokenLinkIcon className="w-5 h-5" />
                                <span className="hidden xl:inline">Unlink</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleToggleLink}
                                title="Relink to Class"
                                className="flex items-center gap-2 justify-center p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors duration-200"
                            >
                                <LinkIcon className="w-5 h-5" />
                                <span className="hidden xl:inline">Relink</span>
                            </button>
                        )
                    )}

                    <button onClick={() => setIsResetConfirmOpen(true)} disabled={!isPositioned} className="p-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 flex-shrink-0"><UndoIcon /></button>
                    {isGsubPair && (
                        <div className="relative">
                            <button id="pos-properties-button" onClick={() => setIsPropertiesPanelOpen(p => !p)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0"><PropertiesIcon /></button>
                            {isPropertiesPanelOpen && <GlyphPropertiesPanel lsb={lsb} setLsb={setLsb} rsb={rsb} setRsb={setRsb} metrics={metrics} onClose={() => setIsPropertiesPanelOpen(false)} />}
                        </div>
                    )}
                    {!settings.isAutosaveEnabled && <button onClick={() => handleSave(markPaths)} className="p-2 bg-indigo-600 text-white rounded-lg flex-shrink-0"><SaveIcon /></button>}
                </div>
            </header>
            
            {/* Mobile Toolbar (Top) - Outside Main, under header */}
            {!isLargeScreen && (
                <div className="flex-shrink-0 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-2 flex justify-center z-20 items-center gap-2 overflow-x-auto no-scrollbar">
                     {coordinateControls}
                     <PositioningToolbar 
                        orientation="horizontal"
                        onReuseClick={() => setIsReusePanelOpen(p => !p)} 
                        pageTool={pageTool} 
                        onToggleTool={() => setPageTool(t => t === 'select' ? 'pan' : 'select')} 
                        onZoom={handleZoom} 
                    />
                </div>
            )}

            <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-900 relative">
                <div className="flex-1 flex flex-col items-center w-full h-full p-2 sm:p-4 overflow-hidden">
                    
                    {/* Top Area: Toolbar + Canvas - Maximize space */}
                    <div className="flex-1 w-full max-w-5xl flex flex-row items-center justify-center gap-3 min-h-0 relative">
                        {/* Desktop Toolbar - Vertical Stack */}
                        {isLargeScreen && (
                            <div className="flex-shrink-0 z-20">
                                <PositioningToolbar 
                                    orientation="vertical"
                                    onReuseClick={() => setIsReusePanelOpen(p => !p)} 
                                    pageTool={pageTool} 
                                    onToggleTool={() => setPageTool(t => t === 'select' ? 'pan' : 'select')} 
                                    onZoom={handleZoom} 
                                />
                            </div>
                        )}

                        {/* Canvas Container */}
                        <div className="aspect-square h-full max-h-full w-auto max-w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative">
                            <div className="absolute inset-0">
                                <DrawingCanvas
                                    width={700} height={700}
                                    paths={markPaths} onPathsChange={handlePathsChange} backgroundPaths={baseGlyph?.paths ?? []}
                                    metrics={metrics} tool={pageTool} zoom={zoom} setZoom={setZoom} viewOffset={viewOffset} setViewOffset={setViewOffset}
                                    settings={settings} allGlyphData={new Map()} allCharacterSets={[]} currentCharacter={targetLigature}
                                    gridConfig={{ characterNameSize: 450 }} backgroundImage={null} backgroundImageOpacity={1} imageTransform={null} onImageTransformChange={() => {}}
                                    selectedPathIds={selectedPathIds} onSelectionChange={handleSelectionChange} isImageSelected={false} onImageSelectionChange={() => {}}
                                    lsb={lsb} rsb={rsb} showBearingGuides={true} disableTransformations={false} transformMode="move-only" movementConstraint={movementConstraint} isInitiallyDrawn={true}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Bottom Area: Strip */}
                    {showStrip && (
                        <div className={`w-full max-w-5xl flex-shrink-0 mt-3 z-10 transition-opacity duration-300 ${isLinked ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                            <ClassPreviewStrip 
                                siblings={classSiblings}
                                glyphDataMap={glyphDataMap}
                                strokeThickness={settings.strokeThickness}
                                currentOffset={currentOffset}
                                isLinked={true} // Always render strip content, opacity handles visual cue
                                orientation="horizontal"
                            />
                        </div>
                    )}
                </div>
            </main>

            {isReusePanelOpen && (
                 <div className="absolute top-20 left-4 z-30 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-64 max-h-96 overflow-y-auto">
                    <h4 className="font-bold mb-2">{t('copyPositionFrom')}</h4>
                    {/* Reuse Logic Placeholder */}
                    <button onClick={() => setIsReusePanelOpen(false)} className="text-sm text-blue-500">Close</button>
                 </div>
            )}
            
            <UnsavedChangesModal isOpen={isUnsavedModalOpen} onClose={() => {setIsUnsavedModalOpen(false); setPendingNavigation(null);}} onSave={() => {handleSave(markPaths); if(pendingNavigation) handleNavigationAttempt(pendingNavigation);}} onDiscard={() => {if(pendingNavigation) { if (pendingNavigation === 'back') onClose(); else if (pendingNavigation === 'prev' && currentIndex! > 0) onNavigate(currentIndex! - 1); else if (pendingNavigation === 'next') onNavigate(currentIndex! + 1); } setIsUnsavedModalOpen(false);}} />
            
            <Modal isOpen={isResetConfirmOpen} onClose={() => setIsResetConfirmOpen(false)} title={t('confirmResetTitle')} footer={<><button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={handleConfirmReset} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button></>}><p>{t('confirmResetSingleMessage', { name: targetLigature.name })}</p></Modal>
        </div>
    );
};

export default React.memo(PositioningEditorPage);
