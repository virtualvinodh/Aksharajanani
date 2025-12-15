
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { CopyIcon, LeftArrowIcon, RightArrowIcon, CheckCircleIcon, UndoIcon, RulesIcon, BackIcon, SaveIcon, FilterIcon } from '../constants';
import CombinationCard from './CombinationCard';
import { AppSettings, Character, CharacterSet, FontMetrics, GlyphData, MarkAttachmentRules, MarkPositioningMap, Path, Point, PositioningRules, AttachmentClass, RecommendedKerning } from '../types';
import PositioningEditorPage from './PositioningEditorPage';
import { usePositioning } from '../contexts/PositioningContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useProject } from '../contexts/ProjectContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { getAccurateGlyphBBox, calculateDefaultMarkOffset, resolveAttachmentRule } from '../services/glyphRenderService';
import { updatePositioningAndCascade, syncAttachmentClasses } from '../services/positioningService';
import { isGlyphDrawn } from '../utils/glyphUtils';
import Modal from './Modal';
import PositioningRulesManager from './rules/manager/PositioningRulesManager';
import { parseSearchQuery, getCharacterMatchScore } from '../utils/searchUtils';
import { expandMembers } from '../services/groupExpansionService';
import { useRules } from '../contexts/RulesContext';
import { deepClone } from '../utils/cloneUtils';
import PositioningRuleBlock from './positioning/PositioningRuleBlock';


// Main Positioning Page Component
interface PositioningPageProps {
    positioningRules: PositioningRules[] | null;
    markAttachmentRules: MarkAttachmentRules | null;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    fontRules: any;
}

