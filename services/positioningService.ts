
import {
    Character,
    GlyphData,
    Path,
    Point,
    MarkPositioningMap,
    AttachmentClass,
    CharacterSet,
    PositioningRules,
    AttachmentPoint,
    MarkAttachmentRules
} from '../types';
import { deepClone } from '../utils/cloneUtils';
import { expandMembers } from './groupExpansionService';
import { getAccurateGlyphBBox, getAttachmentPointCoords, resolveAttachmentRule } from './glyphRenderService';
import { VEC } from '../utils/vectorUtils';

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
    markAttachmentRules?: MarkAttachmentRules | null;
    groups?: Record<string, string[]>;
    strokeThickness: number; // Added for accurate calculation
}

interface UpdatePositioningResult {
    updatedMarkPositioningMap: MarkPositioningMap;
    updatedGlyphDataMap: Map<number, GlyphData>;
    updatedCharacterSets: CharacterSet[];
}

// Internal helper to get anchor point based on rule definition
const getAnchorFromRule = (
    glyphData: GlyphData, 
    strokeThickness: number, 
    pointName: string, 
    offsetX: number = 0, 
    offsetY: number = 0
) => {
    const bbox = getAccurateGlyphBBox(glyphData, strokeThickness);
    if (!bbox) return null;
    let p = getAttachmentPointCoords(bbox, pointName as AttachmentPoint);
    return { x: p.x + offsetX, y: p.y + offsetY };
}


