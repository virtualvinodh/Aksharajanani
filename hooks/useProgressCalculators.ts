
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
                        // Fallback naming logic matches positioningData in usePositioningData
                        const ligName = rule.ligatureMap?.[baseName]?.[markName] || (baseName + markName);
                        
                        if (!standardNames.has(ligName)) {
                            const key = `${baseChar.unicode}-${markChar.unicode}`;
                            allRequiredPairs.add(key);
                        }
                    }
                }
            }
        }
        
        let completedCount = 0;
        allRequiredPairs.forEach(key => {
            if (markPositioningMap.has(key)) {
                completedCount++;
            }
        });
        
        return { completed: completedCount, total: allRequiredPairs.size };
    }, [markPositioningMap, positioningRules, fontRules, characterSets, allCharsByName]);

    const kerningProgress = useMemo(() => {
        if (!recommendedKerning || !characterSets) return { completed: 0, total: 0 };
        
        const groups = fontRules?.groups || {};
        const allRecommendedPairs = new Set<string>();

        for (const [leftRule, rightRule] of recommendedKerning) {
            const lefts = expandMembers([leftRule], groups, characterSets);
            const rights = expandMembers([rightRule], groups, characterSets);

            for (const leftName of lefts) {
                for (const rightName of rights) {
                    const leftChar = allCharsByName.get(leftName);
                    const rightChar = allCharsByName.get(rightName);
                    
                    if (leftChar && rightChar && leftChar.unicode !== undefined && rightChar.unicode !== undefined) {
                        // Only count if characters are actually drawn/valid, 
                        // matching the logic that we only show pairs for drawn glyphs.
                        if (isGlyphDrawn(glyphDataMap.get(leftChar.unicode)) && isGlyphDrawn(glyphDataMap.get(rightChar.unicode))) {
                            allRecommendedPairs.add(`${leftChar.unicode}-${rightChar.unicode}`);
                        }
                    }
                }
            }
        }

        let completedCount = 0;
        allRecommendedPairs.forEach(key => {
            if (kerningMap.has(key)) {
                completedCount++;
            }
        });

        return { completed: completedCount, total: allRecommendedPairs.size };
    }, [kerningMap, recommendedKerning, allCharsByName, fontRules, characterSets, glyphDataMap, glyphVersion]);

    const rulesProgress = useMemo(() => {
        if (!fontRules || !allCharsByName) {
            return { completed: 0, total: 0 };
        }
        
        const groups = fontRules.groups || {};
        const requiredRawNames = new Set<string>();
        
        const parseRuleValue = (value: any) => {
            if (typeof value === 'string') value.split(',').forEach(name => requiredRawNames.add(name.trim()));
            else if (Array.isArray(value)) value.forEach(parseRuleValue);
        };
        const parseContextualRule = (ruleValue: any) => {
            if (ruleValue.replace) parseRuleValue(ruleValue.replace);
            if (ruleValue.left) parseRuleValue(ruleValue.left);
            if (ruleValue.right) parseRuleValue(ruleValue.right);
        };
        const scriptTag = Object.keys(fontRules).find(key => key !== 'groups');
        if (!scriptTag) return { completed: 0, total: 0 };
        const scriptRules = fontRules[scriptTag];
        for (const featureTag in scriptRules) {
            const feature = scriptRules[featureTag];
            if (feature.liga) for (const ligName in feature.liga) { requiredRawNames.add(ligName); parseRuleValue(feature.liga[ligName]); }
            if (feature.single) for (const outputName in feature.single) { requiredRawNames.add(outputName); parseRuleValue(feature.single[outputName]); }
            if (feature.multi) for (const outputString in feature.multi) { parseRuleValue(outputString); parseRuleValue(feature.multi[outputString]); }
            if (feature.context) for (const replacementName in feature.context) { requiredRawNames.add(replacementName); parseContextualRule(feature.context[replacementName]); }
            if (feature.dist?.simple) for (const charName in feature.dist.simple) requiredRawNames.add(charName);
            if (feature.dist?.contextual) (feature.dist.contextual as any[]).forEach(rule => { if (rule.target) requiredRawNames.add(rule.target); if (rule.left) parseRuleValue(rule.left); if (rule.right) parseRuleValue(rule.right); });
        }
        
        // Expand any groups found in the rules
        const expandedGlyphNames = expandMembers(Array.from(requiredRawNames), groups, characterSets || []);
        
        const total = expandedGlyphNames.length;
        let completed = 0;
        
        expandedGlyphNames.forEach(name => {
            const char = allCharsByName.get(name);
            if (char && isGlyphDrawn(glyphDataMap.get(char.unicode))) completed++;
        });
        
        return { completed, total };
    }, [fontRules, allCharsByName, glyphDataMap, glyphVersion, characterSets]);

    return {
        drawingProgress,
        positioningProgress,
        kerningProgress,
        rulesProgress,
    };
};
