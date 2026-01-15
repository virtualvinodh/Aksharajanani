
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
    Character, GlyphData, Point, Path, AppSettings, FontMetrics, 
    MarkAttachmentRules, MarkPositioningMap, PositioningRules, 
    CharacterSet, AttachmentClass, AttachmentPoint 
} from '../../types';
import { 
    calculateDefaultMarkOffset, getAccurateGlyphBBox, 
    resolveAttachmentRule, getAttachmentPointCoords 
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
    onSave: (targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newBearings: { lsb?: number, rsb?: number }, isAutosave?: boolean) => void;
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
    onNavigate: (newIndex: number) => void;
    currentIndex: number | null;
    allPairsCount: number;
}

export const usePositioningSession = ({
    baseChar, markChar, targetLigature, glyphDataMap, markPositioningMap, onSave,
    settings, metrics, markAttachmentRules, positioningRules, allChars,
    markAttachmentClasses, baseAttachmentClasses, characterSets, groups,
    onClose, onNavigate, currentIndex, allPairsCount
}: UsePositioningSessionProps) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();

    // --- State ---
    const [markPaths, setMarkPaths] = useState<Path[]>([]);
    const [initialMarkPaths, setInitialMarkPaths] = useState<Path[]>([]);
    const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [isLinked, setIsLinked] = useState(true);
    const [currentOffset, setCurrentOffset] = useState<Point>({ x: 0, y: 0 });
    const [overrideClassType, setOverrideClassType] = useState<'mark' | 'base' | null>(null);
    const [lsb, setLsb] = useState<number | undefined>(targetLigature.lsb);
    const [rsb, setRsb] = useState<number | undefined>(targetLigature.rsb);
    const [manualX, setManualX] = useState<string>('0');
    const [manualY, setManualY] = useState<string>('0');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | 'back' | null>(null);

    const autosaveTimeout = useRef<number | null>(null);
    const lastPairIdentifierRef = useRef<string | null>(null);
    const pairIdentifier = `${baseChar.unicode}-${markChar.unicode}`;
    const pairNameKey = `${baseChar.name}-${markChar.name}`;

    const baseGlyph = glyphDataMap.get(baseChar.unicode);
    const baseBbox = useMemo(() => getAccurateGlyphBBox(baseGlyph?.paths ?? [], settings.strokeThickness), [baseGlyph, settings.strokeThickness]);

    // --- Logic Helpers ---
    const parentRule = useMemo(() => {
        if (!positioningRules) return null;
        return positioningRules.find(rule => 
            expandMembers(rule.base, groups, characterSets).includes(baseChar.name) && 
            expandMembers(rule.mark, groups, characterSets).includes(markChar.name)
        );
    }, [positioningRules, baseChar, markChar, groups, characterSets]);

    const movementConstraint = (parentRule && (parentRule.movement === 'horizontal' || parentRule.movement === 'vertical')) ? parentRule.movement : 'none';

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

    // --- Lifecycle Effects ---

    // Initial Hydration
    useEffect(() => {
        const offset = markPositioningMap.get(pairIdentifier);
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
        const effectiveOffset = offset || (baseBbox ? calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups, movementConstraint) : { x: 0, y: 0 });
        
        setCurrentOffset(effectiveOffset);

        const originalMarkPaths = markGlyph?.paths || [];
        const newMarkPaths = deepClone(originalMarkPaths).map((p: Path) => ({
            ...p,
            groupId: "positioning-mark-group",
            points: p.points.map(pt => ({ x: pt.x + effectiveOffset.x, y: pt.y + effectiveOffset.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + effectiveOffset.x, y: seg.point.y + effectiveOffset.y }}))) : undefined
        }));
        setMarkPaths(newMarkPaths);
        setInitialMarkPaths(deepClone(newMarkPaths));
        setSelectedPathIds(new Set(newMarkPaths.map(p => p.id)));
        setLsb(targetLigature.lsb); 
        setRsb(targetLigature.rsb);
        setIsLinked(!(activeAttachmentClass?.exceptPairs?.includes(pairNameKey)));
    }, [pairIdentifier, markPositioningMap, markAttachmentRules, characterSets, groups, movementConstraint]);

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
    }, [pairIdentifier, markPaths.length, baseGlyph, settings.strokeThickness]);

    // Manual Input Sync
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

    // --- Handlers ---
    const handlePathsChange = useCallback((newPaths: Path[]) => {
        setMarkPaths(newPaths);
        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => handleSave(newPaths, true), 500);
        }
    }, [settings.isAutosaveEnabled]);

    const handleSave = useCallback((pathsToSave: Path[] = markPaths, isAutosave: boolean = false) => {
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
        const finalBbox = getAccurateGlyphBBox(pathsToSave, settings.strokeThickness);
        let finalOffset: Point = { x: 0, y: 0 };
        if (originalBbox && finalBbox) finalOffset = { x: finalBbox.x - originalBbox.x, y: finalBbox.y - originalBbox.y };
        onSave(targetLigature, { paths: [...(baseGlyph?.paths ?? []), ...pathsToSave] }, finalOffset, { lsb, rsb }, isAutosave);
        setInitialMarkPaths(deepClone(pathsToSave));
    }, [glyphDataMap, markChar.unicode, baseGlyph?.paths, onSave, targetLigature, lsb, rsb, settings.strokeThickness, markPaths]);

    const handleNavigationAttempt = useCallback((direction: 'prev' | 'next' | 'back') => {
        const hasChanges = JSON.stringify(markPaths) !== JSON.stringify(initialMarkPaths) || lsb !== targetLigature.lsb || rsb !== targetLigature.rsb;
        const proceed = () => { if (direction === 'back') onClose(); else if (direction === 'prev' && currentIndex! > 0) onNavigate(currentIndex! - 1); else if (currentIndex! < allPairsCount - 1) onNavigate(currentIndex! + 1); };
        if (settings.isAutosaveEnabled) { if (hasChanges) handleSave(markPaths, false); proceed(); }
        else if (hasChanges) { setPendingNavigation(direction); setIsUnsavedModalOpen(true); }
        else proceed();
    }, [settings.isAutosaveEnabled, markPaths, initialMarkPaths, lsb, rsb, targetLigature, onClose, currentIndex, onNavigate, allPairsCount, handleSave]);

    const handleManualCommit = (xOverride?: string, yOverride?: string) => {
        const inputX = parseFloat(xOverride ?? manualX), inputY = parseFloat(yOverride ?? manualY);
        if (isNaN(inputX) || isNaN(inputY)) return;
        
        // Use functional state for paths to ensure we use the latest geometry for relative calculation
        setMarkPaths(prevPaths => {
            const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
            const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
            const currentBbox = getAccurateGlyphBBox(prevPaths, settings.strokeThickness);
            let activeOffset = { x: 0, y: 0 };
            if (originalBbox && currentBbox) activeOffset = { x: currentBbox.x - originalBbox.x, y: currentBbox.y - originalBbox.y };
            
            const moveX = (alignmentOffset.x + inputX) - activeOffset.x;
            const moveY = (alignmentOffset.y + inputY) - activeOffset.y;
            
            if (Math.abs(moveX) < 0.01 && Math.abs(moveY) < 0.01) return prevPaths;
            
            const newPaths = prevPaths.map(p => ({
                ...p,
                points: p.points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY })),
                segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + moveX, y: seg.point.y + moveY }}))) : undefined
            }));
            
            if (settings.isAutosaveEnabled) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = window.setTimeout(() => handleSave(newPaths, true), 500);
            }
            
            return newPaths;
        });
    };

    return {
        markPaths, basePaths: baseGlyph?.paths || [], currentOffset, alignmentOffset,
        zoom, setZoom, viewOffset, setViewOffset,
        selectedPathIds, setSelectedPathIds,
        isLinked, setIsLinked,
        lsb, setLsb, rsb, setRsb,
        manualX, manualY, setManualX, setManualY, setIsInputFocused,
        isUnsavedModalOpen, setIsUnsavedModalOpen,
        pendingNavigation, setPendingNavigation,
        handlePathsChange, handleSave, handleNavigationAttempt, handleManualCommit,
        pivotName, isPivot, activeAttachmentClass, activeClassType, hasDualContext, setOverrideClassType,
        canEdit: !activeAttachmentClass || !isLinked || isPivot,
        movementConstraint
    };
};
