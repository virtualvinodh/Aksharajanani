
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
    }, [glyphDataMap, characterSets, glyphVersion]);

    const positioningProgress = useMemo(() => {
        if (!positioningRules) return { completed: 0, total: 0 };
        
        const groups = fontRules?.groups || {};
        const allRequiredPairs = new Set<string>();
        
        for (const rule of positioningRules) {
            const ruleBases = expandMembers(rule.base, groups, characterSets || []);
            const ruleMarks = expandMembers(rule.mark || [], groups, characterSets || []);
            
            for (const baseName of ruleBases) {
                for (const markName of ruleMarks) {
                    const baseChar = allCharsByName.get(baseName);
                    const markChar = allCharsByName.get(markName);
                    
                    // Only count pair if both characters exist in the font
                    if (baseChar && markChar && baseChar.unicode !== undefined && markChar.unicode !== undefined) {
                        const key = `${baseChar.unicode}-${markChar.unicode}`;
                        allRequiredPairs.add(key);
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
        if (!recommendedKerning) return { completed: 0, total: 0 };
        const totalRecommended = recommendedKerning.length;
        const kernedRecommendedCount = recommendedKerning.filter(([left, right]) => {
            const leftChar = allCharsByName.get(left);
            const rightChar = allCharsByName.get(right);
            if (!leftChar || !rightChar) return false;
            return kerningMap.has(`${leftChar.unicode}-${rightChar.unicode}`);
        }).length;
        return { completed: kernedRecommendedCount, total: totalRecommended };
    }, [kerningMap, recommendedKerning, allCharsByName]);

    const rulesProgress = useMemo(() => {
        if (!fontRules || !allCharsByName) {
            return { completed: 0, total: 0 };
        }
        const requiredGlyphNames = new Set<string>();
        const parseRuleValue = (value: any) => {
            if (typeof value === 'string') value.split(',').forEach(name => requiredGlyphNames.add(name.trim()));
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
            if (feature.liga) for (const ligName in feature.liga) { requiredGlyphNames.add(ligName); parseRuleValue(feature.liga[ligName]); }
            if (feature.single) for (const outputName in feature.single) { requiredGlyphNames.add(outputName); parseRuleValue(feature.single[outputName]); }
            if (feature.multi) for (const outputString in feature.multi) { parseRuleValue(outputString); parseRuleValue(feature.multi[outputString]); }
            if (feature.context) for (const replacementName in feature.context) { requiredGlyphNames.add(replacementName); parseContextualRule(feature.context[replacementName]); }
            if (feature.dist?.simple) for (const charName in feature.dist.simple) requiredGlyphNames.add(charName);
            if (feature.dist?.contextual) (feature.dist.contextual as any[]).forEach(rule => { if (rule.target) requiredGlyphNames.add(rule.target); if (rule.left) parseRuleValue(rule.left); if (rule.right) parseRuleValue(rule.right); });
        }
        
        const total = requiredGlyphNames.size;
        let completed = 0;
        requiredGlyphNames.forEach(name => {
            const char = allCharsByName.get(name);
            if (char && isGlyphDrawn(glyphDataMap.get(char.unicode))) completed++;
        });
        return { completed, total };
    }, [fontRules, allCharsByName, glyphDataMap, glyphVersion]);

    return {
        drawingProgress,
        positioningProgress,
        kerningProgress,
        rulesProgress,
    };
};
