
import { generateCompositeGlyphData } from '../services/glyphRenderService';
import { Character, GlyphData, CharacterSet, AppSettings, FontMetrics, MarkAttachmentRules } from '../types';

self.onmessage = (event: MessageEvent) => {
    const { 
        unicode, newGlyphData, dependencyMapData, glyphDataMapData, 
        allCharsByUnicodeData, allCharsByNameData, settings, metrics, 
        markAttachmentRules, characterSets, groups 
    } = event.data;

    try {
        const dependencyMap = new Map<number, Set<number>>(dependencyMapData.map(([key, val]: [number, number[]]) => [key, new Set(val)]));
        const glyphDataMap = new Map<number, GlyphData>(glyphDataMapData);
        const allCharsByUnicode = new Map<number, Character>(allCharsByUnicodeData);
        const allCharsByName = new Map<string, Character>(allCharsByNameData);
        
        const updates = new Map<number, GlyphData>();
        const calculationSourceMap = new Map(glyphDataMap);
        calculationSourceMap.set(unicode, newGlyphData);

        const queue: number[] = [unicode];
        const visited = new Set<number>([unicode]);

        while (queue.length > 0) {
            const currentSourceUnicode = queue.shift()!;
            const currentDependents = dependencyMap.get(currentSourceUnicode);

            if (!currentDependents) continue;

            for (const depUnicode of currentDependents) {
                if (visited.has(depUnicode)) continue;

                const dependentChar = allCharsByUnicode.get(depUnicode);
                if (!dependentChar || (!dependentChar.link && !dependentChar.position && !dependentChar.kern)) continue;
    
                const isLink = !!dependentChar.link;
                const isPosition = !!dependentChar.position;
                const isGpos = !!dependentChar.gpos;
                const shouldBake = isLink || (isPosition && !isGpos);

                const regenerated = generateCompositeGlyphData({ 
                    character: dependentChar, 
                    allCharsByName, 
                    allGlyphData: calculationSourceMap, 
                    settings, 
                    metrics, 
                    markAttachmentRules, 
                    allCharacterSets: characterSets,
                    groups
                });
                
                if (regenerated) {
                    if (shouldBake) updates.set(depUnicode, regenerated);
                    calculationSourceMap.set(depUnicode, regenerated);
                    visited.add(depUnicode);
                    queue.push(depUnicode);
                }
            }
        }

        self.postMessage({ 
            type: 'complete', 
            payload: Array.from(updates.entries()) 
        });
    } catch (error) {
        console.error('Error in cascade worker:', error);
        self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Unknown worker error' });
    }
};
