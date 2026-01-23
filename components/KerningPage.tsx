
import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  editorMode: 'simple' | 'advanced';
  mode: 'recommended' | 'all';
  showRecommendedLabel: boolean;
}

const KerningPage: React.FC<KerningPageProps> = ({ recommendedKerning, editorMode, mode, showRecommendedLabel }) => {
    const { t } = useLocale();
    const { pendingNavigationTarget, setPendingNavigationTarget, filterMode, searchQuery } = useLayout();
    const { characterSets, allCharsByName, allCharsByUnicode } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { settings, metrics } = useSettings();
    const { state: rulesState } = useRules();
    
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
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

        if (mode === 'recommended') {
            if (!recommendedKerning) return { allPairsInContext: [], hasHiddenRecommended: false };
            let pairs: { left: any, right: any }[] = [];
            const seen = new Set<string>();
            
            recommendedKerning.forEach(([leftRule, rightRule]) => {
                const lefts = expandMembers([leftRule], groups, characterSets);
                const rights = expandMembers([rightRule], groups, characterSets);
                
                lefts.forEach(lName => {
                    rights.forEach(rName => {
                        const lChar = allCharsByName.get(lName);
                        const rChar = allCharsByName.get(rName);
                        if (lChar?.unicode !== undefined && rChar?.unicode !== undefined) {
                            const pairName = lChar.name + rChar.name;
                            // FILTER: Redundancy check
                            if (standardGridNames.has(pairName)) return;

                            // Only include drawn pairs in recommended list
                            if (isGlyphDrawn(lChar.unicode) && isGlyphDrawn(rChar.unicode)) {
                                const key = `${lChar.unicode}-${rChar.unicode}`;
                                if (!seen.has(key)) {
                                    pairs.push({ left: lChar, right: rChar });
                                    seen.add(key);
                                }
                            } else {
                                // One or both of the components in a valid recommended rule are undrawn
                                hasHidden = true;
                            }
                        }
                    });
                });
            });

            // FILTER: If side panels have selections, filter the recommended list
            if (selectedLeftChars.size > 0) {
                pairs = pairs.filter(p => selectedLeftChars.has(p.left.unicode));
            }
            if (selectedRightChars.size > 0) {
                pairs = pairs.filter(p => selectedRightChars.has(p.right.unicode));
            }

            return { allPairsInContext: pairs, hasHiddenRecommended: hasHidden };
        } else {
            const combined: { left: any, right: any }[] = [];
            if (selectedLeftChars.size === 0 && selectedRightChars.size === 0) {
                // Review Mode: Show everything currently in the map
                kerningMap.forEach((_, key) => {
                    const [lId, rId] = key.split('-').map(Number);
                    const l = allCharsByUnicode.get(lId);
                    const r = allCharsByUnicode.get(rId);
                    if (l && r) {
                         const pairName = l.name + r.name;
                         if (!standardGridNames.has(pairName)) {
                            combined.push({ left: l, right: r });
                         }
                    }
                });
            } else if (selectedLeftChars.size > 0 && selectedRightChars.size > 0) {
                // Generator Mode: Cross product
                for (const lId of selectedLeftChars) {
                    for (const rId of selectedRightChars) {
                        const l = allCharsByUnicode.get(lId);
                        const r = allCharsByUnicode.get(rId);
                        if (l && r) {
                            const pairName = l.name + r.name;
                            if (!standardGridNames.has(pairName)) {
                                // Only include drawn pairs in generated list
                                if (isGlyphDrawn(l.unicode) && isGlyphDrawn(r.unicode)) {
                                    combined.push({ left: l, right: r });
                                }
                            }
                        }
                    }
                }
            }
            const sorted = combined.sort((a,b) => a.left.name.localeCompare(b.left.name) || a.right.name.localeCompare(b.right.name));
            return { allPairsInContext: sorted, hasHiddenRecommended: false };
        }
    }, [mode, recommendedKerning, characterSets, rulesState.fontRules, allCharsByName, selectedLeftChars, selectedRightChars, kerningMap, allCharsByUnicode, standardGridNames, isGlyphDrawn]);

    // 2. Filter list by search query and saved status
    const filteredPairs = useMemo(() => {
        let result = [...allPairsInContext];
        
        if (filterMode === 'completed') {
            result = result.filter(p => kerningMap.has(`${p.left.unicode}-${p.right.unicode}`));
        } else if (filterMode === 'incomplete') {
            result = result.filter(p => !kerningMap.has(`${p.left.unicode}-${p.right.unicode}`));
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
    }, [allPairsInContext, filterMode, kerningMap, searchQuery]);

    // Deep Link Handler
    useEffect(() => {
        if (pendingNavigationTarget) {
            const index = filteredPairs.findIndex(p => `${p.left.unicode}-${p.right.unicode}` === pendingNavigationTarget);
            if (index !== -1) {
                setEditingIndex(index);
                setPendingNavigationTarget(null);
            }
        }
    }, [pendingNavigationTarget, filteredPairs, setPendingNavigationTarget]);

    const handleNavigate = (direction: 'prev' | 'next') => {
        if (editingIndex === null) return;
        if (direction === 'prev' && editingIndex > 0) setEditingIndex(editingIndex - 1);
        if (direction === 'next' && editingIndex < filteredPairs.length - 1) setEditingIndex(editingIndex + 1);
    };

    // FIX: Add onDelete handler and pass it down with other required props.
    const handleDeletePair = useCallback(() => {
        if (editingIndex === null) return;
        const pair = filteredPairs[editingIndex];
        if (!pair) return;

        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        const newMap = new Map(kerningMap);
        newMap.delete(key);
        kerningDispatch({ type: 'SET_MAP', payload: newMap });
        setEditingIndex(null); // Close editor after delete
    }, [editingIndex, filteredPairs, kerningMap, kerningDispatch]);

    if (editingIndex !== null) {
        const pair = filteredPairs[editingIndex];
        if (!pair) { setEditingIndex(null); return null; }
        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        const isKerned = kerningMap.has(key);
        
        // Construct a virtual character for the pair to satisfy the editor's requirement
        const virtualName = pair.left.name + pair.right.name;
        const character: Character = allCharsByName.get(virtualName) || {
            name: virtualName,
            kern: [pair.left.name, pair.right.name],
            glyphClass: 'ligature'
        };

        return (
            <KerningEditorPage
                pair={pair} initialValue={kerningMap.get(key) ?? 0}
                glyphDataMap={glyphDataMap} strokeThickness={settings!.strokeThickness}
                metrics={metrics!} settings={settings!} recommendedKerning={recommendedKerning}
                onSave={(val) => {
                    const newMap = new Map(kerningMap);
                    newMap.set(key, val);
                    kerningDispatch({ type: 'SET_MAP', payload: newMap });
                }}
                onRemove={() => {
                    // This function is for the 'Reset' button. It sets the value to 0.
                    const newMap = new Map(kerningMap);
                    newMap.set(key, 0);
                    kerningDispatch({ type: 'SET_MAP', payload: newMap });
                    // By not calling setEditingIndex(null), the modal stays open.
                    // The editor will re-render with the new value from the context.
                }}
                onClose={() => setEditingIndex(null)} onNavigate={handleNavigate}
                hasPrev={editingIndex > 0} hasNext={editingIndex < filteredPairs.length - 1}
                glyphVersion={glyphVersion}
                isKerned={isKerned}
                onDelete={handleDeletePair}
                allCharacterSets={characterSets!}
                allCharsByName={allCharsByName}
                character={character}
                showPropertiesButton={false} // HIDE properties button in Kerning Workspace
            />
        );
    }

    return (
        <KerningSelectionView 
            filteredPairs={filteredPairs}
            onEditPair={(pair) => setEditingIndex(filteredPairs.indexOf(pair))}
            selectedLeftChars={selectedLeftChars} setSelectedLeftChars={setSelectedLeftChars}
            selectedRightChars={selectedRightChars} setSelectedRightChars={setSelectedRightChars}
            mode={mode} showRecommendedLabel={showRecommendedLabel}
            hasHiddenRecommended={hasHiddenRecommended}
        />
    );
};

export default React.memo(KerningPage);
