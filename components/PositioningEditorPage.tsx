
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
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
    // New prop for direct pair setting from strip
    setEditingPair?: (pair: { base: Character, mark: Character, ligature: Character }) => void;
    characterSets: CharacterSet[];
    glyphVersion: number;
    // Added for global sibling lookup
    allLigaturesByKey: Map<string, Character>;
}

interface SiblingPair {
    base: Character;
    mark: Character;
    ligature: Character; 
}

const PositioningEditorPage: React.FC<PositioningEditorPageProps> = ({
    baseChar, markChar, targetLigature, glyphDataMap, markPositioningMap, onSave, onClose, onReset, settings, metrics, markAttachmentRules, positioningRules, allChars,
    allPairs, currentIndex, onNavigate, setEditingPair, characterSets, glyphVersion, allLigaturesByKey
}) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
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
    
    // Strip Expansion State
    const [isStripExpanded, setIsStripExpanded] = useState(false);
    
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
    
    // Identify the specific rule that generated this pair to find siblings (Fallback)
    const parentRule = useMemo(() => {
        if (!positioningRules) return null;
        return positioningRules.find(rule => 
            expandMembers(rule.base, groups, characterSets).includes(baseChar.name) && 
            expandMembers(rule.mark, groups, characterSets).includes(markChar.name)
        );
    }, [positioningRules, baseChar, markChar, groups, characterSets]);

    const isGsubPair = !!parentRule?.gsub;

    // --- PIVOT Identification Logic ---
    const { pivotName, isPivot, activeAttachmentClass, activeClassType } = useMemo(() => {
        let activeClass: AttachmentClass | undefined;
        let pName: string | undefined;
        let isP = false;
        let type: 'mark' | 'base' | null = null;

        // Check Mark Classes
        if (markAttachmentClasses) {
            const mClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(markChar.name));
            if (mClass) {
                 activeClass = mClass;
                 type = 'mark';
                 const expanded = expandMembers(mClass.members, groups, characterSets);
                 if (expanded.length > 0) pName = expanded[0];
                 isP = markChar.name === pName;
            }
        }
        
        // Check Base Classes (if not found in mark)
        if (!activeClass && baseAttachmentClasses) {
            const bClass = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(baseChar.name));
            if (bClass) {
                activeClass = bClass;
                type = 'base';
                const expanded = expandMembers(bClass.members, groups, characterSets);
                if (expanded.length > 0) pName = expanded[0];
                isP = baseChar.name === pName;
            }
        }
        
        return { pivotName: pName, isPivot: isP, activeAttachmentClass: activeClass, activeClassType: type };
    }, [markAttachmentClasses, baseAttachmentClasses, markChar.name, baseChar.name, groups, characterSets]);

    // Find siblings for the strip
    // Updated Logic: Use global lookup to find all class members, even if not in current grid view
    const classSiblings = useMemo(() => {
        if (activeAttachmentClass && activeClassType) {
             const members = expandMembers(activeAttachmentClass.members, groups, characterSets);
             const siblings: SiblingPair[] = [];
             
             members.forEach(memberName => {
                 let sBase = baseChar;
                 let sMark = markChar;
                 
                 if (activeClassType === 'mark') {
                     // Varying Mark: Same Base
                     const c = allChars.get(memberName);
                     if (c) sMark = c;
                 } else {
                     // Varying Base: Same Mark
                     const c = allChars.get(memberName);
                     if (c) sBase = c;
                 }
                 
                 // Validate existence and drawn status
                 if (sBase.unicode === undefined || sMark.unicode === undefined) return;
                 const bData = glyphDataMap.get(sBase.unicode);
                 const mData = glyphDataMap.get(sMark.unicode);
                 
                 if (isGlyphDrawn(bData) && isGlyphDrawn(mData)) {
                      // Get Ligature
                      const key = `${sBase.unicode}-${sMark.unicode}`;
                      const lig = allLigaturesByKey.get(key);
                      if (lig) {
                          siblings.push({ base: sBase, mark: sMark, ligature: lig });
                      }
                 }
             });
             
             return siblings;
        }

        // 2. Fallback to Rule-based siblings (Manual Mode / No Class)
        // If not in a class, we use the rule context to find siblings (e.g. all pairs in a manual group rule)
        if (parentRule) {
             const ruleBases = expandMembers(parentRule.base, groups, characterSets);
             const ruleMarks = expandMembers(parentRule.mark, groups, characterSets);
             const siblings: SiblingPair[] = [];
             
             ruleBases.forEach(bName => {
                 ruleMarks.forEach(mName => {
                     const b = allChars.get(bName);
                     const m = allChars.get(mName);
                     
                     if (b && m && isGlyphDrawn(glyphDataMap.get(b.unicode)) && isGlyphDrawn(glyphDataMap.get(m.unicode))) {
                         const key = `${b.unicode}-${m.unicode}`;
                         const lig = allLigaturesByKey.get(key);
                         if (lig) {
                             siblings.push({ base: b, mark: m, ligature: lig });
                         }
                     }
                 });
             });
             return siblings;
        }

        return [];
    }, [activeAttachmentClass, activeClassType, parentRule, baseChar, markChar, groups, characterSets, allChars, glyphDataMap, allLigaturesByKey]);


    // Editing Permission
    // You can edit if: No Class exists OR Not Linked OR You are the Pivot
    const canEdit = !activeAttachmentClass || !isLinked || isPivot;


    const movementConstraint = useMemo(() => {
        if (parentRule && (parentRule.movement === 'horizontal' || parentRule.movement === 'vertical')) {
            return parentRule.movement;
        }
        return 'none';
    }, [parentRule]);

    const baseGlyph = glyphDataMap.get(baseChar.unicode);
    const baseBbox = useMemo(() => getAccurateGlyphBBox(baseGlyph?.paths ?? [], settings.strokeThickness), [baseGlyph, settings.strokeThickness]);
    
    // Geometric Alignment Offset
    const alignmentOffset = useMemo(() => {
        const markGlyph = glyphDataMap.get(markChar.unicode);
        const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
        
        if (!baseBbox || !markBbox) return { x: 0, y: 0 };

        let rule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups);
        if (!rule) {
            rule = ["topCenter", "bottomCenter"]; // Default
        }
        
        const basePointName = rule[0] as AttachmentPoint;
        const markPointName = rule[1] as AttachmentPoint;

        const baseAnchor = getAttachmentPointCoords(baseBbox, basePointName);
        const markAnchor = getAttachmentPointCoords(markBbox, markPointName);
        
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
        
        // Fix: Force all mark paths to have the same groupId so they are selected as one unit
        const MARK_GROUP_ID = "positioning-mark-group";

        const newMarkPaths = deepClone(originalMarkPaths);
        if (offset) {
            newMarkPaths.forEach((p: Path) => {
                // Apply temporary grouping for the editor
                p.groupId = MARK_GROUP_ID;

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
        
        // Check if pair is in exceptPairs of the active class
        if (activeAttachmentClass && activeAttachmentClass.exceptPairs && activeAttachmentClass.exceptPairs.includes(pairNameKey)) {
             foundException = true;
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

    }, [baseChar, markChar, targetLigature, markPositioningMap, glyphDataMap, markAttachmentRules, baseBbox, metrics, baseGlyph, settings.strokeThickness, characterSets, pairIdentifier, groups, activeAttachmentClass, pairNameKey]);
    
    // Internal Helper: Get Anchor Point
    const getAnchor = (glyph: GlyphData, pointName: string, offX: number, offY: number) => {
        const bbox = getAccurateGlyphBBox(glyph.paths, settings.strokeThickness);
        if (!bbox) return null;
        const p = getAttachmentPointCoords(bbox, pointName as AttachmentPoint);
        return { x: p.x + offX, y: p.y + offY };
    };

    // Toggle Link Handler
    const handleToggleLink = () => {
        const newIsLinked = !isLinked;
        setIsLinked(newIsLinked);
        
        // 1. Update Class Definition (Context)
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

        if (markAttachmentClasses) updateClassList(markAttachmentClasses, setMarkAttachmentClasses, markChar.name);
        if (baseAttachmentClasses) updateClassList(baseAttachmentClasses, setBaseAttachmentClasses, baseChar.name);
        
        // 2. If Relinking, Reset Position to Match Leader
        if (newIsLinked && activeAttachmentClass) {
             const members = expandMembers(activeAttachmentClass.members, groups, characterSets);
             if (members.length === 0) return;
             
             // Determine Leader and Role
             // If MarkClass, Leader is the first mark in the list.
             // If BaseClass, Leader is the first base in the list.
             const leaderName = members[0];
             const leaderChar = allChars.get(leaderName);
             
             if (!leaderChar) return;
             
             // Determine Reference Pair based on what is varying (Class Type)
             const refBase = activeClassType === 'base' ? leaderChar : baseChar;
             const refMark = activeClassType === 'mark' ? leaderChar : markChar;
             
             const refKey = `${refBase.unicode}-${refMark.unicode}`;
             const refOffset = markPositioningMap.get(refKey);
             
             let newOffset = { x: 0, y: 0 };
             
             if (refOffset) {
                 // SYNC FROM LEADER
                 const refBaseGlyph = glyphDataMap.get(refBase.unicode);
                 const refMarkGlyph = glyphDataMap.get(refMark.unicode);
                 
                 // Need base/mark glyphs for Current Pair to calculate target offset
                 const curBaseGlyph = glyphDataMap.get(baseChar.unicode);
                 const curMarkGlyph = glyphDataMap.get(markChar.unicode);
                 
                 if (refBaseGlyph && refMarkGlyph && curBaseGlyph && curMarkGlyph) {
                      // Calculate Reference Anchor Delta
                      const refRule = resolveAttachmentRule(refBase.name, refMark.name, markAttachmentRules, characterSets, groups);
                      let rbPt="topCenter", rmPt="bottomCenter", rbx=0, rby=0;
                      if(refRule) { rbPt=refRule[0]; rmPt=refRule[1]; rbx=parseFloat(refRule[2]||'0'); rby=parseFloat(refRule[3]||'0'); }
                      
                      const rbAnc = getAnchor(refBaseGlyph, rbPt, rbx, rby);
                      const rmAnc = getAnchor(refMarkGlyph, rmPt, 0, 0); 
                      
                      if (rbAnc && rmAnc) {
                          const anchorDelta = VEC.sub(VEC.add(refOffset, rmAnc), rbAnc);
                          
                          // Apply Delta to Current Pair
                          const curRule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups);
                          let cbPt="topCenter", cmPt="bottomCenter", cbx=0, cby=0;
                          if(curRule) { cbPt=curRule[0]; cmPt=curRule[1]; cbx=parseFloat(curRule[2]||'0'); cby=parseFloat(curRule[3]||'0'); }
                          
                          const cbAnc = getAnchor(curBaseGlyph, cbPt, cbx, cby);
                          const cmAnc = getAnchor(curMarkGlyph, cmPt, 0, 0);
                          
                          if (cbAnc && cmAnc) {
                               newOffset = VEC.sub(VEC.add(anchorDelta, cbAnc), cmAnc);
                          }
                      }
                 }
             } else {
                 // RESET TO DEFAULT (Geometric)
                 const markGlyph = glyphDataMap.get(markChar.unicode);
                 const bBbox = getAccurateGlyphBBox(baseGlyph?.paths || [], settings.strokeThickness);
                 const mBbox = getAccurateGlyphBBox(markGlyph?.paths || [], settings.strokeThickness);
                 newOffset = calculateDefaultMarkOffset(baseChar, markChar, bBbox, mBbox, markAttachmentRules, metrics, characterSets, false, groups);
             }
             
             // Apply and Save
             const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
             const MARK_GROUP_ID = "positioning-mark-group";

             const newPaths = deepClone(originalMarkPaths).map((p: Path) => ({
                ...p,
                groupId: MARK_GROUP_ID,
                points: p.points.map(pt => ({ x: pt.x + newOffset.x, y: pt.y + newOffset.y })),
                segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({
                    ...seg,
                    point: { x: seg.point.x + newOffset.x, y: seg.point.y + newOffset.y }
                }))) : undefined
            }));
            
            setMarkPaths(newPaths);
            setCurrentOffset(newOffset);
            
            // Construct args for onSave
            const combinedPaths = [...(baseGlyph?.paths || []), ...newPaths];
            const newGlyphData = { paths: combinedPaths };
             
            // Perform explicit save to overwrite previous manual position
            const saveOptions = { 
                 isDraft: false, 
                 propagateToRule: true, // Re-establish link so it updates if leader changes later
                 ruleContext: parentRule 
            };
             
            onSave(targetLigature, newGlyphData, newOffset, { lsb, rsb }, saveOptions as any);
            setInitialMarkPaths(deepClone(newPaths)); 
            
            showNotification("Relinked and synced to class leader.", "success");
        }
    };
    
    // Jump to sibling from Strip
    const handleSelectSibling = (pair: { base: Character, mark: Character, ligature: Character }) => {
        if (hasUnsavedChanges) {
             // Basic autosave before jump
             handleSave(markPaths, true); 
        }

        if (setEditingPair) {
             // If function provided, simply call it. The parent PositioningPage will update state,
             // which will cause this component to remount with new props.
             setEditingPair(pair);
        } else if (allPairs && onNavigate) {
            // Fallback to index based navigation if setEditingPair not available
            const index = allPairs.findIndex(p => 
                p.base.unicode === pair.base.unicode && 
                p.mark.unicode === pair.mark.unicode
            );
            if (index !== -1) {
                onNavigate(index);
            }
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
        
        // Only propagate if we are linked AND a class exists.
        // If no class exists (manual mode), we just save the single pair.
        const shouldPropagate = isLinked && !!activeAttachmentClass;
        
        const saveOptions = { isDraft: isAutosave, propagateToRule: shouldPropagate, ruleContext: parentRule };

        onSave(targetLigature, { paths: [...(baseGlyph?.paths ?? []), ...pathsToSave] }, finalOffset, { lsb, rsb }, saveOptions as any);
        
        setInitialMarkPaths(deepClone(pathsToSave));
    }, [glyphDataMap, markChar.unicode, baseGlyph?.paths, onSave, targetLigature, lsb, rsb, settings.strokeThickness, isLinked, activeAttachmentClass, parentRule, groups, characterSets]);

    // Recalculate current offset whenever markPaths change (dragging)
    useEffect(() => {
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
        
        if (!isInputFocused) {
            const deltaX = newCurrentOffset.x - alignmentOffset.x;
            const deltaY = newCurrentOffset.y - alignmentOffset.y;
            setManualX(Math.round(deltaX).toString());
            setManualY(Math.round(deltaY).toString());
        }

    }, [markPaths, glyphDataMap, markChar, settings.strokeThickness, isInputFocused, alignmentOffset]);
    
    const anchorDelta = useMemo(() => {
        return VEC.sub(currentOffset, alignmentOffset);
    }, [currentOffset, alignmentOffset]);

    useEffect(() => {
        return () => {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        };
    }, []);
    
    const hasPathChanges = JSON.stringify(markPaths) !== JSON.stringify(initialMarkPaths);
    const hasBearingChanges = lsb !== targetLigature.lsb || rsb !== targetLigature.rsb;
    const hasUnsavedChanges = hasPathChanges || hasBearingChanges;
    
    // Logic for Locked Message
    const lockedMessage = !canEdit ? t('This pair is synced to {pivot}. Unlink to edit this specific pair, or edit {pivot} to update the whole class.', { pivot: pivotName || 'Class Representative' }) : undefined;

    const handlePathsChange = useCallback((newPaths: Path[]) => {
        // If not editable, we should block, although DrawingCanvas might prevent drag via disableTransformations now.
        // This is a safety check.
        if (!canEdit) {
            return;
        }

        setMarkPaths(newPaths);

        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => {
                handleSave(newPaths, true);
            }, 500);
        }
    }, [settings.isAutosaveEnabled, handleSave, canEdit]);

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

    // Show strip only if linked and class siblings exist
    const showStrip = isLinked && classSiblings.length > 0;
    
    // --- Manual Coordinate Handlers ---
    const handleManualChange = (axis: 'x' | 'y', value: string) => {
        if (!canEdit) return;
        if (axis === 'x') setManualX(value);
        else setManualY(value);
    };

    const commitManualChange = () => {
        if (!canEdit) return;
        const inputDeltaX = parseFloat(manualX);
        const inputDeltaY = parseFloat(manualY);

        if (isNaN(inputDeltaX) || isNaN(inputDeltaY)) return;

        const targetOffsetX = alignmentOffset.x + inputDeltaX;
        const targetOffsetY = alignmentOffset.y + inputDeltaY;

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

    const coordinateControls = !isStripExpanded && (
        <div className={`flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 mr-2 flex-shrink-0 ${!canEdit ? 'opacity-50 grayscale' : ''}`}>
             <div className="flex items-center gap-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase select-none">X</label>
                <input
                    type="text"
                    value={manualX}
                    onChange={(e) => handleManualChange('x', e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => { setIsInputFocused(false); commitManualChange(); }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    disabled={!canEdit}
                    className="w-10 sm:w-12 p-1 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 font-mono text-center text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed"
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
                    disabled={!canEdit}
                    className="w-10 sm:w-12 p-1 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 font-mono text-center text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed"
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
                        {/* Status Badge */}
                        <div className="flex justify-center mt-1">
                             {activeAttachmentClass ? (
                                 isLinked ? (
                                     isPivot ? 
                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full dark:bg-purple-900/30 dark:text-purple-300">Class Representative</span> : 
                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full dark:bg-blue-900/20 dark:text-blue-300">Synced</span>
                                 ) : (
                                     <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full dark:bg-orange-900/20 dark:text-orange-300">Unlinked</span>
                                 )
                             ) : (
                                 <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full dark:bg-gray-700 dark:text-gray-300">Manual</span>
                             )}
                        </div>
                    </div>
                     <button onClick={() => handleNavigationAttempt('next')} disabled={!nextPair} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"><RightArrowIcon /></button>
                </div>
                
                 <div className="flex-1 flex justify-end items-center gap-2 overflow-x-auto no-scrollbar">
                    
                    {isLargeScreen && coordinateControls}
                    
                    {/* Link Toggle - Only show if class attachment exists */}
                    {(markAttachmentClasses || baseAttachmentClasses) && activeAttachmentClass && (
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
            
            {!isLargeScreen && !isStripExpanded && (
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
                    
                    <div className="flex-1 w-full max-w-5xl flex flex-row items-center justify-center gap-3 min-h-0 relative">
                        {isLargeScreen && !isStripExpanded && (
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

                        <div className="aspect-square h-full max-h-full w-auto max-w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative">
                            <div className="absolute inset-0">
                                <DrawingCanvas
                                    width={700} height={700}
                                    paths={markPaths} onPathsChange={handlePathsChange} backgroundPaths={baseGlyph?.paths ?? []}
                                    metrics={metrics} tool={pageTool} zoom={zoom} setZoom={setZoom} viewOffset={viewOffset} setViewOffset={setViewOffset}
                                    settings={settings} allGlyphData={new Map()} allCharacterSets={[]} currentCharacter={targetLigature}
                                    gridConfig={{ characterNameSize: 450 }} backgroundImage={null} backgroundImageOpacity={1} imageTransform={null} onImageTransformChange={() => {}}
                                    selectedPathIds={selectedPathIds} onSelectionChange={handleSelectionChange} isImageSelected={false} onImageSelectionChange={() => {}}
                                    lsb={lsb} rsb={rsb} showBearingGuides={false} 
                                    disableTransformations={!canEdit} 
                                    lockedMessage={lockedMessage}
                                    transformMode="move-only" movementConstraint={movementConstraint} isInitiallyDrawn={true}
                                />
                            </div>
                        </div>
                    </div>

                    {showStrip && (
                        <div className={`w-full max-w-5xl flex-shrink-0 mt-3 z-10 transition-opacity duration-300`}>
                            <ClassPreviewStrip 
                                siblings={classSiblings}
                                activePair={{ base: baseChar, mark: markChar, ligature: targetLigature }}
                                pivotChar={isPivot ? (activeAttachmentClass?.name ? null : markChar) : (pivotName ? allChars.get(pivotName) : null)} // Logic to identify current pivot visually
                                glyphDataMap={glyphDataMap}
                                strokeThickness={settings.strokeThickness}
                                anchorDelta={anchorDelta}
                                isLinked={isLinked} 
                                orientation="horizontal"
                                onSelectPair={handleSelectSibling}
                                metrics={metrics}
                                markAttachmentRules={markAttachmentRules}
                                characterSets={characterSets}
                                groups={groups}
                                isExpanded={isStripExpanded}
                                setIsExpanded={setIsStripExpanded}
                                activeClass={activeAttachmentClass}
                            />
                        </div>
                    )}
                </div>
            </main>

            {isReusePanelOpen && (
                 <div className="absolute top-20 left-4 z-30 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-64 max-h-96 overflow-y-auto">
                    <h4 className="font-bold mb-2">{t('copyPositionFrom')}</h4>
                    <button onClick={() => setIsReusePanelOpen(false)} className="text-sm text-blue-500">Close</button>
                 </div>
            )}
            
            <UnsavedChangesModal isOpen={isUnsavedModalOpen} onClose={() => {setIsUnsavedModalOpen(false); setPendingNavigation(null);}} onSave={() => {handleSave(markPaths); if(pendingNavigation) handleNavigationAttempt(pendingNavigation);}} onDiscard={() => {if(pendingNavigation) { if (pendingNavigation === 'back') onClose(); else if (pendingNavigation === 'prev' && currentIndex! > 0) onNavigate(currentIndex! - 1); else if (pendingNavigation === 'next') onNavigate(currentIndex! + 1); } setIsUnsavedModalOpen(false);}} />
            
            <Modal isOpen={isResetConfirmOpen} onClose={() => setIsResetConfirmOpen(false)} title={t('confirmResetTitle')} footer={<><button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={handleConfirmReset} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button></>}><p>{t('confirmResetSingleMessage', { name: targetLigature.name })}</p></Modal>
        </div>
    );
};

export default React.memo(PositioningEditorPage);
