
import {
    Character,
    GlyphData,
    Path,
    Point,
    MarkPositioningMap,
    AttachmentClass,
    CharacterSet,
    PositioningRules,
} from '../types';
import { deepClone } from '../utils/cloneUtils';
import { expandMembers } from './groupExpansionService';

interface UpdatePositioningAndCascadeArgs {
    baseChar: Character;
    markChar: Character;
    targetLigature: Character;
    newGlyphData: GlyphData;
    newOffset: Point;
    newBearings: { lsb?: number; rsb?: number };
    allChars: Map<string, Character>;
    allLigaturesByKey: Map<string, Character>;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    markPositioningMap: MarkPositioningMap;
    glyphDataMap: Map<number, GlyphData>;
    characterSets: CharacterSet[];
    positioningRules: PositioningRules[] | null;
    groups?: Record<string, string[]>;
}

interface UpdatePositioningResult {
    updatedMarkPositioningMap: MarkPositioningMap;
    updatedGlyphDataMap: Map<number, GlyphData>;
    updatedCharacterSets: CharacterSet[];
}

export const updatePositioningAndCascade = (args: UpdatePositioningAndCascadeArgs): UpdatePositioningResult => {
    const {
        baseChar, markChar, targetLigature, newGlyphData, newOffset, newBearings,
        allChars, allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses,
        markPositioningMap, glyphDataMap, characterSets, positioningRules,
        groups = {}
    } = args;

    const newMarkPositioningMap = new Map(markPositioningMap);
    const newGlyphDataMap = new Map(glyphDataMap);
    const newLigaturesToUpdate = new Map<number, Character>();

    // 1. Seed update with the manually edited pair
    const primaryKey = `${baseChar.unicode}-${markChar.unicode}`;
    newMarkPositioningMap.set(primaryKey, newOffset);
    
    // Find the rule that applies to this pair
    const relevantRule = positioningRules?.find(rule => 
        expandMembers(rule.base, groups, characterSets).includes(baseChar.name) && 
        expandMembers(rule.mark, groups, characterSets).includes(markChar.name)
    );
    
    // Only save glyph data for the ligature if a GSUB feature is specified in the rule.
    if (relevantRule && relevantRule.gsub) {
        newGlyphDataMap.set(targetLigature.unicode, newGlyphData);
        const newLigatureInfo = { ...targetLigature, ...newBearings };
        if (newBearings.lsb === undefined) delete newLigatureInfo.lsb;
        if (newBearings.rsb === undefined) delete newLigatureInfo.rsb;
        newLigaturesToUpdate.set(targetLigature.unicode, newLigatureInfo);
    }
    
    // 2. Gather all marks that should be affected by this change
    const marksToUpdate = new Set<Character>([markChar]);
    if (markAttachmentClasses) {
        // Expand members for check
        const attachmentClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(markChar.name));
        if (attachmentClass) {
            let shouldApply = true;
            if (attachmentClass.exceptions && expandMembers(attachmentClass.exceptions, groups, characterSets).includes(baseChar.name)) shouldApply = false;
            if (attachmentClass.applies && !expandMembers(attachmentClass.applies, groups, characterSets).includes(baseChar.name)) shouldApply = false;

            if (shouldApply) {
                expandMembers(attachmentClass.members, groups, characterSets).forEach(otherMarkName => {
                    // Specific Pair Exception Check
                    const pairId = `${baseChar.name}-${otherMarkName}`;
                    if (attachmentClass.exceptPairs && attachmentClass.exceptPairs.includes(pairId)) {
                        return; // Skip this mark for this specific base
                    }

                    const otherMarkChar = allChars.get(otherMarkName);
                    if (otherMarkChar) marksToUpdate.add(otherMarkChar);
                });
            }
        }
    }

    // 3. Gather all bases that should be affected by this change
    const basesToUpdate = new Set<Character>([baseChar]);
    if (baseAttachmentClasses) {
        const attachmentClass = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(baseChar.name));
        if (attachmentClass) {
            let shouldApply = true;
            if (attachmentClass.exceptions && expandMembers(attachmentClass.exceptions, groups, characterSets).includes(markChar.name)) shouldApply = false;
            if (attachmentClass.applies && !expandMembers(attachmentClass.applies, groups, characterSets).includes(markChar.name)) shouldApply = false;

            if (shouldApply) {
                expandMembers(attachmentClass.members, groups, characterSets).forEach(otherBaseName => {
                    // Specific Pair Exception Check
                    const pairId = `${otherBaseName}-${markChar.name}`;
                    if (attachmentClass.exceptPairs && attachmentClass.exceptPairs.includes(pairId)) {
                        return; // Skip this base for this specific mark
                    }

                    const otherBaseChar = allChars.get(otherBaseName);
                    if (otherBaseChar) basesToUpdate.add(otherBaseChar);
                });
            }
        }
    }

    // 4. Perform the full cascade for every combination of affected bases and marks
    basesToUpdate.forEach(currentBase => {
        marksToUpdate.forEach(currentMark => {
            // Skip the primary pair as it's already handled
            if (currentBase.unicode === baseChar.unicode && currentMark.unicode === markChar.unicode) {
                return;
            }

            const key = `${currentBase.unicode}-${currentMark.unicode}`;
            
            // Skip if already manually positioned
            if (markPositioningMap.has(key)) {
                return;
            }

            const ligature = allLigaturesByKey.get(key);
            const baseGlyph = glyphDataMap.get(currentBase.unicode);
            const markGlyph = glyphDataMap.get(currentMark.unicode);

            if (ligature && baseGlyph && markGlyph) {
                // Apply the original offset from the manual edit
                newMarkPositioningMap.set(key, newOffset);

                // Check if the cascade should also create a GSUB ligature
                const cascadeRule = positioningRules?.find(rule => 
                    expandMembers(rule.base, groups, characterSets).includes(currentBase.name) && 
                    expandMembers(rule.mark, groups, characterSets).includes(currentMark.name)
                );

                if (cascadeRule && cascadeRule.gsub) {
                    // Generate new glyph data for the auto-positioned ligature
                    const transformedMarkPaths = deepClone(markGlyph.paths).map((p: Path) => ({
                        ...p,
                        points: p.points.map((pt: Point) => ({ x: pt.x + newOffset.x, y: pt.y + newOffset.y })),
                        segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: { x: seg.point.x + newOffset.x, y: seg.point.y + newOffset.y } }))) : undefined
                    }));
                    const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
                    newGlyphDataMap.set(ligature.unicode, { paths: combinedPaths });

                    // Add ligature info for the character set update
                    newLigaturesToUpdate.set(ligature.unicode, ligature);
                }
            }
        });
    });

    // 5. Update Character Sets
    const ligatureExistsMap = new Map<number, boolean>();
    newLigaturesToUpdate.forEach(lig => ligatureExistsMap.set(lig.unicode, false));

    const updatedSets = characterSets.map(set => ({
        ...set,
        characters: set.characters.map(char => {
            if (newLigaturesToUpdate.has(char.unicode)) {
                ligatureExistsMap.set(char.unicode, true);
                const updatedLigature = newLigaturesToUpdate.get(char.unicode)!;
                const updatedChar = { ...char, ...updatedLigature };
                if (updatedChar.lsb === undefined) delete updatedChar.lsb;
                if (updatedChar.rsb === undefined) delete updatedChar.rsb;
                return updatedChar;
            }
            return char;
        })
    }));

    const DYNAMIC_LIGATURES_KEY = 'dynamicLigatures';
    let dynamicSet = updatedSets.find(s => s.nameKey === DYNAMIC_LIGATURES_KEY);
    if (!dynamicSet) {
        dynamicSet = { nameKey: DYNAMIC_LIGATURES_KEY, characters: [] };
        updatedSets.push(dynamicSet);
    }
    
    newLigaturesToUpdate.forEach((ligature, unicode) => {
        if (!ligatureExistsMap.get(unicode)) {
            if (!dynamicSet!.characters.some(c => c.unicode === ligature.unicode)) {
                const newLigatureWithBearings = { ...ligature };
                if (newLigatureWithBearings.lsb === undefined) delete newLigatureWithBearings.lsb;
                if (newLigatureWithBearings.rsb === undefined) delete newLigatureWithBearings.rsb;
                dynamicSet!.characters.push(newLigatureWithBearings);
            }
        }
    });

    return {
        updatedMarkPositioningMap: newMarkPositioningMap,
        updatedGlyphDataMap: newGlyphDataMap,
        updatedCharacterSets: updatedSets
    };
};