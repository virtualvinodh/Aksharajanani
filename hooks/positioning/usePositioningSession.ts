
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
    Character, GlyphData, Point, Path, AppSettings, FontMetrics, 
    MarkAttachmentRules, MarkPositioningMap, PositioningRules, 
    CharacterSet, AttachmentClass
} from '../../types';
import { 
    calculateDefaultMarkOffset, getAccurateGlyphBBox, 
} from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';
import { deepClone } from '../../utils/cloneUtils';
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
    const [liga, setLiga] = useState<string[] | undefined>(targetLigature.liga);

    // Construction States
    const [position, setPosition] = useState<[string, string] | undefined>(targetLigature.position);
    const [kern, setKern] = useState<[string, string] | undefined>(targetLigature.kern);

    const [manualX, setManualX] = useState<string>('0');
    const [manualY, setManualY] = useState<string>('0');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | 'back' | Character | null>(null);

    const autosaveTimeout = useRef<number | null>(null);
    const baseGlyph = glyphDataMap.get(baseChar.unicode);

    // --- Animation Refs (Auto-fit) ---
    // These track the animation state outside of the render cycle
    const zoomRef = useRef(zoom);
    const viewOffsetRef = useRef(viewOffset);
    const targetZoomRef = useRef(zoom);
    const targetViewOffsetRef = useRef(viewOffset);
    const animationFrameRef = useRef<number | undefined>(undefined);

    // Sync refs with state when state changes (e.g. manual zoom)
    useEffect(() => {
        zoomRef.current = zoom;
        if (!animationFrameRef.current) targetZoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
        viewOffsetRef.current = viewOffset;
        if (!animationFrameRef.current) targetViewOffsetRef.current = viewOffset;
    }, [viewOffset]);

    const startAnimation = useCallback(() => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

        const animate = () => {
            const LERP_FACTOR = 0.15; 
            const currentZoom = zoomRef.current;
            const currentOffset = viewOffsetRef.current;
            const targetZoom = targetZoomRef.current;
            const targetOffset = targetViewOffsetRef.current;
            
            // Linear Interpolation
            const newZoom = currentZoom + (targetZoom - currentZoom) * LERP_FACTOR;
            const newOffset = {
                x: currentOffset.x + (targetOffset.x - currentOffset.x) * LERP_FACTOR,
                y: currentOffset.y + (targetOffset.y - currentOffset.y) * LERP_FACTOR,
            };

            // Snap when close enough
            const isZoomDone = Math.abs(newZoom - targetZoom) < 0.001;
            const isOffsetDone = VEC.len(VEC.sub(newOffset, targetOffset)) < 0.1;

            if (isZoomDone && isOffsetDone) {
                setZoom(targetZoom);
                setViewOffset(targetOffset);
                zoomRef.current = targetZoom;
                viewOffsetRef.current = targetOffset;
                animationFrameRef.current = undefined;
            } else {
                setZoom(newZoom);
                setViewOffset(newOffset);
                zoomRef.current = newZoom;
                viewOffsetRef.current = newOffset;
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
    }, []);

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

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

    // --- Initial Hydration & Auto-Fit ---
    useEffect(() => {
        // 1. Calculate Initial State
        const savedOffset = markPositioningMap.get(pairIdentifier);
        const effectiveOffset = savedOffset || alignmentOffset;
        
        setCurrentOffset(effectiveOffset);

        const markGlyph = glyphDataMap.get(markChar.unicode);
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
        
        // Metadata Sync
        setLsb(targetLigature.lsb); 
        setRsb(targetLigature.rsb);
        setGlyphClass(targetLigature.glyphClass);
        setAdvWidth(targetLigature.advWidth);
        setGpos(targetLigature.gpos);
        setGsub(targetLigature.gsub);
        setLiga(targetLigature.liga);
        setPosition(targetLigature.position);
        setKern(targetLigature.kern);
        setIsLinked(!(activeAttachmentClass?.exceptPairs?.includes(pairNameKey)));

        // 2. Perform Auto-Fit IMMEDIATELY using local variables
        // This ensures no race condition where we wait for state to update
        const allPaths = [...(baseGlyph?.paths || []), ...newMarkPaths];
        
        if (allPaths.length > 0) {
            const combinedBbox = getAccurateGlyphBBox(allPaths, settings.strokeThickness);
            if (combinedBbox) {
                // Determine if we need to fit (if content is large or off-screen)
                // For simplified UX, we always auto-fit on pair switch
                const PADDING = 150;
                const availableDim = 1000 - (PADDING * 2);
                
                let fitScale = 1;
                if (combinedBbox.width > 0 && combinedBbox.height > 0) {
                     fitScale = Math.min(availableDim / combinedBbox.width, availableDim / combinedBbox.height, 1.5); // Cap max zoom
                }

                const contentCenterX = combinedBbox.x + combinedBbox.width / 2;
                const contentCenterY = combinedBbox.y + combinedBbox.height / 2;
                
                const newTargetZoom = fitScale;
                const newTargetOffset = {
                    x: 500 - (contentCenterX * newTargetZoom),
                    y: 500 - (contentCenterY * newTargetZoom)
                };

                // Update animation targets immediately
                targetZoomRef.current = newTargetZoom;
                targetViewOffsetRef.current = newTargetOffset;
                startAnimation();
            }
        } else {
             // Reset if empty
            targetZoomRef.current = 1;
            targetViewOffsetRef.current = { x: 0, y: 0 };
            startAnimation();
        }

    }, [pairIdentifier, markPositioningMap, alignmentOffset, activeAttachmentClass, pairNameKey, markChar.unicode, targetLigature, glyphDataMap, baseGlyph, settings.strokeThickness, startAnimation]);

    // Sync Manual Input Fields (Show difference from snap)
    useEffect(() => {
        if (!isInputFocused) {
            setManualX(Math.round(currentOffset.x - alignmentOffset.x).toString());
            setManualY(Math.round(currentOffset.y - alignmentOffset.y).toString());
        }
    }, [currentOffset, alignmentOffset, isInputFocused]);

    // --- Handlers ---
    const handleSave = useCallback((offsetToSave: Point = currentOffset, isAutosave: boolean = false, isManual: boolean = false) => {
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const originalMarkPaths = markGlyph?.paths || [];
        
        const transformedMarkPaths = deepClone(originalMarkPaths).map((p: Path) => ({
            ...p,
            points: p.points.map(pt => ({ x: pt.x + offsetToSave.x, y: pt.y + offsetToSave.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offsetToSave.x, y: seg.point.y + offsetToSave.y }}))) : undefined
        }));

        onSave(baseChar, markChar, targetLigature, { paths: [...(baseGlyph?.paths ?? []), ...transformedMarkPaths] }, offsetToSave, { lsb, rsb, glyphClass, advWidth, gpos, gsub, liga, position, kern }, isAutosave, isManual);
        if (!isAutosave) {
            setInitialMarkPaths(deepClone(transformedMarkPaths));
        }
    }, [glyphDataMap, markChar, baseChar, baseGlyph?.paths, onSave, targetLigature, lsb, rsb, glyphClass, advWidth, gpos, gsub, liga, position, kern, currentOffset]);

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
                             JSON.stringify(liga) !== JSON.stringify(targetLigature.liga) ||
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
    }, [lsb, rsb, glyphClass, advWidth, gpos, gsub, liga, position, kern, currentOffset, hasUnsavedChanges, settings.isAutosaveEnabled, handleSave]);

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
        gpos, setGpos, gsub, setGsub, liga, setLiga,
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
