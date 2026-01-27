import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
    Character, GlyphData, Point, Path, AppSettings, FontMetrics, 
    MarkAttachmentRules, MarkPositioningMap, PositioningRules, 
    CharacterSet, AttachmentClass, AttachmentPoint 
} from '../../types';
import { 
    calculateDefaultMarkOffset, getAccurateGlyphBBox, 
} from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';
import { deepClone } from '../../utils/cloneUtils';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { expandMembers } from '../../services/groupExpansionService';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';

interface UsePositioningSessionProps {
    baseChar: Character;
    markChar: Character;
    targetLigature: Character;
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    onSave: (base: Character, mark: Character, targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newMetadata: any, isAutosave?: boolean, isManual?: boolean) => void;
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    positioningRules: PositioningRules[] | null;
    allChars: Map<string, Character>;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    onClose: () => void;
    onNavigate: (target: 'prev' | 'next' | Character) => void;
}

export const usePositioningSession = ({
    baseChar, markChar, targetLigature, glyphDataMap, markPositioningMap, onSave,
    settings, metrics, markAttachmentRules, positioningRules, allChars,
    markAttachmentClasses, baseAttachmentClasses, characterSets, groups,
    onClose, onNavigate
}: UsePositioningSessionProps) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();

    const pairIdentifier = `${baseChar.unicode}-${markChar.unicode}`;
    const pairNameKey = `${baseChar.name}-${markChar.name}`;

    // --- Core Logic Helpers ---
    const movementConstraint = useMemo(() => {
        const parentRule = positioningRules?.find(rule => 
            expandMembers(rule.base, groups, characterSets).includes(baseChar.name) && 
            expandMembers(rule.mark || [], groups, characterSets).includes(markChar.name)
        );
        return (parentRule && (parentRule.movement === 'horizontal' || parentRule.movement === 'vertical')) ? parentRule.movement : 'none';
    }, [baseChar.name, markChar.name, positioningRules, groups, characterSets]);

    const alignmentOffset = useMemo(() => {
        const baseGlyph = glyphDataMap.get(baseChar.unicode);
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const baseBbox = getAccurateGlyphBBox(baseGlyph?.paths ?? [], settings.strokeThickness);
        const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
        
        return calculateDefaultMarkOffset(
            baseChar, markChar, baseBbox, markBbox, 
            markAttachmentRules, metrics, characterSets, 
            false, groups, movementConstraint
        );
    }, [baseChar, markChar, glyphDataMap, markAttachmentRules, metrics, characterSets, groups, settings.strokeThickness, movementConstraint]);

    // --- State Management ---
    const [currentOffset, setCurrentOffset] = useState<Point>(() => {
        const saved = markPositioningMap.get(pairIdentifier);
        return saved || alignmentOffset;
    });

    const [markPaths, setMarkPaths] = useState<Path[]>([]);
    const [initialMarkPaths, setInitialMarkPaths] = useState<Path[]>([]);
    const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [isLinked, setIsLinked] = useState(true);
    const [overrideClassType, setOverrideClassType] = useState<'mark' | 'base' | null>(null);
    const [lsb, setLsb] = useState<number | undefined>(targetLigature.lsb);
    const [rsb, setRsb] = useState<number | undefined>(targetLigature.rsb);
    
    // Metadata States
    const [glyphClass, setGlyphClass] = useState<Character['glyphClass']>(targetLigature.glyphClass);
    const [advWidth, setAdvWidth] = useState<number | string | undefined>(targetLigature.advWidth);
    const [gpos, setGpos] = useState<string | undefined>(targetLigature.gpos);
    const [gsub, setGsub] = useState<string | undefined>(targetLigature.gsub);

    // Construction States
    const [position, setPosition] = useState<[string, string] | undefined>(targetLigature.position);
    const [kern, setKern] = useState<[string, string] | undefined>(targetLigature.kern);

    const [manualX, setManualX] = useState<string>('0');
    const [manualY, setManualY] = useState<string>('0');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | 'back' | Character | null>(null);

    const autosaveTimeout = useRef<number | null>(null);
    const lastPairIdentifierRef = useRef<string | null>(null);

    const baseGlyph = glyphDataMap.get(baseChar.unicode);

    // --- Class Logic ---
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

    // Initial Hydration
    useEffect(() => {
        const savedOffset = markPositioningMap.get(pairIdentifier);
        const effective = savedOffset || alignmentOffset;
        
        setCurrentOffset(effective);

        const markGlyph = glyphDataMap.get(markChar.unicode);
        const originalMarkPaths = markGlyph?.paths || [];
        const newMarkPaths = deepClone(originalMarkPaths).map((p: Path) => ({
            ...p,
            groupId: "positioning-mark-group",
            points: p.points.map(pt => ({ x: pt.x + effective.x, y: pt.y + effective.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + effective.x, y: seg.point.y + effective.y }}))) : undefined
        }));
        
        setMarkPaths(newMarkPaths);
        setInitialMarkPaths(deepClone(newMarkPaths));
        setSelectedPathIds(new Set(newMarkPaths.map(p => p.id)));
        setLsb(targetLigature.lsb); 
        setRsb(targetLigature.rsb);
        setGlyphClass(targetLigature.glyphClass);
        setAdvWidth(targetLigature.advWidth);
        setGpos(targetLigature.gpos);
        setGsub(targetLigature.gsub);
        setPosition(targetLigature.position);
        setKern(targetLigature.kern);
        setIsLinked(!(activeAttachmentClass?.exceptPairs?.includes(pairNameKey)));
    }, [pairIdentifier, markPositioningMap, alignmentOffset, activeAttachmentClass, pairNameKey, markChar.unicode, targetLigature, glyphDataMap]);

    // Sync Manual Input Fields (Show difference from snap)
    useEffect(() => {
        if (!isInputFocused) {
            setManualX(Math.round(currentOffset.x - alignmentOffset.x).toString());
            setManualY(Math.round(currentOffset.y - alignmentOffset.y).toString());
        }
    }, [currentOffset, alignmentOffset, isInputFocused]);

    // Auto-Fit Viewport
    useEffect(() => {
        if (lastPairIdentifierRef.current === pairIdentifier) return;
        const allPaths = [...(baseGlyph?.paths || []), ...markPaths];
        if (allPaths.length > 0) {
            const combinedBbox = getAccurateGlyphBBox(allPaths, settings.strokeThickness);
            if (combinedBbox) {
                const isBeyond = combinedBbox.x < 0 || combinedBbox.y < 0 || (combinedBbox.x + combinedBbox.width) > 1000 || (combinedBbox.y + combinedBbox.height) > 1000;
                if (isBeyond || zoom !== 1) {
                    const PADDING = 100;
                    const availableDim = 1000 - (PADDING * 2);
                    const fitScale = Math.min(availableDim / combinedBbox.width, availableDim / combinedBbox.height, 1);
                    const contentCenterX = combinedBbox.x + combinedBbox.width / 2;
                    const contentCenterY = combinedBbox.y + combinedBbox.height / 2;
                    setZoom(fitScale); 
                    setViewOffset({ x: 500 - (contentCenterX * fitScale), y: 500 - (contentCenterY * fitScale) });
                } else {
                    setZoom(1); setViewOffset({ x: 0, y: 0 });
                }
                lastPairIdentifierRef.current = pairIdentifier;
            }
        }
    }, [pairIdentifier, markPaths, baseGlyph, settings.strokeThickness, zoom]);

    // --- Handlers ---
    const handleSave = useCallback((offsetToSave: Point = currentOffset, isAutosave: boolean = false, isManual: boolean = false) => {
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const originalMarkPaths = markGlyph?.paths || [];
        
        const transformedMarkPaths = deepClone(originalMarkPaths).map((p: Path) => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + offsetToSave.x, y: pt.y + offsetToSave.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offsetToSave.x, y: seg.point.y + offsetToSave.y }}))) : undefined
        }));

        onSave(baseChar, markChar, targetLigature, { paths: [...(baseGlyph?.paths ?? []), ...transformedMarkPaths] }, offsetToSave, { lsb, rsb, glyphClass, advWidth, gpos, gsub, position, kern }, isAutosave, isManual);
        if (!isAutosave) {
            setInitialMarkPaths(deepClone(transformedMarkPaths));
        }
    }, [glyphDataMap, markChar, baseChar, baseGlyph?.paths, onSave, targetLigature, lsb, rsb, glyphClass, advWidth, gpos, gsub, position, kern, currentOffset]);

    const handlePathsChange = useCallback((newPaths: Path[]) => {
        setMarkPaths(newPaths);
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const originalMarkPaths = markGlyph?.paths || [];
        const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
        const currentBbox = getAccurateGlyphBBox(newPaths, settings.strokeThickness);
        
        let newOffset = { x: 0, y: 0 };
        if (originalBbox && currentBbox) {
            newOffset = { x: currentBbox.x - originalBbox.x, y: currentBbox.y - originalBbox.y };
        }
        
        setCurrentOffset(newOffset);

        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => handleSave(newOffset, true, false), 500);
        }
    }, [settings.isAutosaveEnabled, handleSave, glyphDataMap, markChar.unicode, settings.strokeThickness]);

    const hasPathChanges = JSON.stringify(markPaths) !== JSON.stringify(initialMarkPaths);
    const hasMetadataChanges = lsb !== targetLigature.lsb || 
                             rsb !== targetLigature.rsb ||
                             glyphClass !== targetLigature.glyphClass ||
                             advWidth !== targetLigature.advWidth ||
                             gpos !== targetLigature.gpos ||
                             gsub !== targetLigature.gsub ||
                             JSON.stringify(position) !== JSON.stringify(targetLigature.position) ||
                             JSON.stringify(kern) !== JSON.stringify(targetLigature.kern);
                             
    const hasUnsavedChanges = hasPathChanges || hasMetadataChanges;

    // Background Autosave Effect for Slider/Bearing changes
    useEffect(() => {
        if (!settings.isAutosaveEnabled || !hasUnsavedChanges) return;
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        autosaveTimeout.current = window.setTimeout(() => {
             handleSave(currentOffset, true, false);
        }, 800);
        return () => { if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current); };
    }, [lsb, rsb, glyphClass, advWidth, gpos, gsub, position, kern, currentOffset, hasUnsavedChanges, settings.isAutosaveEnabled, handleSave]);

    const handleNavigationAttempt = useCallback((target: Character | 'prev' | 'next' | 'back') => {
        const proceed = () => { 
            if (target === 'back') onClose(); 
            else onNavigate(target); 
        };
        if (settings.isAutosaveEnabled) { 
            if (hasUnsavedChanges) handleSave(currentOffset, false, false); 
            proceed(); 
        }
        else if (hasUnsavedChanges) { 
            setPendingNavigation(target); 
            setIsUnsavedModalOpen(true); 
        }
        else proceed();
    }, [settings.isAutosaveEnabled, hasUnsavedChanges, onClose, onNavigate, handleSave, currentOffset]);

    const handleManualCommit = (xOverride?: string, yOverride?: string) => {
        const inputX = parseFloat(xOverride ?? manualX), inputY = parseFloat(yOverride ?? manualY);
        if (isNaN(inputX) || isNaN(inputY)) return;
        
        const newOffset = {
            x: alignmentOffset.x + inputX,
            y: alignmentOffset.y + inputY
        };

        const moveX = newOffset.x - currentOffset.x;
        const moveY = newOffset.y - currentOffset.y;
        
        if (Math.abs(moveX) < 0.01 && Math.abs(moveY) < 0.01) return;

        const updatedPaths = markPaths.map(p => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + moveX, y: seg.point.y + moveY }}))) : undefined
        }));
        
        setMarkPaths(updatedPaths);
        setCurrentOffset(newOffset);
        
        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => handleSave(newOffset, true, false), 500);
        }
    };

    const confirmDiscard = useCallback(() => {
        if (pendingNavigation) {
            if (pendingNavigation === 'back') onClose();
            else onNavigate(pendingNavigation);
        }
        setIsUnsavedModalOpen(false);
        setPendingNavigation(null);
    }, [pendingNavigation, onClose, onNavigate]);

    return {
        markPaths, basePaths: baseGlyph?.paths || [], currentOffset, alignmentOffset,
        zoom, setZoom, viewOffset, setViewOffset,
        selectedPathIds, setSelectedPathIds,
        isLinked, setIsLinked,
        lsb, setLsb, rsb, setRsb,
        glyphClass, setGlyphClass, advWidth, setAdvWidth,
        gpos, setGpos, gsub, setGsub,
        // FIX: Added missing construction states to the return object
        position, setPosition,
        kern, setKern,
        manualX, manualY, setManualX, setManualY, setIsInputFocused,
        isUnsavedModalOpen, setIsUnsavedModalOpen,
        pendingNavigation, setPendingNavigation,
        handlePathsChange, handleSave: () => handleSave(currentOffset, false, true), // Manual button
        handleNavigationAttempt, handleManualCommit,
        pivotName, isPivot, activeAttachmentClass, activeClassType, hasDualContext, setOverrideClassType,
        canEdit: !activeAttachmentClass || !isLinked || isPivot,
        movementConstraint,
        hasUnsavedChanges,
        confirmDiscard
    };
};