const PositioningPage: React.FC<PositioningPageProps> = ({
    positioningRules, markAttachmentRules, fontRules, markAttachmentClasses, baseAttachmentClasses
}) => {
    const { t } = useLocale();
    const { showNotification, pendingNavigationTarget, setPendingNavigationTarget, filterMode, searchQuery } = useLayout();
    const { glyphDataMap, dispatch: glyphDataDispatch, version: glyphVersion } = useGlyphData();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { 
        characterSets, 
        dispatch: characterDispatch,
        setPositioningRules,
        setMarkAttachmentRules,
        setMarkAttachmentClasses,
        setBaseAttachmentClasses,
        setRecommendedKerning,
        recommendedKerning
    } = useProject();
    const { settings, metrics } = useSettings();
    const { state: rulesState, dispatch: rulesDispatch } = useRules();

    // Access groups from rules state
    const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);

    // View Mode State: 'rules' (New Default) | 'base' | 'mark'
    const [viewMode, setViewMode] = useState<'rules' | 'base' | 'mark'>('rules');
    
    // Rule Drill-Down State
    const [selectedRuleGroupId, setSelectedRuleGroupId] = useState<number | null>(null);
    const [rulePage, setRulePage] = useState(1);
    const ITEMS_PER_PAGE = 36;
    
    // For 'base'/'mark' modes (Grid View)
    const [activeTab, setActiveTab] = useState(0);
    
    // Shared Editing State
    const [editingPair, setEditingPair] = useState<{ base: Character, mark: Character, ligature: Character } | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    
    // We need to know WHICH list we are editing (Grid or Rule) to support navigation properly
    const [editingContextList, setEditingContextList] = useState<{ base: Character, mark: Character, ligature: Character }[]>([]);

    const [isReuseModalOpen, setIsReuseModalOpen] = useState(false);
    const [reuseSourceItem, setReuseSourceItem] = useState<Character | null>(null);
    const [showIncompleteNotice, setShowIncompleteNotice] = useState(false);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    
    // Inline Rules Manager State
    const [isRulesManagerOpen, setIsRulesManagerOpen] = useState(false);
    
    // Local State for Rules Manager (Transactional Editing)
    const [localPosRules, setLocalPosRules] = useState<PositioningRules[]>([]);
    const [localMarkAttach, setLocalMarkAttach] = useState<MarkAttachmentRules>({});
    const [localMarkClasses, setLocalMarkClasses] = useState<AttachmentClass[]>([]);
    const [localBaseClasses, setLocalBaseClasses] = useState<AttachmentClass[]>([]);
    const [localKerning, setLocalKerning] = useState<RecommendedKerning[]>([]);
    const [localGroups, setLocalGroups] = useState<Record<string, string[]>>({});

    const navContainerRef = useRef<HTMLDivElement>(null);
    const { visibility: showNavArrows, handleScroll } = useHorizontalScroll(navContainerRef);
    
    // Ref map to scroll cards into view
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    
    const isSearching = searchQuery.trim().length > 0;
    const isFiltered = filterMode !== 'none' || isSearching;
    
    const allChars = useMemo(() => new Map(characterSets!.flatMap(set => set.characters).map(char => [char.name, char])), [characterSets]);

    const positioningData = useMemo(() => {
        const newLigaturesByKey = new Map<string, Character>();

        // Use Plane 16 for temporary visual-only IDs to avoid collision with persistent PUAs in Plane 0/15
        let virtualPuaCounter = 0x100000;

        const rulesLigas = { 
            ...(fontRules?.tml2?.abvs?.liga || {}), 
            ...(fontRules?.tml2?.psts?.liga || {}), 
            ...(fontRules?.tml2?.haln?.liga || {}) 
        };

        const componentsToLigs = new Map<string, string>();
        for (const ligName in rulesLigas) {
            const components = rulesLigas[ligName];
            if (Array.isArray(components) && components.length === 2) {
                componentsToLigs.set(components.join('-'), ligName);
            }
        }
        
        if (positioningRules && characterSets) {
            for (const rule of positioningRules) {
                const allPossibleMarks = expandMembers(rule.mark || [], groups, characterSets);
                const allBases = expandMembers(rule.base, groups, characterSets);

                for (const baseName of allBases) {
                    for (const markName of allPossibleMarks) {
                        const baseChar = allChars.get(baseName);
                        const markChar = allChars.get(markName);

                        if (!baseChar || !markChar) continue;

                        const pairKey = `${baseChar.unicode}-${markChar.unicode}`;
                        
                        let targetLigature: Character | undefined;
                        let targetLigatureName: string | undefined;

                        targetLigatureName = rule.ligatureMap?.[baseName]?.[markName];
                        
                        if (!targetLigatureName && rule.ligatureMap) {
                             for (const groupKey in rule.ligatureMap) {
                                 if (groupKey.startsWith('$') || groupKey.startsWith('@')) {
                                     if (expandMembers([groupKey], groups, characterSets).includes(baseName)) {
                                         const marksMap = rule.ligatureMap[groupKey];
                                         targetLigatureName = marksMap[markName];
                                         if(!targetLigatureName) {
                                              for(const markGroupKey in marksMap) {
                                                   if ((markGroupKey.startsWith('$') || markGroupKey.startsWith('@')) && 
                                                       expandMembers([markGroupKey], groups, characterSets).includes(markName)) {
                                                        targetLigatureName = marksMap[markGroupKey];
                                                        break;
                                                   }
                                              }
                                         }
                                         if (targetLigatureName) break;
                                     }
                                 }
                             }
                        }
                        
                        if (!targetLigatureName) {
                            const componentKey = `${baseChar.name}-${markChar.name}`;
                            targetLigatureName = componentsToLigs.get(componentKey);
                        }

                        if (targetLigatureName) {
                            if (!targetLigatureName.startsWith('$') && !targetLigatureName.startsWith('@')) {
                                targetLigature = allChars.get(targetLigatureName);
                            }
                        }

                        if (!targetLigature) {
                            const finalLigatureName = targetLigatureName || (baseChar.name + markChar.name);
                            const existingChar = allChars.get(finalLigatureName);

                            if (existingChar) {
                                targetLigature = existingChar;
                            } else {
                                virtualPuaCounter++;
                                targetLigature = {
                                    name: finalLigatureName,
                                    unicode: virtualPuaCounter,
                                    glyphClass: 'ligature',
                                    composite: [baseName, markName]
                                };
                            }
                        }

                        if (targetLigature) {
                            newLigaturesByKey.set(pairKey, targetLigature);
                        }
                    }
                }
            }
        }
        return { allLigaturesByKey: newLigaturesByKey };

    }, [characterSets, allChars, positioningRules, fontRules, groups]);

    const handleSetGroups = useCallback((newGroups: Record<string, string[]>) => {
        if (rulesState.fontRules) {
             const newRules = { ...rulesState.fontRules, groups: newGroups };
             rulesDispatch({ type: 'SET_FONT_RULES', payload: newRules });
        }
    }, [rulesState.fontRules, rulesDispatch]);

    useEffect(() => {
        if (isRulesManagerOpen) {
            setLocalPosRules(deepClone(positioningRules || []));
            setLocalMarkAttach(deepClone(markAttachmentRules || {}));
            setLocalMarkClasses(deepClone(markAttachmentClasses || []));
            setLocalBaseClasses(deepClone(baseAttachmentClasses || []));
            setLocalKerning(deepClone(recommendedKerning || []));
            setLocalGroups(deepClone(groups || {}));
        }
    }, [isRulesManagerOpen]); 

    const saveManagerChanges = useCallback(() => {
        setPositioningRules(localPosRules);
        setMarkAttachmentRules(localMarkAttach);
        setMarkAttachmentClasses(localMarkClasses);
        setBaseAttachmentClasses(localBaseClasses);
        setRecommendedKerning(localKerning);
        handleSetGroups(localGroups);
        
        if (settings && metrics && characterSets) {
            const syncResult = syncAttachmentClasses({
                markPositioningMap,
                glyphDataMap,
                allCharsByName: allChars,
                allLigaturesByKey: positioningData.allLigaturesByKey,
                markAttachmentClasses: localMarkClasses,
                baseAttachmentClasses: localBaseClasses,
                positioningRules: localPosRules,
                markAttachmentRules: localMarkAttach,
                groups: localGroups,
                characterSets: characterSets,
                strokeThickness: settings.strokeThickness,
                metrics: metrics
            });
            
            positioningDispatch({ type: 'SET_MAP', payload: syncResult.updatedMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: syncResult.updatedGlyphDataMap });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: syncResult.updatedCharacterSets });
        }

    }, [localPosRules, localMarkAttach, localMarkClasses, localBaseClasses, localKerning, localGroups, setPositioningRules, setMarkAttachmentRules, setMarkAttachmentClasses, setBaseAttachmentClasses, setRecommendedKerning, handleSetGroups, markPositioningMap, glyphDataMap, allChars, positioningData.allLigaturesByKey, characterSets, settings, metrics, positioningDispatch, glyphDataDispatch, characterDispatch]);

    useEffect(() => {
        if (!isRulesManagerOpen || !settings?.isAutosaveEnabled) return;
        const timer = setTimeout(() => { saveManagerChanges(); }, 1000);
        return () => clearTimeout(timer);
    }, [localPosRules, localMarkAttach, localMarkClasses, localBaseClasses, localKerning, localGroups, isRulesManagerOpen, settings?.isAutosaveEnabled, saveManagerChanges]);

    
    // --- Data Preparation for Rule-Centric View ---
    const ruleGroups = useMemo(() => {
        if (!positioningRules || !characterSets) return [];
        
        return positioningRules.map((rule, index) => {
            const ruleBases = expandMembers(rule.base, groups, characterSets);
            const ruleMarks = expandMembers(rule.mark || [], groups, characterSets);
            
            const pairs: { base: Character; mark: Character; ligature: Character }[] = [];
            
            for (const baseName of ruleBases) {
                for (const markName of ruleMarks) {
                    const baseChar = allChars.get(baseName);
                    const markChar = allChars.get(markName);
                    if (baseChar && markChar && isGlyphDrawn(glyphDataMap.get(baseChar.unicode)) && isGlyphDrawn(glyphDataMap.get(markChar.unicode))) {
                        const ligature = positioningData.allLigaturesByKey.get(`${baseChar.unicode}-${markChar.unicode}`);
                        if (ligature) {
                            pairs.push({ base: baseChar, mark: markChar, ligature });
                        }
                    }
                }
            }
            return { rule, pairs, id: index };
        }).filter(group => group.pairs.length > 0);

    }, [positioningRules, groups, characterSets, allChars, glyphDataMap, positioningData.allLigaturesByKey, glyphVersion]);
    
    // Active Rule Group for Drill Down
    const activeRuleGroup = useMemo(() => 
        ruleGroups.find(g => g.id === selectedRuleGroupId),
    [ruleGroups, selectedRuleGroupId]);

    // --- Helper: Generate Unique Key for a Pair based on Class Membership ---
    const getPairClassKey = useCallback((pair: { base: Character, mark: Character }) => {
        const pairNameKey = `${pair.base.name}-${pair.mark.name}`;

        // 1. Identify Base Key (Class ID or Char Name)
        let baseKey = `B:${pair.base.name}`;
        const baseClassIdx = baseAttachmentClasses?.findIndex(cls => 
            expandMembers(cls.members, groups, characterSets).includes(pair.base.name)
        );
        
        if (baseClassIdx !== undefined && baseClassIdx > -1) {
            const cls = baseAttachmentClasses![baseClassIdx];
            const isException = (cls.exceptions && expandMembers(cls.exceptions, groups, characterSets).includes(pair.base.name)) || 
                                (cls.exceptPairs && cls.exceptPairs.includes(pairNameKey));
            
            if (!isException) {
                baseKey = `BC:${baseClassIdx}`;
            }
        }

        // 2. Identify Mark Key (Class ID or Char Name)
        let markKey = `M:${pair.mark.name}`;
        const markClassIdx = markAttachmentClasses?.findIndex(cls => 
            expandMembers(cls.members, groups, characterSets).includes(pair.mark.name)
        );
        
        if (markClassIdx !== undefined && markClassIdx > -1) {
            const cls = markAttachmentClasses![markClassIdx];
            const isException = (cls.exceptions && expandMembers(cls.exceptions, groups, characterSets).includes(pair.mark.name)) || 
                                (cls.exceptPairs && cls.exceptPairs.includes(pairNameKey));
                                
             if (!isException) {
                 markKey = `MC:${markClassIdx}`;
             }
        }
        
        return `${baseKey}-${markKey}`;
    }, [baseAttachmentClasses, markAttachmentClasses, groups, characterSets]);

    // --- Helper: Count pairs per Class Key to determine stack visualization ---
    const classCounts = useMemo(() => {
        if (!activeRuleGroup) return new Map<string, number>();
        const counts = new Map<string, number>();
        activeRuleGroup.pairs.forEach(pair => {
             const key = getPairClassKey(pair);
             counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }, [activeRuleGroup, getPairClassKey]);

    // --- Filtered Pairs Logic (Consolidated by Class) ---
    const uniqueRepPairs = useMemo(() => {
        if (!activeRuleGroup) return [];

        const seenKeys = new Set<string>();
        
        return activeRuleGroup.pairs.filter(pair => {
            const uniqueKey = getPairClassKey(pair);
            
            if (seenKeys.has(uniqueKey)) {
                return false; // Skip redundant siblings
            }
            
            seenKeys.add(uniqueKey);
            return true; // Keep representative
        });

    }, [activeRuleGroup, getPairClassKey]);

    const pagedRulePairs = useMemo(() => {
        if (!uniqueRepPairs) return [];
        const start = (rulePage - 1) * ITEMS_PER_PAGE;
        return uniqueRepPairs.slice(start, start + ITEMS_PER_PAGE);
    }, [uniqueRepPairs, rulePage]);

    const ruleTotalPages = uniqueRepPairs ? Math.ceil(uniqueRepPairs.length / ITEMS_PER_PAGE) : 0;
    
    // --- Data Preparation for Grid View (Base/Mark) ---
    const navItems = useMemo(() => {
        if (!positioningRules || isFiltered || !characterSets || viewMode === 'rules') return [];
        const items = new Map<number, Character>();
        const sourceSet = new Set<string>();
        
        if (viewMode === 'base') {
             positioningRules.flatMap(r => expandMembers(r.base, groups, characterSets)).forEach(m => sourceSet.add(m));
        } else {
             positioningRules.flatMap(r => expandMembers(r.mark, groups, characterSets)).forEach(m => sourceSet.add(m));
        }

        sourceSet.forEach(name => {
            const char = allChars.get(name);
            if (char && !char.hidden && isGlyphDrawn(glyphDataMap.get(char.unicode))) {
                items.set(char.unicode, char);
            }
        });

        return Array.from(items.values()).sort((a, b) => a.unicode - b.unicode);
    }, [positioningRules, allChars, viewMode, glyphDataMap, glyphVersion, isFiltered, groups, characterSets]);

    const activeItem = navItems[activeTab];

    const displayedCombinations = useMemo(() => {
        if (!positioningRules || !characterSets || viewMode === 'rules') return [];
        
        const allCombinations: { base: Character; mark: Character; ligature: Character }[] = [];
        const addedLigatures = new Set<number>();
    
        const rulesToProcess = positioningRules;
        
        for (const rule of rulesToProcess) {
            const ruleBases = expandMembers(rule.base, groups, characterSets);
            const ruleMarks = expandMembers(rule.mark, groups, characterSets);
            
            let basesToCheck = ruleBases;
            let marksToCheck = ruleMarks;
            
            if (!isFiltered) {
                if (!activeItem) return []; 
                if (viewMode === 'base') {
                     if (!ruleBases.includes(activeItem.name)) continue;
                     basesToCheck = [activeItem.name];
                } else {
                     if (!ruleMarks.includes(activeItem.name)) continue;
                     marksToCheck = [activeItem.name];
                }
            }

            for (const baseName of basesToCheck) {
                for (const markName of marksToCheck) {
                     const baseChar = allChars.get(baseName);
                     const markChar = allChars.get(markName);
                     if (baseChar && markChar) {
                         const ligature = positioningData.allLigaturesByKey.get(`${baseChar.unicode}-${markChar.unicode}`);
                         if (ligature && !addedLigatures.has(ligature.unicode)) {
                            allCombinations.push({ base: baseChar, mark: markChar, ligature });
                            addedLigatures.add(ligature.unicode);
                         }
                     }
                }
            }
        }

        let result = allCombinations.filter(
            ({ base, mark }) => isGlyphDrawn(glyphDataMap.get(base.unicode)) && isGlyphDrawn(glyphDataMap.get(mark.unicode))
        );
        
        if (isFiltered) {
            if (filterMode === 'completed') {
                result = result.filter(c => markPositioningMap.has(`${c.base.unicode}-${c.mark.unicode}`));
            } else if (filterMode === 'incomplete') {
                result = result.filter(c => !markPositioningMap.has(`${c.base.unicode}-${c.mark.unicode}`));
            }
            if (isSearching) {
                const q = parseSearchQuery(searchQuery);
                if (q.isEffective) {
                    const matches = result.map(combo => {
                        const scoreBase = getCharacterMatchScore(combo.base, q);
                        const scoreMark = getCharacterMatchScore(combo.mark, q);
                        const scoreLig = getCharacterMatchScore(combo.ligature, q);

                        let bestScore = -1;
                        if (scoreLig > 0) bestScore = scoreLig;
                        else {
                            if (scoreBase > 0 && scoreMark > 0) bestScore = Math.min(scoreBase, scoreMark);
                            else if (scoreBase > 0) bestScore = scoreBase;
                            else if (scoreMark > 0) bestScore = scoreMark;
                        }

                        return { combo, score: bestScore };
                    }).filter(item => item.score > 0);

                    matches.sort((a, b) => {
                        if (a.score !== b.score) return a.score - b.score;
                        return (a.combo.base.unicode || 0) - (b.combo.base.unicode || 0) || (a.combo.mark.unicode || 0) - (b.combo.mark.unicode || 0);
                    });

                    result = matches.map(m => m.combo);
                }
            } else {
                result.sort((a,b) => (a.base.unicode || 0) - (b.base.unicode || 0) || (a.mark.unicode || 0) - (b.mark.unicode || 0));
            }
        }
        return result;
    }, [activeItem, positioningRules, viewMode, allChars, positioningData.allLigaturesByKey, glyphDataMap, glyphVersion, isFiltered, filterMode, markPositioningMap, searchQuery, isSearching, groups, characterSets]);

    // Handle Deep Navigation / URL Linking
    useEffect(() => {
        if (!pendingNavigationTarget) return;

        const [baseId, markId] = pendingNavigationTarget.split('-').map(Number);

        // 1. Try finding in Rules View (Preferred)
        if (viewMode === 'rules') {
             for (const group of ruleGroups) {
                 const comboIndex = group.pairs.findIndex(c => c.base.unicode === baseId && c.mark.unicode === markId);
                 if (comboIndex !== -1) {
                     // Auto-expand the rule group and navigate
                     setSelectedRuleGroupId(group.id);
                     const page = Math.floor(comboIndex / ITEMS_PER_PAGE) + 1;
                     setRulePage(page);
                     
                     const pair = group.pairs[comboIndex];
                     setEditingPair(pair);

                     // IMPORTANT: Context list must be filtered by class key for correct navigation scope
                     const classKey = getPairClassKey(pair);
                     const filteredContext = group.pairs.filter(p => getPairClassKey(p) === classKey);
                     setEditingContextList(filteredContext);
                     
                     // Find index in filtered list
                     const filteredIndex = filteredContext.findIndex(p => p.base.unicode === baseId && p.mark.unicode === markId);
                     setEditingIndex(filteredIndex);

                     setPendingNavigationTarget(null);
                     return;
                 }
             }
        }
        
        // 2. Try finding in Grid View (Legacy/Filtered)
        // If we are in grid view, check displayedCombinations
        if (viewMode !== 'rules') {
             const comboIndex = displayedCombinations.findIndex(c => c.base.unicode === baseId && c.mark.unicode === markId);
             if (comboIndex !== -1) {
                setEditingPair(displayedCombinations[comboIndex]);
                setEditingIndex(comboIndex);
                setEditingContextList(displayedCombinations);
                setPendingNavigationTarget(null);
                return;
             }
        }
        
    }, [pendingNavigationTarget, viewMode, ruleGroups, displayedCombinations, setPendingNavigationTarget, getPairClassKey]);


    const savePositioningUpdate = useCallback((
        baseChar: Character,
        markChar: Character,
        targetLigature: Character,
        newGlyphData: GlyphData,
        newOffset: Point,
        newBearings: { lsb?: number, rsb?: number },
        isAutosave: boolean = false
    ) => {
        if (!characterSets || !settings) return;
    
        const snapshot = {
            glyphDataMap: new Map(glyphDataMap.entries()),
            characterSets: JSON.parse(JSON.stringify(characterSets)),
            markPositioningMap: new Map(markPositioningMap.entries()),
        };
    
        const result = updatePositioningAndCascade({
            baseChar, markChar, targetLigature, newGlyphData, newOffset, newBearings,
            allChars, allLigaturesByKey: positioningData.allLigaturesByKey,
            markAttachmentClasses, baseAttachmentClasses,
            markPositioningMap, glyphDataMap, characterSets, positioningRules,
            markAttachmentRules,
            groups,
            strokeThickness: settings.strokeThickness
        });
    
        const propagatedCount = result.updatedMarkPositioningMap.size - markPositioningMap.size - 1;
    
        if (propagatedCount > 0) {
            const undoPropagation = () => {
                glyphDataDispatch({ type: 'SET_MAP', payload: snapshot.glyphDataMap });
                characterDispatch({ type: 'SET_CHARACTER_SETS', payload: snapshot.characterSets });
                positioningDispatch({ type: 'SET_MAP', payload: snapshot.markPositioningMap });
    
                const reapplyResult = updatePositioningAndCascade({
                    baseChar, markChar, targetLigature, newGlyphData, newOffset, newBearings,
                    allChars, allLigaturesByKey: positioningData.allLigaturesByKey,
                    markAttachmentClasses: [], 
                    baseAttachmentClasses: [], 
                    markPositioningMap: snapshot.markPositioningMap,
                    glyphDataMap: snapshot.glyphDataMap,
                    characterSets: snapshot.characterSets,
                    positioningRules,
                    markAttachmentRules,
                    groups,
                    strokeThickness: settings.strokeThickness
                });
    
                positioningDispatch({ type: 'SET_MAP', payload: reapplyResult.updatedMarkPositioningMap });
                glyphDataDispatch({ type: 'SET_MAP', payload: reapplyResult.updatedGlyphDataMap });
                characterDispatch({ type: 'SET_CHARACTER_SETS', payload: reapplyResult.updatedCharacterSets });
    
                showNotification(t('positioningPropagationReverted'), 'info');
            };
    
            positioningDispatch({ type: 'SET_MAP', payload: result.updatedMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: result.updatedGlyphDataMap });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: result.updatedCharacterSets });
    
            if (!isAutosave) {
                showNotification(t('propagatedPositions', { count: propagatedCount }), 'success', { onUndo: undoPropagation, duration: 7000 });
            }
        } else {
            positioningDispatch({ type: 'SET_MAP', payload: result.updatedMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: result.updatedGlyphDataMap });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: result.updatedCharacterSets });
            if (!isAutosave) showNotification(t('positioningUpdated'), 'success');
        }
    
    }, [
        characterSets, allChars, positioningData.allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses,
        markPositioningMap, glyphDataMap, positioningRules, positioningDispatch, glyphDataDispatch,
        characterDispatch, showNotification, t, groups, markAttachmentRules, settings
    ]);

    const handleSavePair = useCallback((targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newBearings: { lsb?: number, rsb?: number }, isAutosave?: boolean) => {
        if (!editingPair) return;
        savePositioningUpdate(editingPair.base, editingPair.mark, targetLigature, newGlyphData, newOffset, newBearings, isAutosave);
    }, [editingPair, savePositioningUpdate]);

    const handleConfirmPosition = useCallback((base: Character, mark: Character, ligature: Character) => {
        const baseGlyph = glyphDataMap.get(base.unicode);
        const markGlyph = glyphDataMap.get(mark.unicode);
        if (!baseGlyph || !markGlyph || !metrics || !characterSets || !settings) return;

        const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, settings.strokeThickness);
        const markBbox = getAccurateGlyphBBox(markGlyph.paths, settings.strokeThickness);
        const offset = calculateDefaultMarkOffset(base, mark, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups);
    
        const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths)).map((p: Path) => ({
            ...p,
            points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
        }));
        const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
        const newGlyphData = { paths: combinedPaths };
        const newBearings = { lsb: ligature.lsb, rsb: ligature.rsb };
    
        savePositioningUpdate(base, mark, ligature, newGlyphData, offset, newBearings);
        showNotification(`${t('positioningUpdated')} ${ligature.name}`, 'success');
    }, [glyphDataMap, markAttachmentRules, savePositioningUpdate, showNotification, t, metrics, characterSets, settings, groups]);

    const handleOpenReuseModal = (sourceItem: Character) => {
        setReuseSourceItem(sourceItem);
        setIsReuseModalOpen(true);
    };
    
    // Reuse functionality (kept for grid view compatibility, might need adaptation for rule view)
    const fullyPositionedItems = useMemo(() => {
        if (isFiltered || !characterSets || viewMode === 'rules') return []; 
        return navItems.filter(item => {
            const combinations: { base: Character; mark: Character }[] = [];
            positioningRules?.forEach(rule => {
                const ruleBases = expandMembers(rule.base, groups, characterSets);
                const ruleMarks = expandMembers(rule.mark, groups, characterSets);

                if ((viewMode === 'base' && ruleBases.includes(item.name)) || (viewMode === 'mark' && ruleMarks.includes(item.name))) {
                    const otherSet = viewMode === 'base' ? ruleMarks : ruleBases;
                    otherSet.forEach(otherName => {
                        const otherChar = allChars.get(otherName);
                        if(otherChar) {
                            combinations.push({
                                base: viewMode === 'base' ? item : otherChar,
                                mark: viewMode === 'base' ? otherChar : item
                            });
                        }
                    });
                }
            });
            return combinations.length > 0 && combinations.every(combo =>
                markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`)
            );
        }).filter(item => item.unicode !== reuseSourceItem?.unicode);
    }, [navItems, positioningRules, viewMode, allChars, markPositioningMap, reuseSourceItem, isFiltered, groups, characterSets]);
    
    const handleCopyPositions = (copyFromItem: Character) => {
        // Reuse logic simplified: works on displayedCombinations (Grid View).
        // For Rule View, reuse is less direct via this modal, relying more on Class linking.
        if (!reuseSourceItem) return;

        const newMarkPositioningMap = new Map(markPositioningMap);
        const newGlyphDataMap = new Map(glyphDataMap);
        const ligaturesToAddOrUpdate: Character[] = [];
        
        let positionsCopiedCount = 0;
        
        // Only works in Grid View efficiently
        displayedCombinations.forEach(targetCombo => {
            const otherChar = viewMode === 'base' ? targetCombo.mark : targetCombo.base;
            const sourceBase = viewMode === 'base' ? copyFromItem : otherChar;
            const sourceMark = viewMode === 'base' ? otherChar : copyFromItem;
            
            const sourceKey = `${sourceBase.unicode}-${sourceMark.unicode}`;
            const sourceOffset = markPositioningMap.get(sourceKey);

            if (sourceOffset) {
                const targetKey = `${targetCombo.base.unicode}-${targetCombo.mark.unicode}`;
                newMarkPositioningMap.set(targetKey, sourceOffset);

                const baseGlyph = glyphDataMap.get(targetCombo.base.unicode);
                const markGlyph = glyphDataMap.get(targetCombo.mark.unicode);
                if (baseGlyph && markGlyph) {
                    const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths)).map((p: Path) => ({
                        ...p,
                        points: p.points.map((pt: Point) => ({ x: pt.x + sourceOffset.x, y: pt.y + sourceOffset.y }))
                    }));
                    const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
                    newGlyphDataMap.set(targetCombo.ligature.unicode, { paths: combinedPaths });
                    ligaturesToAddOrUpdate.push(targetCombo.ligature);
                    positionsCopiedCount++;
                }
            }
        });

        if (positionsCopiedCount > 0) {
            positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: newGlyphDataMap });

            characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets: CharacterSet[] | null) => {
                if (!prevSets) return null;
                const updatedSets: CharacterSet[] = JSON.parse(JSON.stringify(prevSets));
                const allExistingChars = new Map<number, Character>();
                updatedSets.forEach(set => set.characters.forEach(char => allExistingChars.set(char.unicode, char)));

                const DYNAMIC_LIGATURES_KEY = 'dynamicLigatures';
                let dynamicSet = updatedSets.find(s => s.nameKey === DYNAMIC_LIGATURES_KEY);
                if (!dynamicSet) {
                    dynamicSet = { nameKey: DYNAMIC_LIGATURES_KEY, characters: [] };
                    updatedSets.push(dynamicSet);
                }
                
                ligaturesToAddOrUpdate.forEach(ligature => {
                    if (!allExistingChars.has(ligature.unicode)) {
                        dynamicSet!.characters.push(ligature);
                        allExistingChars.set(ligature.unicode, ligature);
                    }
                });

                return updatedSets;
            }});

            showNotification(t('positionsCopied'), 'success');
        } else {
            showNotification(t('noPositionsToCopy'), 'info');
        }

        setIsReuseModalOpen(false);
        setReuseSourceItem(null);
    };

    const handleNavigatePair = (newIndex: number) => {
        if (newIndex >= 0 && newIndex < editingContextList.length) {
            setEditingPair(editingContextList[newIndex]);
            setEditingIndex(newIndex);
        }
    };
    
    // Auto-Position (Grid View specific, or filtered list)
    const unpositionedCount = useMemo(() => {
        // In Rule View, this is not shown globally but per block? 
        // For simplicity, this button applies to "Visible List"
        const listToCheck = viewMode === 'rules' ? [] : displayedCombinations;
        
        return listToCheck.filter(combo => {
            const isPositioned = markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`);
            return !isPositioned;
        }).length;
    }, [displayedCombinations, markPositioningMap, viewMode]);

    const handleAcceptAllDefaults = useCallback(() => {
        if (!characterSets) return;
        
        // Apply only to currently visible list (Grid View)
        const unpositionedPairs = displayedCombinations.filter(combo => {
            const isPositioned = markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`);
            return !isPositioned;
        });

        if (unpositionedPairs.length === 0) return;
        
        let tempMarkPositioningMap = new Map(markPositioningMap);
        let tempGlyphDataMap = new Map(glyphDataMap);
        let tempCharacterSets = JSON.parse(JSON.stringify(characterSets!));

        for (const { base, mark, ligature } of unpositionedPairs) {
            const baseGlyph = tempGlyphDataMap.get(base.unicode);
            const markGlyph = tempGlyphDataMap.get(mark.unicode);
            if (!baseGlyph || !markGlyph || !metrics || !settings) continue;

            const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, settings.strokeThickness);
            const markBbox = getAccurateGlyphBBox(markGlyph.paths, settings.strokeThickness);
            const offset = calculateDefaultMarkOffset(base, mark, baseBbox, markBbox, markAttachmentRules, metrics, tempCharacterSets, false, groups);

            const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths)).map((p: Path) => ({
                ...p,
                points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
                segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
            }));
            const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
            const newGlyphData = { paths: combinedPaths };
            const newBearings = { lsb: ligature.lsb, rsb: ligature.rsb };
            
            const result = updatePositioningAndCascade({
                baseChar: base, markChar: mark, targetLigature: ligature, newGlyphData,
                newOffset: offset, newBearings, allChars, allLigaturesByKey: positioningData.allLigaturesByKey,
                markAttachmentClasses, baseAttachmentClasses,
                markPositioningMap: tempMarkPositioningMap,
                glyphDataMap: tempGlyphDataMap,
                characterSets: tempCharacterSets,
                positioningRules,
                markAttachmentRules,
                groups,
                strokeThickness: settings.strokeThickness
            });
            
            tempMarkPositioningMap = result.updatedMarkPositioningMap;
            tempGlyphDataMap = result.updatedGlyphDataMap;
            tempCharacterSets = result.updatedCharacterSets;
        }

        positioningDispatch({ type: 'SET_MAP', payload: tempMarkPositioningMap });
        glyphDataDispatch({ type: 'SET_MAP', payload: tempGlyphDataMap });
        characterDispatch({ type: 'SET_CHARACTER_SETS', payload: tempCharacterSets });

        showNotification(t('acceptedAllDefaults', { count: unpositionedPairs.length }), 'success');
    }, [displayedCombinations, markPositioningMap, glyphDataMap, showNotification, t, metrics, settings, markAttachmentRules, characterSets, allChars, positioningData.allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses, positioningRules, positioningDispatch, glyphDataDispatch, characterDispatch, groups]);
    
    const hasManuallyPositioned = useMemo(() => {
        // Only checked for displayed grid
        if (viewMode === 'rules') return false;
        return displayedCombinations.some(combo => 
            markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`)
        );
    }, [displayedCombinations, markPositioningMap, viewMode]);

    const handleResetPositions = useCallback(() => {
        if (!characterSets) return;
        const pairsToReset = displayedCombinations; 
        
        const newMarkPositioningMap = new Map(markPositioningMap);
        const newGlyphDataMap = new Map(glyphDataMap);
        let resetCount = 0;
    
        for (const combo of pairsToReset) {
            const key = `${combo.base.unicode}-${combo.mark.unicode}`;
            if (markPositioningMap.has(key)) {
                newMarkPositioningMap.delete(key);
                const relevantRule = positioningRules?.find(rule => 
                    expandMembers(rule.base, groups, characterSets).includes(combo.base.name) && 
                    expandMembers(rule.mark, groups, characterSets).includes(combo.mark.name)
                );
                if (relevantRule?.gsub && combo.ligature.unicode) {
                     newGlyphDataMap.delete(combo.ligature.unicode);
                }
                resetCount++;
            }
        }
        if (resetCount > 0) {
            positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: newGlyphDataMap });
            showNotification(t('positionsResetSuccess', { name: activeItem ? activeItem.name : `${resetCount} pairs` }), 'success');
        }
        setIsResetConfirmOpen(false);
    }, [activeItem, displayedCombinations, markPositioningMap, glyphDataMap, positioningRules, positioningDispatch, glyphDataDispatch, showNotification, t, groups, characterSets]);

    const handleResetSinglePair = useCallback((base: Character, mark: Character, ligature: Character) => {
        if (!characterSets) return;
        const key = `${base.unicode}-${mark.unicode}`;
        if (!markPositioningMap.has(key)) return;
    
        const newMarkPositioningMap = new Map(markPositioningMap);
        newMarkPositioningMap.delete(key);
        positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
    
        const relevantRule = positioningRules?.find(rule => 
            expandMembers(rule.base, groups, characterSets).includes(base.name) && 
            expandMembers(rule.mark, groups, characterSets).includes(mark.name)
        );
    
        if (relevantRule?.gsub && ligature.unicode) {
            const newGlyphDataMap = new Map(glyphDataMap);
            newGlyphDataMap.delete(ligature.unicode);
            glyphDataDispatch({ type: 'SET_MAP', payload: newGlyphDataMap });
        }
        showNotification(t('positionResetSuccess', { name: ligature.name }), 'success');
    }, [markPositioningMap, positioningDispatch, positioningRules, glyphDataMap, glyphDataDispatch, showNotification, t, groups, characterSets]);


    if (!settings || !metrics || !characterSets) return null;

    if (editingPair && editingIndex !== null) {
        return (
            <PositioningEditorPage
                baseChar={editingPair.base}
                markChar={editingPair.mark}
                targetLigature={editingPair.ligature}
                glyphDataMap={glyphDataMap}
                markPositioningMap={markPositioningMap}
                onSave={handleSavePair}
                onClose={() => { setEditingPair(null); setEditingIndex(null); }}
                onReset={handleResetSinglePair}
                settings={settings}
                metrics={metrics}
                markAttachmentRules={markAttachmentRules}
                positioningRules={positioningRules}
                allChars={allChars}
                // Pass the specific context list for navigation
                allPairs={editingContextList}
                currentIndex={editingIndex}
                onNavigate={handleNavigatePair}
                characterSets={characterSets}
                glyphVersion={glyphVersion}
            />
        );
    }

    const getBannerText = () => {
        if (isSearching) {
            return `Searching: "${searchQuery}"`;
        }
        switch(filterMode) {
            case 'completed': return t('filterCompleted');
            case 'incomplete': return t('filterIncomplete');
            case 'all': return t('filterAllFlat');
            default: return '';
        }
    };
    
    const bannerVisible = isFiltered || isRulesManagerOpen;
    const isGridView = viewMode === 'base' || viewMode === 'mark';

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex flex-row justify-between items-center relative gap-2 sm:gap-0">
                    {!bannerVisible && (
                        <div className="flex-1 sm:flex-none flex justify-start sm:justify-center sm:absolute sm:left-1/2 sm:top-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 mr-2 sm:mr-0 min-w-0">
                            {/* View Toggle */}
                            <div className="inline-flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg shadow-inner w-full sm:w-auto h-full items-stretch">
                                <button 
                                    onClick={() => setViewMode('rules')} 
                                    className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-normal text-center leading-tight flex items-center justify-center ${viewMode === 'rules' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                >
                                    By Rule
                                </button>
                                <button 
                                    onClick={() => setViewMode('base')} 
                                    className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-normal text-center leading-tight flex items-center justify-center ${viewMode === 'base' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                >
                                    By Base
                                </button>
                                <button 
                                    onClick={() => setViewMode('mark')} 
                                    className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-normal text-center leading-tight flex items-center justify-center ${viewMode === 'mark' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                >
                                    By Mark
                                </button>
                            </div>
                        </div>
                    )}
                    {isFiltered && (
                         <div className="flex-1 text-left sm:text-center sm:absolute sm:left-1/2 sm:top-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 font-bold text-gray-700 dark:text-gray-200 text-sm sm:text-base truncate">
                             {getBannerText()}
                         </div>
                    )}
                    {isRulesManagerOpen && (
                         <div className="flex-1 text-left sm:text-center sm:absolute sm:left-1/2 sm:top-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 font-bold text-gray-900 dark:text-white text-lg sm:text-xl truncate">
                             {t('manageRules')}
                         </div>
                    )}

                    <div className="flex-shrink-0 ml-auto flex items-center gap-2">
                        {!isRulesManagerOpen ? (
                             <button 
                                onClick={() => setIsRulesManagerOpen(true)} 
                                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-xs sm:text-sm"
                            >
                                <RulesIcon className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap">{t('manageRules')}</span>
                            </button>
                        ) : (
                             <>
                                {!settings?.isAutosaveEnabled && (
                                    <button 
                                        onClick={() => { saveManagerChanges(); showNotification(t('projectSaved'), 'success'); }}
                                        className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors text-xs sm:text-sm"
                                    >
                                        <SaveIcon className="w-4 h-4 flex-shrink-0" />
                                        <span className="whitespace-nowrap">{t('save')}</span>
                                    </button>
                                )}
                                <button 
                                    onClick={() => setIsRulesManagerOpen(false)} 
                                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-xs sm:text-sm"
                                >
                                    <BackIcon className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap">Back</span>
                                </button>
                             </>
                        )}
                    </div>
                </div>
                
                {/* Secondary Nav for Grid View */}
                {!isRulesManagerOpen && !isFiltered && isGridView && (
                    <div className="relative mt-2">
                        {showNavArrows.left && (
                             <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-800"><LeftArrowIcon className="h-5 w-5"/></button>
                        )}
                        <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar py-1">
                           {navItems.map((item, index) => (
                                <button
                                    key={item.unicode}
                                    onClick={() => setActiveTab(index)}
                                    className={`flex-shrink-0 px-3 py-2 text-lg font-bold rounded-md whitespace-nowrap transition-colors ${activeTab === index ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                    style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                                >
                                    {item.name}
                                </button>
                            ))}
                        </div>
                        {showNavArrows.right && (
                            <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-800"><RightArrowIcon className="h-5 w-5"/></button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-grow overflow-y-auto p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/50">
                {isRulesManagerOpen ? (
                    <PositioningRulesManager
                        positioningRules={localPosRules} setPositioningRules={setLocalPosRules}
                        markAttachmentRules={localMarkAttach} setMarkAttachmentRules={setLocalMarkAttach}
                        markAttachmentClasses={localMarkClasses} setMarkAttachmentClasses={setLocalMarkClasses}
                        baseAttachmentClasses={localBaseClasses} setBaseAttachmentClasses={setLocalBaseClasses}
                        recommendedKerning={localKerning} setRecommendedKerning={setLocalKerning}
                        groups={localGroups} setGroups={setLocalGroups}
                        characterSets={characterSets || []}
                    />
                ) : (
                    <>
                        {showIncompleteNotice && !isFiltered && (
                            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-blue-700 dark:text-blue-300">
                                {t('positioningShowOnlyComplete')}
                            </div>
                        )}

                        {/* MODE 1: Rule-Centric View */}
                        {viewMode === 'rules' && !isFiltered && (
                            selectedRuleGroupId === null ? (
                                // Level 1: List of Blocks
                                <div className="space-y-6 max-w-4xl mx-auto">
                                    {ruleGroups.map((group, idx) => (
                                        <PositioningRuleBlock
                                            key={group.id}
                                            rule={group.rule}
                                            pairs={group.pairs}
                                            onEditPair={() => {
                                                setSelectedRuleGroupId(group.id);
                                                setRulePage(1);
                                            }}
                                            glyphDataMap={glyphDataMap}
                                            markPositioningMap={markPositioningMap}
                                            strokeThickness={settings.strokeThickness}
                                            markAttachmentRules={markAttachmentRules}
                                            characterSets={characterSets}
                                            groups={groups}
                                            glyphVersion={glyphVersion}
                                            metrics={metrics}
                                        />
                                    ))}
                                    {ruleGroups.length === 0 && (
                                         <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                                            <p className="text-gray-500 italic">No rules defined or no glyphs drawn for rules.</p>
                                         </div>
                                    )}
                                </div>
                            ) : (
                                // Level 2: Drill-down Grid
                                <div className="animate-fade-in-up">
                                    {/* Header with Back Button */}
                                    <div className="flex items-center justify-between mb-6 border-b dark:border-gray-700 pb-4">
                                        <div className="flex items-center gap-4">
                                            <button 
                                                onClick={() => setSelectedRuleGroupId(null)}
                                                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                title="Back to Rules"
                                            >
                                                <BackIcon />
                                            </button>
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Rule Details</h3>
                                                {activeRuleGroup && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        {activeRuleGroup.pairs.length} pairs total • Page {rulePage}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Grid */}
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4">
                                        {pagedRulePairs.map((pair, idx) => {
                                            const isPositioned = markPositioningMap.has(`${pair.base.unicode}-${pair.mark.unicode}`);
                                            const pairId = `${pair.base.unicode}-${pair.mark.unicode}`;
                                            const globalIndex = ((rulePage - 1) * ITEMS_PER_PAGE) + idx;
                                            
                                            // Determine stacking
                                            const classKey = getPairClassKey(pair);
                                            const siblingCount = classCounts.get(classKey) || 1;
                                            const isStacked = siblingCount > 1;
                                            
                                            return (
                                                <div key={pairId} className={`relative group ${isStacked ? 'mb-1 mr-1' : ''}`}>
                                                     {/* Stack Backgrounds */}
                                                     {isStacked && (
                                                        <>
                                                            {siblingCount > 5 && <div className="absolute inset-0 translate-x-2 translate-y-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg -z-20" />}
                                                            <div className="absolute inset-0 translate-x-1 translate-y-1 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg -z-10" />
                                                        </>
                                                     )}
                                                    
                                                    <div className="relative z-0">
                                                        <CombinationCard
                                                            baseChar={pair.base}
                                                            markChar={pair.mark}
                                                            ligature={pair.ligature}
                                                            isPositioned={isPositioned}
                                                            canEdit={true}
                                                            onClick={() => {
                                                                setEditingPair(pair);
                                                                // Find actual index in the full context list to allow proper navigation
                                                                const actualIndex = activeRuleGroup!.pairs.indexOf(pair);
                                                                setEditingIndex(actualIndex);
                                                                
                                                                // IMPORTANT: Filter context list by class key
                                                                const classKey = getPairClassKey(pair);
                                                                const filteredContext = activeRuleGroup!.pairs.filter(p => getPairClassKey(p) === classKey);
                                                                setEditingContextList(filteredContext);
                                                                
                                                                // Recalculate index in filtered list
                                                                const filteredIndex = filteredContext.findIndex(p => p.base.unicode === pair.base.unicode && p.mark.unicode === pair.mark.unicode);
                                                                setEditingIndex(filteredIndex);
                                                            }}
                                                            onConfirmPosition={() => handleConfirmPosition(pair.base, pair.mark, pair.ligature)}
                                                            glyphDataMap={glyphDataMap}
                                                            strokeThickness={settings.strokeThickness}
                                                            markAttachmentRules={markAttachmentRules}
                                                            markPositioningMap={markPositioningMap}
                                                            characterSets={characterSets}
                                                            glyphVersion={glyphVersion}
                                                            groups={groups}
                                                        />
                                                        {/* Stack count badge */}
                                                        {isStacked && (
                                                            <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-bold px-1.5 rounded-bl-lg rounded-tr-lg shadow-sm z-10">
                                                                +{siblingCount - 1}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pagination Controls */}
                                    {ruleTotalPages > 1 && (
                                        <div className="flex justify-center items-center gap-4 mt-8">
                                            <button
                                                onClick={() => setRulePage(p => Math.max(1, p - 1))}
                                                disabled={rulePage === 1}
                                                className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
                                            >
                                                <LeftArrowIcon />
                                            </button>
                                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                                Page {rulePage} of {ruleTotalPages}
                                            </span>
                                            <button
                                                onClick={() => setRulePage(p => Math.min(ruleTotalPages, p + 1))}
                                                disabled={rulePage === ruleTotalPages}
                                                className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
                                            >
                                                <RightArrowIcon />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        )}

                        {/* MODE 2: Grid View (Base/Mark or Filtered) */}
                        {(isGridView || isFiltered) && (
                            <>
                            {((!isFiltered && navItems.length === 0) || (isFiltered && displayedCombinations.length === 0)) && (
                                <div className="text-center p-8 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                    <p className="text-gray-600 dark:text-gray-400">
                                        {isFiltered ? t('noResultsFound') : (viewMode === 'base' ? t('positioningNoBasesDrawn') : t('positioningNoMarksDrawn'))}
                                    </p>
                                </div>
                            )}
                            
                            {(activeItem || (isFiltered && displayedCombinations.length > 0)) && (
                                <div key={activeItem?.unicode || 'flat-list'}>
                                    <div className="flex items-center gap-4 mb-4 flex-wrap">
                                        {!isFiltered && (
                                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                                {t('combinationsFor', { item: activeItem!.name })}
                                            </h2>
                                        )}
                                        {!isFiltered && (
                                            <button
                                                onClick={() => handleOpenReuseModal(activeItem!)}
                                                title={t('copyPositionFrom')}
                                                className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                            >
                                                <CopyIcon />
                                            </button>
                                        )}
                                        <button
                                            onClick={handleAcceptAllDefaults}
                                            disabled={unpositionedCount === 0}
                                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        >
                                            <CheckCircleIcon className="h-4 w-4" />
                                            {t('acceptAllDefaults')}
                                        </button>
                                        <button
                                            onClick={() => setIsResetConfirmOpen(true)}
                                            disabled={!hasManuallyPositioned}
                                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-yellow-600 text-white font-semibold rounded-md hover:bg-yellow-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        >
                                            <UndoIcon />
                                            {t('resetPositions')}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4">
                                        {displayedCombinations.map(({ base, mark, ligature }, index) => {
                                            const isPositioned = markPositioningMap.has(`${base.unicode}-${mark.unicode}`);
                                            const pairId = `${base.unicode}-${mark.unicode}`;
                                            return (
                                                <CombinationCard
                                                    key={ligature.unicode}
                                                    ref={(el) => { if (el) cardRefs.current.set(pairId, el); else cardRefs.current.delete(pairId); }}
                                                    baseChar={base}
                                                    markChar={mark}
                                                    ligature={ligature}
                                                    glyphDataMap={glyphDataMap}
                                                    strokeThickness={settings.strokeThickness}
                                                    isPositioned={isPositioned}
                                                    canEdit={true}
                                                    onClick={() => {
                                                        setEditingPair({ base, mark, ligature });
                                                        setEditingIndex(index);
                                                        setEditingContextList(displayedCombinations);
                                                    }}
                                                    onConfirmPosition={() => handleConfirmPosition(base, mark, ligature)}
                                                    markAttachmentRules={markAttachmentRules}
                                                    markPositioningMap={markPositioningMap}
                                                    characterSets={characterSets!}
                                                    glyphVersion={glyphVersion}
                                                    groups={groups}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            </>
                        )}
                    </>
                )}
            </div>
            
            {isReuseModalOpen && reuseSourceItem && (
                <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4" onClick={() => setIsReuseModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                        <header className="p-4 border-b dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('copyFrom', { consonantName: reuseSourceItem.name })}</h3>
                        </header>
                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            {fullyPositionedItems.length > 0 ? (
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                                    {fullyPositionedItems.map(item => (
                                        <div key={item.unicode} onClick={() => handleCopyPositions(item)} className="p-2 flex flex-col items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors">
                                            <div className="w-16 h-16 text-4xl flex items-center justify-center font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                                {item.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-8">{t('noCompleteSources')}</p>
                            )}
                        </div>
                        <footer className="p-4 border-t dark:border-gray-700 flex justify-end">
                            <button onClick={() => setIsReuseModalOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">{t('cancel')}</button>
                        </footer>
                    </div>
                </div>
            )}
             {isResetConfirmOpen && (
                <Modal
                    isOpen={isResetConfirmOpen}
                    onClose={() => setIsResetConfirmOpen(false)}
                    title={t('confirmResetTitle')}
                    footer={<>
                        <button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button>
                        <button onClick={handleResetPositions} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button>
                    </>}
                >
                    <p>{t('confirmResetMessage', { name: activeItem ? activeItem.name : "Selected Items" })}</p>
                </Modal>
            )}
        </div>
    );
};

export default React.memo(PositioningPage);
