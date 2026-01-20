
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { RecommendedKerning } from '../types';
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
    const allPairsInContext = useMemo(() => {
        if (!characterSets) return [];
        const groups = rulesState.fontRules?.groups || {};

        if (mode === 'recommended') {
            if (!recommendedKerning) return [];
            const pairs: { left: any, right: any }[] = [];
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
                            // FILTER: If this pair is already in the grid, skip it
                            if (standardGridNames.has(pairName)) return;

                            const key = `${lChar.unicode}-${rChar.unicode}`;
                            if (!seen.has(key)) {
                                pairs.push({ left: lChar, right: rChar });
                                seen.add(key);
                            }
                        }
                    });
                });
            });
            return pairs;
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
                                combined.push({ left: l, right: r });
                            }
                        }
                    }
                }
            }
            return combined.sort((a,b) => a.left.name.localeCompare(b.left.name) || a.right.name.localeCompare(b.right.name));
        }
    }, [mode, recommendedKerning, characterSets, rulesState.fontRules, allCharsByName, selectedLeftChars, selectedRightChars, kerningMap, allCharsByUnicode, standardGridNames]);

    // 2. Filter list by drawing status and search query
    const filteredPairs = useMemo(() => {
        let result = allPairsInContext.filter(p => isGlyphDrawn(p.left.unicode) && isGlyphDrawn(p.right.unicode));
        
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
    }, [allPairsInContext, filterMode, kerningMap, searchQuery, isGlyphDrawn]);

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

    if (editingIndex !== null) {
        const pair = filteredPairs[editingIndex];
        if (!pair) { setEditingIndex(null); return null; }
        const key = `${pair.left.unicode}-${pair.right.unicode}`;
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
                    const newMap = new Map(kerningMap);
                    newMap.delete(key);
                    kerningDispatch({ type: 'SET_MAP', payload: newMap });
                    setEditingIndex(null);
                }}
                onClose={() => setEditingIndex(null)} onNavigate={handleNavigate}
                hasPrev={editingIndex > 0} hasNext={editingIndex < filteredPairs.length - 1}
                glyphVersion={glyphVersion}
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
        />
    );
};

export default React.memo(KerningPage);