export const updatePositioningAndCascade = (args: UpdatePositioningAndCascadeArgs): UpdatePositioningResult => {
    const {
        baseChar, markChar, targetLigature, newGlyphData, newOffset, newBearings,
        allChars, allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses,
        markPositioningMap, glyphDataMap, characterSets, positioningRules,
        markAttachmentRules,
        groups = {},
        strokeThickness
    } = args;

    const newMarkPositioningMap = new Map(markPositioningMap);
    const newGlyphDataMap = new Map(glyphDataMap);
    const newLigaturesToUpdate = new Map<number, Character>();

    // 1. Seed update with the manually edited pair
    const primaryKey = `${baseChar.unicode}-${markChar.unicode}`;
    newMarkPositioningMap.set(primaryKey, newOffset);
    
    // Find the rule that applies to this pair (for GSUB generation)
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
    
    // --- ANCHOR CALCULATION FOR PROPAGATION ---
    
    const baseGlyphOriginal = glyphDataMap.get(baseChar.unicode);
    const markGlyphOriginal = glyphDataMap.get(markChar.unicode);
    
    // Safety check for propagation data
    if (!baseGlyphOriginal || !markGlyphOriginal) {
         return { updatedMarkPositioningMap: newMarkPositioningMap, updatedGlyphDataMap: newGlyphDataMap, updatedCharacterSets: characterSets };
    }

    // A. Resolve Rule for Source Pair (handling Groups)
    const sourceRule = resolveAttachmentRule(
        baseChar.name, 
        markChar.name, 
        markAttachmentRules || null, 
        characterSets, 
        groups
    );

    // B. Determine Anchors
    // Default: Base TopCenter, Mark BottomCenter
    let sourceBaseAnchorPoint = "topCenter";
    let sourceMarkAnchorPoint = "bottomCenter";
    let baseOffsetX = 0;
    let baseOffsetY = 0;

    if (sourceRule) {
        sourceBaseAnchorPoint = sourceRule[0];
        sourceMarkAnchorPoint = sourceRule[1];
        if (sourceRule[2]) baseOffsetX = parseFloat(sourceRule[2]);
        if (sourceRule[3]) baseOffsetY = parseFloat(sourceRule[3]);
    }

    const sourceBaseAnchorRelative = getAnchorFromRule(baseGlyphOriginal, strokeThickness, sourceBaseAnchorPoint, baseOffsetX, baseOffsetY);
    const sourceMarkAnchorRelative = getAnchorFromRule(markGlyphOriginal, strokeThickness, sourceMarkAnchorPoint);
    
    if (sourceBaseAnchorRelative && sourceMarkAnchorRelative) {
        // C. Calculate the "Effective Joint" (Target Visual Delta)
        // TargetAnchorDelta = AnchorWorld(Mark) - AnchorWorld(Base)
        //                   = (Offset + AnchorRel(Mark)) - AnchorRel(Base)
        
        const targetAnchorDelta = VEC.sub(
            VEC.add(newOffset, sourceMarkAnchorRelative),
            sourceBaseAnchorRelative
        );
        
        // 2. Gather all marks that should be affected by this change
        const marksToUpdate = new Set<Character>([markChar]);
        if (markAttachmentClasses) {
            const attachmentClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(markChar.name));
            if (attachmentClass) {
                let shouldApply = true;
                if (attachmentClass.exceptions && expandMembers(attachmentClass.exceptions, groups, characterSets).includes(baseChar.name)) shouldApply = false;
                if (attachmentClass.applies && !expandMembers(attachmentClass.applies, groups, characterSets).includes(baseChar.name)) shouldApply = false;

                if (shouldApply) {
                    expandMembers(attachmentClass.members, groups, characterSets).forEach(otherMarkName => {
                        const pairId = `${baseChar.name}-${otherMarkName}`;
                        if (attachmentClass.exceptPairs && attachmentClass.exceptPairs.includes(pairId)) return;
                        const otherMarkChar = allChars.get(otherMarkName);
                        if (otherMarkChar) marksToUpdate.add(otherMarkChar);
                    });
                }
            }
        }

        // 3. Gather all bases that should be affected
        const basesToUpdate = new Set<Character>([baseChar]);
        if (baseAttachmentClasses) {
            const attachmentClass = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(baseChar.name));
            if (attachmentClass) {
                let shouldApply = true;
                if (attachmentClass.exceptions && expandMembers(attachmentClass.exceptions, groups, characterSets).includes(markChar.name)) shouldApply = false;
                if (attachmentClass.applies && !expandMembers(attachmentClass.applies, groups, characterSets).includes(markChar.name)) shouldApply = false;

                if (shouldApply) {
                    expandMembers(attachmentClass.members, groups, characterSets).forEach(otherBaseName => {
                        const pairId = `${otherBaseName}-${markChar.name}`;
                        if (attachmentClass.exceptPairs && attachmentClass.exceptPairs.includes(pairId)) return;
                        const otherBaseChar = allChars.get(otherBaseName);
                        if (otherBaseChar) basesToUpdate.add(otherBaseChar);
                    });
                }
            }
        }

        // 4. Perform Cascade with Anchor Math
        basesToUpdate.forEach(currentBase => {
            marksToUpdate.forEach(currentMark => {
                if (currentBase.unicode === baseChar.unicode && currentMark.unicode === markChar.unicode) return;

                const key = `${currentBase.unicode}-${currentMark.unicode}`;
                if (markPositioningMap.has(key)) return; // Skip manual overrides

                const currentBaseGlyph = glyphDataMap.get(currentBase.unicode);
                const currentMarkGlyph = glyphDataMap.get(currentMark.unicode);

                if (!currentBaseGlyph || !currentMarkGlyph) return;

                // Resolve Rule for this specific sibling pair (handling groups!)
                const siblingRule = resolveAttachmentRule(
                    currentBase.name, 
                    currentMark.name, 
                    markAttachmentRules || null, 
                    characterSets, 
                    groups
                );

                let siblingBasePoint = "topCenter";
                let siblingMarkPoint = "bottomCenter";
                let sBaseOffX = 0;
                let sBaseOffY = 0;

                if (siblingRule) {
                    siblingBasePoint = siblingRule[0];
                    siblingMarkPoint = siblingRule[1];
                    if (siblingRule[2]) sBaseOffX = parseFloat(siblingRule[2]);
                    if (siblingRule[3]) sBaseOffY = parseFloat(siblingRule[3]);
                }

                // Calculate Anchors for Sibling using correct stroke thickness
                const currentBaseAnchor = getAnchorFromRule(currentBaseGlyph, strokeThickness, siblingBasePoint, sBaseOffX, sBaseOffY);
                const currentMarkAnchor = getAnchorFromRule(currentMarkGlyph, strokeThickness, siblingMarkPoint);
                
                if (!currentBaseAnchor || !currentMarkAnchor) return;

                // Calculate Sibling Offset
                // SiblingOffset = targetAnchorDelta + SiblingBaseAnchor - SiblingMarkAnchor
                const siblingOffset = VEC.sub(
                    VEC.add(targetAnchorDelta, currentBaseAnchor),
                    currentMarkAnchor
                );

                const ligature = allLigaturesByKey.get(key);
                if (ligature) {
                    newMarkPositioningMap.set(key, siblingOffset);

                    const cascadeRule = positioningRules?.find(rule => 
                        expandMembers(rule.base, groups, characterSets).includes(currentBase.name) && 
                        expandMembers(rule.mark, groups, characterSets).includes(currentMark.name)
                    );

                    if (cascadeRule && cascadeRule.gsub) {
                        const transformedMarkPaths = deepClone(currentMarkGlyph.paths).map((p: Path) => ({
                            ...p,
                            points: p.points.map((pt: Point) => ({ x: pt.x + siblingOffset.x, y: pt.y + siblingOffset.y })),
                            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: { x: seg.point.x + siblingOffset.x, y: seg.point.y + siblingOffset.y } }))) : undefined
                        }));
                        const combinedPaths = [...currentBaseGlyph.paths, ...transformedMarkPaths];
                        newGlyphDataMap.set(ligature.unicode, { paths: combinedPaths });
                        newLigaturesToUpdate.set(ligature.unicode, ligature);
                    }
                }
            });
        });

    }

    // 5. Update Character Sets (Same as before)
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
