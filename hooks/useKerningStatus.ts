
import { useMemo } from 'react';
import { GlyphData, Character, RecommendedKerning } from '../types';
import { isGlyphDrawn } from '../utils/glyphUtils';

interface UseKerningStatusProps {
    recommendedKerning: RecommendedKerning[] | null;
    allCharsByName: Map<string, Character>;
    glyphDataMap: Map<number, GlyphData>;
    glyphVersion: number;
    drawingProgress: { completed: number };
}

export const useKerningStatus = ({
    recommendedKerning,
    allCharsByName,
    glyphDataMap,
    glyphVersion,
    drawingProgress
}: UseKerningStatusProps): boolean => {
    return useMemo(() => {
        // Condition 1: Script has recommended pairs.
        if (recommendedKerning && recommendedKerning.length > 0) {
            // Use .some() for an efficient check. It stops as soon as it finds one valid pair.
            return recommendedKerning.some(pair => {
                const [leftName, rightName] = pair;
                
                const leftChar = allCharsByName.get(leftName);
                const rightChar = allCharsByName.get(rightName);
                
                // Ensure both characters exist in the font definition
                if (!leftChar || !rightChar || leftChar.unicode === undefined || rightChar.unicode === undefined) {
                    return false;
                }
                
                // Check if BOTH glyphs in the pair have been drawn.
                return isGlyphDrawn(glyphDataMap.get(leftChar.unicode)) && isGlyphDrawn(glyphDataMap.get(rightChar.unicode));
            });
        } 
        
        // Condition 2: Fallback for scripts with no recommendations.
        else {
            return drawingProgress.completed >= 2;
        }
    }, [recommendedKerning, drawingProgress.completed, allCharsByName, glyphDataMap, glyphVersion]);
};
