
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { RecommendedKerning, Character } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import KerningSelectionView from './kerning/KerningSelectionView';
import KerningEditorPage from './KerningEditorPage';
import { useRules } from '../contexts/RulesContext';
import { expandMembers } from '../services/groupExpansionService';
import { parseSearchQuery, getCharacterMatchScore } from '../utils/searchUtils';
import { isGlyphDrawn as isGlyphDrawnUtil } from '../utils/glyphUtils';

interface KerningPageProps {
  recommendedKerning: RecommendedKerning[] | null;
  mode: 'recommended' | 'all' | 'spaced';
  showRecommendedLabel: boolean;
  onSwitchToAllPairs?: () => void;
}

const KerningPage: React.FC<KerningPageProps> = ({ 
    recommendedKerning, 
    mode, 
    showRecommendedLabel, 
    onSwitchToAllPairs 
}) => {
    const { t } = useLocale();
    const { 
        pendingNavigationTarget, setPendingNavigationTarget, 
        filterMode, searchQuery, showNotification,
        setWorkspace, selectCharacter
    } = useLayout();
    const { characterSets, allCharsByName, allCharsByUnicode } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap, suggestedKerningMap, ignoredPairs, dispatch: kerningDispatch } = useKerning();
    const { settings, metrics } = useSettings();
    const { state: rulesState } = useRules();
    
    // The open pair is tracked by its glyphs, not its list position (K1): saving can drop it from a
    // filtered list, and an index would then silently point at the next pair.
    const [editingPair, setEditingPair] = useState<{ left: Character; right: Character } | null>(null);
    const lastIndexRef = useRef(0);
    const [selectedLeftChars, setSelectedLeftChars] = useState(new Set<number>());
    const [selectedRightChars, setSelectedRightChars] = useState(new Set<number>());

    const isGlyphDrawn = useCallback((unicode: number | undefined): boolean => {
        if (unicode === undefined) return false;
        return isGlyphDrawnUtil(glyphDataMap.get(unicode));
    }, [glyphDataMap, glyphVersion]);

    // RESET SELECTIONS ON TAB CHANGE
    useEffect(() => {
        setSelectedLeftChars(new Set());
        setSelectedRightChars(new Set());
    }, [mode]);

    // Names in the standard grid to exclude from kerning logic
    const standardGridNames = useMemo(() => {
        if (!characterSets) return new Set<string>();
        return new Set(
            characterSets
                .filter(s => s.nameKey !== 'dynamicLigatures')
                .flatMap(s => s.characters)
                .map(c => c.name)
        );
    }, [characterSets]);

    // 1. Expand all possible pairs based on rules
    const { allPairsInContext, hasHiddenRecommended } = useMemo(() => {
        let hasHidden = false;
        if (!characterSets) return { allPairsInContext: [], hasHiddenRecommended: false };
        const groups = rulesState.fontRules?.groups || {};
        const seen = new Set<string>();

        const addPair = (l: Character, r: Character) => {
            if (l?.unicode !== undefined && r?.unicode !== undefined) {
                const key = `${l.unicode}-${r.unicode}`;
                if (!seen.has(key)) {
                    pairs.push({ left: l, right: r });
                    seen.add(key);
                }
            }
        };

        let pairs: { left: any, right: any }[] = [];

        if (mode === 'spaced') {
            kerningMap.forEach((_, key) => {
                const [lId, rId] = key.split('-').map(Number);
                const lChar = allCharsByUnicode.get(lId);
                const rChar = allCharsByUnicode.get(rId);
                
                if (lChar && rChar) {
                     // Check if drawn, usually yes if kerned, but good to be safe
                     if (isGlyphDrawn(lChar.unicode) && isGlyphDrawn(rChar.unicode)) {
                         addPair(lChar, rChar);
                     }
                }
            });
            
             // FILTER: If side panels have selections, filter the list
            if (selectedLeftChars.size > 0) {
                pairs = pairs.filter(p => selectedLeftChars.has(p.left.unicode));
            }
            if (selectedRightChars.size > 0) {
                pairs = pairs.filter(p => selectedRightChars.has(p.right.unicode));
            }
            
            const sorted = pairs.sort((a,b) => a.left.name.localeCompare(b.left.name) || a.right.name.localeCompare(b.right.name));
            return { allPairsInContext: sorted, hasHiddenRecommended: false };

        } else if (mode === 'recommended') {
            // A. Static Rules from JSON
            if (recommendedKerning) {
                recommendedKerning.forEach(([leftRule, rightRule]) => {
                    const lefts = expandMembers([leftRule], groups, characterSets);
                    const rights = expandMembers([rightRule], groups, characterSets);
                    
                    lefts.forEach(lName => {
                        rights.forEach(rName => {
                            const lChar = allCharsByName.get(lName);
                            const rChar = allCharsByName.get(rName);
                            if (lChar && rChar) {
                                if (standardGridNames.has(lChar.name + rChar.name)) return;
                                if (isGlyphDrawn(lChar.unicode) && isGlyphDrawn(rChar.unicode)) {
                                    addPair(lChar, rChar);
                                } else {
                                    hasHidden = true;
                                }
                            }
                        });
                    });
                });
            }

            // B. Auto-detected suggestions (Dynamic)
            // Merge suggestions into the "Recommended" tab as they serve the same "To-Do" purpose
            suggestedKerningMap.forEach((_, key) => {
                 const [lId, rId] = key.split('-').map(Number);
                 const lChar = allCharsByUnicode.get(lId);
                 const rChar = allCharsByUnicode.get(rId);
                 if (lChar && rChar) {
                     // Check drawn status to be safe, though auto-kerning only generates for drawn glyphs
                     if (isGlyphDrawn(lChar.unicode) && isGlyphDrawn(rChar.unicode)) {
                         addPair(lChar, rChar);
                     }
                 }
            });

            // FILTER: If side panels have selections, filter the recommended list
            if (selectedLeftChars.size > 0) {
                pairs = pairs.filter(p => selectedLeftChars.has(p.left.unicode));
            }
            if (selectedRightChars.size > 0) {
                pairs = pairs.filter(p => selectedRightChars.has(p.right.unicode));
            }

            return { allPairsInContext: pairs, hasHiddenRecommended: hasHidden };
        } else { // 'all' mode
            // Strict Generator Mode: Only show results if user has selected characters on both sides.
            if (selectedLeftChars.size > 0 && selectedRightChars.size > 0) {
                for (const lId of selectedLeftChars) {
                    for (const rId of selectedRightChars) {
                        const l = allCharsByUnicode.get(lId);
                        const r = allCharsByUnicode.get(rId);
                        if (l && r && !standardGridNames.has(l.name + r.name)) {
                            if (isGlyphDrawn(l.unicode) && isGlyphDrawn(r.unicode)) {
                                addPair(l, r);
                            }
                        }
                    }
                }
            } else {
                // If selection is incomplete, return empty list.
                // The view will show the "Select characters..." placeholder.
                return { allPairsInContext: [], hasHiddenRecommended: false };
            }
            const sorted = pairs.sort((a,b) => a.left.name.localeCompare(b.left.name) || a.right.name.localeCompare(b.right.name));
            return { allPairsInContext: sorted, hasHiddenRecommended: false };
        }
    }, [mode, recommendedKerning, characterSets, rulesState.fontRules, allCharsByName, selectedLeftChars, selectedRightChars, suggestedKerningMap, allCharsByUnicode, standardGridNames, isGlyphDrawn, kerningMap]);

    // 2. Filter list by search query and saved status
    const filteredPairs = useMemo(() => {
        let result = [...allPairsInContext];
        
        if (filterMode === 'ignored') {
            result = result.filter(p => ignoredPairs.has(`${p.left.unicode}-${p.right.unicode}`));
        } else {
            // By default, exclude ignored pairs from other views
            result = result.filter(p => !ignoredPairs.has(`${p.left.unicode}-${p.right.unicode}`));
            
            if (filterMode === 'completed') {
                result = result.filter(p => kerningMap.has(`${p.left.unicode}-${p.right.unicode}`));
            } else if (filterMode === 'incomplete') {
                result = result.filter(p => !kerningMap.has(`${p.left.unicode}-${p.right.unicode}`));
            } else if (filterMode === 'toBeReviewed') {
                result = result.filter(p => {
                    const key = `${p.left.unicode}-${p.right.unicode}`;
                    return suggestedKerningMap.has(key) && !kerningMap.has(key);
                });
            }
        }
        
        if (searchQuery.trim()) {
            const q = parseSearchQuery(searchQuery);
            if (q.isEffective) {
                const scored = result.map(p => {
                    const sL = getCharacterMatchScore(p.left, q);
                    const sR = getCharacterMatchScore(p.right, q);
                    let best = -1;
                    if (sL > 0 && sR > 0) best = Math.min(sL, sR);
                    else if (sL > 0) best = sL;
                    else if (sR > 0) best = sR;
                    return { p, score: best };
                }).filter(x => x.score > 0);
                scored.sort((a,b) => a.score - b.score || a.p.left.name.localeCompare(b.p.left.name));
                result = scored.map(x => x.p);
            }
        }
        return result;
    }, [allPairsInContext, filterMode, kerningMap, searchQuery, suggestedKerningMap, ignoredPairs]);

    const handleAcceptSuggestions = useCallback((specificKeys?: string[]) => {
        if (suggestedKerningMap.size === 0) return;

        let newEntries: [string, number][] = [];

        if (specificKeys && specificKeys.length > 0) {
             // Accept only specific keys
             newEntries = specificKeys
                .filter(key => suggestedKerningMap.has(key) && !kerningMap.has(key) && !ignoredPairs.has(key))
                .map(key => [key, suggestedKerningMap.get(key)!]);
        } else {
             // Fallback: Accept all
             newEntries = Array.from(suggestedKerningMap.entries())
                .filter(([key]) => !kerningMap.has(key) && !ignoredPairs.has(key));
        }

        if (newEntries.length > 0) {
            const updateMap = new Map(newEntries);
            kerningDispatch({ type: 'BATCH_UPDATE', payload: updateMap });
            
            const acceptedKeys = newEntries.map(e => e[0]);
            kerningDispatch({ type: 'REMOVE_SUGGESTIONS', payload: acceptedKeys });

            showNotification(t('acceptedAutoGenerated', { count: newEntries.length }), 'success');
        }
    }, [suggestedKerningMap, kerningMap, kerningDispatch, showNotification, t, ignoredPairs]);

    // Deep Link Handler
    useEffect(() => {
        if (pendingNavigationTarget) {
            const index = filteredPairs.findIndex(p => `${p.left.unicode}-${p.right.unicode}` === pendingNavigationTarget);
            if (index !== -1) {
                setEditingPair(filteredPairs[index]);
                setPendingNavigationTarget(null);
            }
        }
    }, [pendingNavigationTarget, filteredPairs, setPendingNavigationTarget]);

    const pairKey = (p: { left: Character; right: Character }) => `${p.left.unicode}-${p.right.unicode}`;
    const editingIndex = editingPair ? filteredPairs.findIndex(p => pairKey(p) === pairKey(editingPair)) : -1;
    if (editingIndex >= 0) lastIndexRef.current = editingIndex;
    // Neighbours: if the pair just left the list, the next pair now sits at its old position.
    const prevPair = editingPair ? (editingIndex >= 0 ? filteredPairs[editingIndex - 1] : filteredPairs[lastIndexRef.current - 1]) : undefined;
    const nextPair = editingPair ? (editingIndex >= 0 ? filteredPairs[editingIndex + 1] : filteredPairs[lastIndexRef.current]) : undefined;

    const handleNavigate = (target: 'prev' | 'next' | Character) => {
        if (typeof target === 'object') {
            // It's a Character object (from Source strip) - Switch to Drawing Workspace
            setEditingPair(null);
            selectCharacter(target);
            setWorkspace('drawing');
            return;
        }

        // It's a direction string - Navigate within Kerning list
        if (target === 'prev' && prevPair) setEditingPair(prevPair);
        if (target === 'next' && nextPair) setEditingPair(nextPair);
    };

    const handleDeletePair = useCallback(() => {
        const pair = editingPair;
        if (!pair) return;

        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        
        if (filterMode === 'ignored') {
            kerningDispatch({ type: 'UNIGNORE_PAIR', payload: key });
            showNotification(t('pairUnignored'), 'success');
        } else {
            const newMap = new Map(kerningMap);
            newMap.delete(key);
            kerningDispatch({ type: 'SET_MAP', payload: newMap });
        }
        setEditingPair(null);
    }, [editingPair, kerningMap, kerningDispatch, filterMode, showNotification, t]);

    const handleIgnorePair = useCallback(() => {
        const pair = editingPair;
        if (!pair) return;
        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        kerningDispatch({ type: 'IGNORE_PAIR', payload: key });
        showNotification(t('pairIgnored'), 'info');
        setEditingPair(null);
    }, [editingPair, kerningDispatch, showNotification, t]);

    if (editingPair) {
        const pair = editingPair;
        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        const isKerned = kerningMap.has(key);
        const initialValue = kerningMap.get(key) ?? suggestedKerningMap.get(key) ?? 0;
        
        const virtualName = pair.left.name + pair.right.name;
        const character: Character = allCharsByName.get(virtualName) || {
            name: virtualName,
            kern: [pair.left.name, pair.right.name],
            glyphClass: 'ligature'
        };

        return (
            <KerningEditorPage
                pair={pair} initialValue={initialValue}
                glyphDataMap={glyphDataMap} strokeThickness={settings!.strokeThickness}
                metrics={metrics!} settings={settings!} recommendedKerning={recommendedKerning}
                onSave={(val) => {
                    const newMap = new Map(kerningMap);
                    newMap.set(key, val);
                    kerningDispatch({ type: 'SET_MAP', payload: newMap });
                }}
                onRemove={() => {
                    const newMap = new Map(kerningMap);
                    newMap.delete(key);
                    kerningDispatch({ type: 'SET_MAP', payload: newMap });
                    kerningDispatch({ type: 'REMOVE_SUGGESTIONS', payload: [key] });
                }}
                onClose={() => setEditingPair(null)} onNavigate={handleNavigate}
                hasPrev={!!prevPair} hasNext={!!nextPair}
                glyphVersion={glyphVersion}
                isKerned={isKerned}
                onDelete={handleDeletePair}
                onIgnore={handleIgnorePair}
                isIgnored={filterMode === 'ignored'}
                allCharacterSets={characterSets!}
                allCharsByName={allCharsByName}
                character={character}
                showPropertiesButton={false}
                disableStructuralEditing={true}
            />
        );
    }

    return (
        <KerningSelectionView 
            filteredPairs={filteredPairs}
            onEditPair={(pair) => setEditingPair(pair)}
            selectedLeftChars={selectedLeftChars} setSelectedLeftChars={setSelectedLeftChars}
            selectedRightChars={selectedRightChars} setSelectedRightChars={setSelectedRightChars}
            mode={mode} showRecommendedLabel={showRecommendedLabel}
            hasHiddenRecommended={hasHiddenRecommended}
            kerningMap={kerningMap}
            suggestedKerningMap={suggestedKerningMap}
            onAcceptSuggestions={handleAcceptSuggestions}
            onSwitchToAllPairs={onSwitchToAllPairs}
            // Pass localized strings for empty state
            emptyStateTitle={mode === 'all' ? t('kerningGeneratePairsTitle') : undefined}
            emptyStateMessage={mode === 'all' ? t('kerningGeneratePairsBody') : undefined}
        />
    );
};

export default React.memo(KerningPage);
