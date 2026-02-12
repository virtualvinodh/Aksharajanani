
import { useMemo, useCallback } from 'react';
import { PositioningRules, Character, GlyphData, CharacterSet, AttachmentClass, MarkPositioningMap } from '../../types';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { expandMembers } from '../../services/groupExpansionService';
import { parseSearchQuery, getCharacterMatchScore } from '../../utils/searchUtils';

interface UsePositioningDataProps {
    positioningRules: PositioningRules[] | null;
    fontRules: any;
    characterSets: CharacterSet[] | null;
    glyphDataMap: Map<number, GlyphData>;
    allChars: Map<string, Character>;
    groups: Record<string, string[]>;
    baseAttachmentClasses: AttachmentClass[] | null;
    markAttachmentClasses: AttachmentClass[] | null;
    markPositioningMap: MarkPositioningMap;
    filterMode: string;
    searchQuery: string;
    viewMode: 'rules' | 'base' | 'mark';
    activeTab: number;
    selectedRuleGroupId: number | null;
    rulePage: number;
    ITEMS_PER_PAGE: number;
}

export const usePositioningData = ({
    positioningRules,
    fontRules,
    characterSets,
    glyphDataMap,
    allChars,
    groups,
    baseAttachmentClasses,
    markAttachmentClasses,
    markPositioningMap,
    filterMode,
    searchQuery,
    viewMode,
    activeTab,
    selectedRuleGroupId,
    rulePage,
    ITEMS_PER_PAGE
}: UsePositioningDataProps) => {

    const isSearching = searchQuery.trim().length > 0;
    const isFiltered = filterMode !== 'none' || isSearching;

    // Identified standard grid names to avoid showing auto-assembled duplicates
    const standardGridNames = useMemo(() => {
        if (!characterSets) return new Set<string>();
        return new Set(
            characterSets
                .filter(s => s.nameKey !== 'dynamicLigatures')
                .flatMap(s => s.characters)
                .map(c => c.name)
        );
    }, [characterSets]);

    const positioningData = useMemo(() => {
        const newLigaturesByKey = new Map<string, Character>();
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
                                // Logic: GSUB implies a specific Ligature glyph. GPOS implies a Virtual pairing.
                                const derivedClass = rule.gsub ? 'ligature' : 'virtual';

                                targetLigature = {
                                    name: finalLigatureName,
                                    unicode: virtualPuaCounter,
                                    glyphClass: derivedClass,
                                    // Use 'position' property to indicate this is a positioned pair
                                    position: [baseName, markName],
                                    // Inherit feature tags from the rule
                                    gpos: rule.gpos,
                                    gsub: rule.gsub
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

    const { groups: ruleGroups, hasIncomplete: rulesHaveIncomplete } = useMemo(() => {
        if (!positioningRules || !characterSets) return { groups: [], hasIncomplete: false };
        
        let incompleteFound = false;

        const groupsList = positioningRules.map((rule, index) => {
            const ruleBases = expandMembers(rule.base, groups, characterSets);
            const ruleMarks = expandMembers(rule.mark || [], groups, characterSets);
            
            const pairs: { base: Character; mark: Character; ligature: Character }[] = [];
            
            for (const baseName of ruleBases) {
                for (const markName of ruleMarks) {
                    const baseChar = allChars.get(baseName);
                    const markChar = allChars.get(markName);
                    
                    if (baseChar && markChar) {
                        // REVERT: Only add pairs if components are drawn
                        if (isGlyphDrawn(glyphDataMap.get(baseChar.unicode)) && isGlyphDrawn(glyphDataMap.get(markChar.unicode))) {
                            const ligature = positioningData.allLigaturesByKey.get(`${baseChar.unicode}-${markChar.unicode}`);
                            if (ligature) {
                                // FILTER: If this ligature is already a unique character in the grid, don't show it here
                                if (!standardGridNames.has(ligature.name)) {
                                    pairs.push({ base: baseChar, mark: markChar, ligature });
                                }
                            }
                        } else {
                            incompleteFound = true;
                        }
                    }
                }
            }
            return { rule, pairs, id: index };
        }).filter(group => group.pairs.length > 0);

        return { groups: groupsList, hasIncomplete: incompleteFound };

    }, [positioningRules, groups, characterSets, allChars, glyphDataMap, positioningData.allLigaturesByKey, standardGridNames]);
    
    const activeRuleGroup = useMemo(() => 
        ruleGroups.find(g => g.id === selectedRuleGroupId),
    [ruleGroups, selectedRuleGroupId]);

    const getPairClassKey = useCallback((pair: { base: Character, mark: Character }) => {
        const pairNameKey = `${pair.base.name}-${pair.mark.name}`;
        
        let baseKey = `B:${pair.base.name}`;
        
        const baseClassIdx = baseAttachmentClasses?.findIndex(cls => {
            const isMember = expandMembers(cls.members, groups, characterSets).includes(pair.base.name);
            if (!isMember) return false;
            
            // Validate Scope: Check if class applies to the MARK of this pair
            if (cls.applies && cls.applies.length > 0 && !expandMembers(cls.applies, groups, characterSets).includes(pair.mark.name)) return false;
            
            // Validate Exceptions: Check if MARK is an exception for this class
            if (cls.exceptions && expandMembers(cls.exceptions, groups, characterSets).includes(pair.mark.name)) return false;
            
            return true;
        });
        
        if (baseClassIdx !== undefined && baseClassIdx > -1) {
            const cls = baseAttachmentClasses![baseClassIdx];
            const isException = cls.exceptPairs && cls.exceptPairs.includes(pairNameKey);
            
            if (!isException) {
                baseKey = `BC:${baseClassIdx}`;
            }
        }

        let markKey = `M:${pair.mark.name}`;
        const markClassIdx = markAttachmentClasses?.findIndex(cls => {
            const isMember = expandMembers(cls.members, groups, characterSets).includes(pair.mark.name);
            if (!isMember) return false;

            // Validate Scope: Check if class applies to the BASE of this pair
            if (cls.applies && cls.applies.length > 0 && !expandMembers(cls.applies, groups, characterSets).includes(pair.base.name)) return false;
            
            // Validate Exceptions: Check if BASE is an exception for this class
            if (cls.exceptions && expandMembers(cls.exceptions, groups, characterSets).includes(pair.base.name)) return false;

            return true;
        });
        
        if (markClassIdx !== undefined && markClassIdx > -1) {
            const cls = markAttachmentClasses![markClassIdx];
            const isException = cls.exceptPairs && cls.exceptPairs.includes(pairNameKey);
                                
             if (!isException) {
                 markKey = `MC:${markClassIdx}`;
             }
        }
        
        return `${baseKey}-${markKey}`;
    }, [baseAttachmentClasses, markAttachmentClasses, groups, characterSets]);

    const classCounts = useMemo(() => {
        if (!activeRuleGroup) return new Map<string, number>();
        const counts = new Map<string, number>();
        activeRuleGroup.pairs.forEach(pair => {
             const key = getPairClassKey(pair);
             counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }, [activeRuleGroup, getPairClassKey]);

    const uniqueRepPairs = useMemo(() => {
        if (!activeRuleGroup) return [];
        const seenKeys = new Set<string>();
        return activeRuleGroup.pairs.filter(pair => {
            const uniqueKey = getPairClassKey(pair);
            if (seenKeys.has(uniqueKey)) {
                return false; 
            }
            seenKeys.add(uniqueKey);
            return true; 
        });
    }, [activeRuleGroup, getPairClassKey]);

    const pagedRulePairs = useMemo(() => {
        if (!uniqueRepPairs) return [];
        const start = (rulePage - 1) * ITEMS_PER_PAGE;
        return uniqueRepPairs.slice(start, start + ITEMS_PER_PAGE);
    }, [uniqueRepPairs, rulePage, ITEMS_PER_PAGE]);

    const ruleTotalPages = uniqueRepPairs ? Math.ceil(uniqueRepPairs.length / ITEMS_PER_PAGE) : 0;
    
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
            if (char && !char.hidden) {
                // If we are viewing by item, we only add it if there's at least one pair for it 
                // that ISN'T in the standard grid.
                const hasEligiblePairs = Array.from(positioningData.allLigaturesByKey.entries()).some(([key, lig]) => {
                    const [b, m] = key.split('-').map(Number);
                    if (viewMode === 'base' && b !== char.unicode) return false;
                    if (viewMode === 'mark' && m !== char.unicode) return false;
                    
                    // REVERT: Item must have drawn components to be visible in nav
                    if (!isGlyphDrawn(glyphDataMap.get(b)) || !isGlyphDrawn(glyphDataMap.get(m))) return false;

                    return !standardGridNames.has(lig.name);
                });

                if (hasEligiblePairs) {
                    items.set(char.unicode, char);
                }
            }
        });

        return Array.from(items.values()).sort((a, b) => a.unicode - b.unicode);
    }, [positioningRules, allChars, viewMode, glyphDataMap, isFiltered, groups, characterSets, standardGridNames, positioningData.allLigaturesByKey]);

    const activeItem = navItems[activeTab];

    const { combinations: displayedCombinations, hasIncomplete: gridHasIncomplete } = useMemo(() => {
        if (!positioningRules || !characterSets || viewMode === 'rules') return { combinations: [], hasIncomplete: false };
        
        const allCombinations: { base: Character; mark: Character; ligature: Character }[] = [];
        const addedLigatures = new Set<number>();
        let incompleteFound = false;
    
        const rulesToProcess = positioningRules;
        
        for (const rule of rulesToProcess) {
            const ruleBases = expandMembers(rule.base, groups, characterSets);
            const ruleMarks = expandMembers(rule.mark, groups, characterSets);
            
            let basesToCheck = ruleBases;
            let marksToCheck = ruleMarks;
            
            if (!isFiltered) {
                if (!activeItem) return { combinations: [], hasIncomplete: false }; 
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
                         // REVERT: Combinations only show if components are drawn
                         if (isGlyphDrawn(glyphDataMap.get(baseChar.unicode)) && isGlyphDrawn(glyphDataMap.get(markChar.unicode))) {
                             const ligature = positioningData.allLigaturesByKey.get(`${baseChar.unicode}-${markChar.unicode}`);
                             if (ligature && !addedLigatures.has(ligature.unicode)) {
                                // FILTER: Redundancy check
                                if (!standardGridNames.has(ligature.name)) {
                                    allCombinations.push({ base: baseChar, mark: markChar, ligature });
                                    addedLigatures.add(ligature.unicode);
                                }
                             }
                         } else {
                             incompleteFound = true;
                         }
                     }
                }
            }
        }

        let result = [...allCombinations];
        
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
        return { combinations: result, hasIncomplete: incompleteFound };
    }, [activeItem, positioningRules, viewMode, allChars, positioningData.allLigaturesByKey, glyphDataMap, isFiltered, filterMode, markPositioningMap, searchQuery, isSearching, groups, characterSets, standardGridNames]);

    const hasIncompleteData = viewMode === 'rules' ? rulesHaveIncomplete : gridHasIncomplete;

    return { 
        positioningData, 
        ruleGroups, 
        activeRuleGroup, 
        getPairClassKey, 
        classCounts, 
        uniqueRepPairs, 
        pagedRulePairs, 
        ruleTotalPages, 
        navItems, 
        activeItem, 
        displayedCombinations,
        hasIncompleteData 
    };
};
