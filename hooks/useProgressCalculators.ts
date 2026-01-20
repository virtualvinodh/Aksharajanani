import { useMemo } from 'react';
import { CharacterSet, GlyphData, KerningMap, MarkPositioningMap, RecommendedKerning, Character, PositioningRules } from '../types';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { useSettings } from '../contexts/SettingsContext';
import { expandMembers } from '../services/groupExpansionService';

interface UseProgressCalculatorsProps {
    characterSets: CharacterSet[] | null;
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    recommendedKerning: RecommendedKerning[] | null;
    allCharsByName: Map<string, Character>;
    fontRules: any;
    kerningMap: KerningMap;
    positioningRules: PositioningRules[] | null;
    glyphVersion?: number;
}

export const useProgressCalculators = ({
    characterSets,
    glyphDataMap,
    markPositioningMap,
    recommendedKerning,
    allCharsByName,
    fontRules,
    kerningMap,
    positioningRules,
    glyphVersion = 0,
}: UseProgressCalculatorsProps) => {

    const { settings } = useSettings();
    const showHidden = settings?.showHiddenGlyphs ?? false;

    const drawingProgress = useMemo(() => {
        if (!characterSets) return { completed: 0, total: 0 };
        
        const allDrawableChars = characterSets.flatMap(cs => cs.characters)
            .filter(c => c.unicode !== 8205 && c.unicode !== 8204)
             .filter(c => !c.hidden || showHidden); ;
        const totalDrawableChars = allDrawableChars.length;
        
        const drawnGlyphCount = allDrawableChars.filter(char => {
            return isGlyphDrawn(glyphDataMap.get(char.unicode));
        }).length;

        return { completed: drawnGlyphCount, total: totalDrawableChars };
    }, [glyphDataMap, characterSets, glyphVersion, showHidden]);

    const positioningProgress = useMemo(() => {
        if (!positioningRules || !characterSets) return { completed: 0, total: 0 };
        
        const groups = fontRules?.groups || {};
        const allRequiredPairs = new Set<string>();
        const drawnPairs = new Set<string>();

        // Names in the standard grid to exclude from positioning logic
        const standardNames = new Set(
            characterSets
                .filter(s => s.nameKey !== 'dynamicLigatures')
                .flatMap(s => s.characters)
                .map(c => c.name)
        );
        
        for (const rule of positioningRules) {
            const ruleBases = expandMembers(rule.base, groups, characterSets);
            const ruleMarks = expandMembers(rule.mark || [], groups, characterSets);
            
            for (const baseName of ruleBases) {
                for (const markName of ruleMarks) {
                    const baseChar = allCharsByName.get(baseName);
                    const markChar = allCharsByName.get(markName);
                    
                    // Only count pair if both characters exist in the font
                    if (baseChar && markChar && baseChar.unicode !== undefined && markChar.unicode !== undefined) {
                        // EXCLUSION LOGIC: Calculate target name and check grid
                        const ligName = rule.ligatureMap?.[baseName]?.[markName] || (baseName + markName);
                        
                        if (!standardNames.has(ligName)) {
                            const key = `${baseChar.unicode}-${markChar.unicode}`;
                            allRequiredPairs.add(key);
                            
                            // REVERT: Only count as "Drawn" (Eligible for progress total) if components are drawn
                            if (isGlyphDrawn(glyphDataMap.get(baseChar.unicode)) && isGlyphDrawn(glyphDataMap.get(markChar.unicode))) {
                                drawnPairs.add(key);
                            }
                        }
                    }
                }
            }
        }
        
        let completedCount = 0;
        drawnPairs.forEach(key => {
            if (markPositioningMap.has(key)) {
                completedCount++;
            }
        });
        
        return { completed: completedCount, total: drawnPairs.size };
    }, [markPositioningMap, positioningRules, fontRules, characterSets, allCharsByName, glyphDataMap, glyphVersion]);

    const kerningProgress = useMemo(() => {
        if (!recommendedKerning || !characterSets) return { completed: 0, total: 0 };
        
        const groups = fontRules?.groups || {};
        const allRecommendedPairs = new Set<string>();
        const drawnPairs = new Set<string>();

        // Names in the standard grid to exclude
        const standardNames = new Set(
            characterSets
                .filter(s => s.nameKey !== 'dynamicLigatures')
                .flatMap(s => s.characters)
                .map(c => c.name)
        );

        for (const [leftRule, rightRule] of recommendedKerning) {
            const lefts = expandMembers([leftRule], groups, characterSets);
            const rights = expandMembers([rightRule], groups, characterSets);

            for (const leftName of lefts) {
                for (const rightName of rights) {
                    const leftChar = allCharsByName.get(leftName);
                    const rightChar = allCharsByName.get(rightName);
                    
                    if (leftChar && rightChar && leftChar.unicode !== undefined && rightChar.unicode !== undefined) {
                        // REDUNDANCY CHECK: left.name + right.name
                        if (!standardNames.has(leftChar.name + rightChar.name)) {
                            const key = `${leftChar.unicode}-${rightChar.unicode}`;
                            allRecommendedPairs.add(key);

                            // REVERT: Only count as "Drawn" (Eligible for progress total) if components are drawn
                            if (isGlyphDrawn(glyphDataMap.get(leftChar.unicode)) && isGlyphDrawn(glyphDataMap.get(rightChar.unicode))) {
                                drawnPairs.add(key);
                            }
                        }
                    }
                }
            }
        }

        let completedCount = 0;
        drawnPairs.forEach(key => {
            if (kerningMap.has(key)) {
                completedCount++;
            }
        });

        return { completed: completedCount, total: drawnPairs.size };
    }, [kerningMap, recommendedKerning, allCharsByName, fontRules, characterSets, glyphDataMap, glyphVersion]);

    const rulesProgress = useMemo(() => {
        if (!fontRules || !characterSets) return { completed: 0, total: 0 };
        
        const scriptTag = Object.keys(fontRules).find(key => key !== 'groups' && key !== 'lookups');
        if (!scriptTag) return { completed: 0, total: 0 };

        const allReferencedNames = new Set<string>();
        const groups = fontRules.groups || {};

        const collect = (obj: any) => {
            if (!obj) return;
            ['liga', 'context', 'single', 'multiple', 'dist'].forEach(type => {
                const block = obj[type];
                if (block) {
                    Object.entries(block).forEach(([key, val]) => {
                        // Exclude group-to-group rules from "glyph drawing" progress
                        if (!key.startsWith('$') && !key.startsWith('@')) allReferencedNames.add(key);
                        
                        if (Array.isArray(val)) {
                            val.forEach((v: any) => {
                                if (typeof v === 'string' && !v.startsWith('$') && !v.startsWith('@')) {
                                    allReferencedNames.add(v);
                                }
                            });
                        } else if (typeof val === 'object' && val !== null) {
                            ['replace', 'left', 'right'].forEach(field => {
                                if (Array.isArray((val as any)[field])) {
                                    (val as any)[field].forEach((v: string) => {
                                        if (!v.startsWith('$') && !v.startsWith('@')) allReferencedNames.add(v);
                                    });
                                }
                            });
                        }
                    });
                }
            });
        };

        const scriptData = fontRules[scriptTag];
        if (scriptData) Object.values(scriptData).forEach(collect);
        if (fontRules.lookups) Object.values(fontRules.lookups).forEach(collect);

        const names = Array.from(allReferencedNames);
        const total = names.length;
        if (total === 0) return { completed: 0, total: 0 };

        const completed = names.filter(name => {
            const char = allCharsByName.get(name);
            return char && char.unicode !== undefined && isGlyphDrawn(glyphDataMap.get(char.unicode));
        }).length;

        return { completed, total };
    }, [fontRules, characterSets, allCharsByName, glyphDataMap, glyphVersion]);

    return {
        drawingProgress,
        positioningProgress,
        kerningProgress,
        rulesProgress,
    };
};