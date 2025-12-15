
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

interface SyncAttachmentClassesArgs {
    markPositioningMap: MarkPositioningMap;
    glyphDataMap: Map<number, GlyphData>;
    allCharsByName: Map<string, Character>;
    allLigaturesByKey: Map<string, Character>; // "baseUni-markUni" -> LigatureChar
    markAttachmentClasses: AttachmentClass[];
    baseAttachmentClasses: AttachmentClass[];
    positioningRules: PositioningRules[];
    markAttachmentRules: MarkAttachmentRules;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    strokeThickness: number;
    metrics: any; 
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
        
        const currentPairKey = `${baseChar.name}-${markChar.name}`;

        // 2. Gather all marks that should be affected by this change
        const marksToUpdate = new Set<Character>([markChar]);
        if (markAttachmentClasses) {
            const attachmentClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(markChar.name));
            if (attachmentClass) {
                let shouldApply = true;
                
                // CRITICAL: If the current pair is an exception, do NOT propagate to others.
                if (attachmentClass.exceptPairs && attachmentClass.exceptPairs.includes(currentPairKey)) {
                    shouldApply = false;
                }

                if (attachmentClass.exceptions && expandMembers(attachmentClass.exceptions, groups, characterSets).includes(baseChar.name)) shouldApply = false;
                if (attachmentClass.applies && !expandMembers(attachmentClass.applies, groups, characterSets).includes(baseChar.name)) shouldApply = false;

                if (shouldApply) {
                    expandMembers(attachmentClass.members, groups, characterSets).forEach(otherMarkName => {
                        const pairId = `${baseChar.name}-${otherMarkName}`;
                        // Don't update other exceptions
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

                // CRITICAL: If the current pair is an exception, do NOT propagate to others.
                if (attachmentClass.exceptPairs && attachmentClass.exceptPairs.includes(currentPairKey)) {
                    shouldApply = false;
                }

                if (attachmentClass.exceptions && expandMembers(attachmentClass.exceptions, groups, characterSets).includes(markChar.name)) shouldApply = false;
                if (attachmentClass.applies && !expandMembers(attachmentClass.applies, groups, characterSets).includes(markChar.name)) shouldApply = false;

                if (shouldApply) {
                    expandMembers(attachmentClass.members, groups, characterSets).forEach(otherBaseName => {
                        const pairId = `${otherBaseName}-${markChar.name}`;
                        // Don't update other exceptions
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

/**
 * Sweeps through all defined classes and ensures all members are synchronized.
 * Uses a "first positioned member" strategy as the source of truth.
 */
export const syncAttachmentClasses = (args: SyncAttachmentClassesArgs): UpdatePositioningResult => {
    const {
        markPositioningMap, glyphDataMap, allCharsByName, allLigaturesByKey,
        markAttachmentClasses, baseAttachmentClasses,
        positioningRules, markAttachmentRules, characterSets, groups, strokeThickness
    } = args;

    const newMarkPositioningMap = new Map(markPositioningMap);
    const newGlyphDataMap = new Map(glyphDataMap);
    const newLigaturesToUpdate = new Map<number, Character>();
    
    // Quick Lookup for Char Objects by ID
    const idToChar = new Map<number, Character>();
    for (const c of allCharsByName.values()) {
        if (c.unicode !== undefined) idToChar.set(c.unicode, c);
    }

    const applySync = (classDef: AttachmentClass, type: 'mark' | 'base') => {
        const members = expandMembers(classDef.members, groups, characterSets);
        
        // Better strategy: Iterate the CLASS members first.
        const memberChars = members.map(name => allCharsByName.get(name)).filter(c => c && c.unicode !== undefined);
        const memberIds = new Set(memberChars.map(c => c!.unicode!));

        // Build the pivot map from existing positions involving ANY class member
        // Key: PivotID (Base for MarkClass, Mark for BaseClass)
        // Value: List of MemberIDs that are positioned on this Pivot
        const pivotToPositionedMembers = new Map<number, number[]>();

        for (const key of newMarkPositioningMap.keys()) {
            const [baseId, markId] = key.split('-').map(Number);
            const memberId = type === 'mark' ? markId : baseId;
            const pivotId = type === 'mark' ? baseId : markId;

            if (memberIds.has(memberId)) {
                if (!pivotToPositionedMembers.has(pivotId)) {
                    pivotToPositionedMembers.set(pivotId, []);
                }
                pivotToPositionedMembers.get(pivotId)!.push(memberId);
            }
        }

        // For each pivot that has at least one positioned member:
        pivotToPositionedMembers.forEach((positionedMemberIds, pivotId) => {
            const pivotCharObj = idToChar.get(pivotId);
            if (!pivotCharObj) return;

            // Pick Source: 
            // We must filter out members that are EXCEPTIONS (Unlinked) from being the source of truth.
            // If the only positioned member is an exception, we shouldn't sync the rest to it.
            const validSourceMemberIds = positionedMemberIds.filter(mid => {
                const memberChar = idToChar.get(mid);
                if (!memberChar) return false;
                
                const pairNameKey = type === 'mark' 
                    ? `${pivotCharObj.name}-${memberChar.name}`
                    : `${memberChar.name}-${pivotCharObj.name}`;
                    
                return !classDef.exceptPairs?.includes(pairNameKey);
            });

            if (validSourceMemberIds.length === 0) return; // No valid source to sync from

            const sourceMemberId = validSourceMemberIds[0];
            const sourceMemberChar = memberChars.find(c => c!.unicode === sourceMemberId)!;
            
            const sourceKey = type === 'mark' ? `${pivotId}-${sourceMemberId}` : `${sourceMemberId}-${pivotId}`;
            const sourceOffset = newMarkPositioningMap.get(sourceKey)!;

            const baseChar = type === 'mark' ? pivotCharObj : sourceMemberChar;
            const markChar = type === 'mark' ? sourceMemberChar : pivotCharObj;

            const baseGlyph = newGlyphDataMap.get(baseChar.unicode!);
            const markGlyph = newGlyphDataMap.get(markChar.unicode!);
            if (!baseGlyph || !markGlyph) return;

            // Calculate Target Anchor Delta from Source
             const sourceRule = resolveAttachmentRule(
                baseChar.name, 
                markChar.name, 
                markAttachmentRules, 
                characterSets, 
                groups
            );

            let sBasePt = "topCenter";
            let sMarkPt = "bottomCenter";
            let sBx = 0, sBy = 0;
            if (sourceRule) {
                sBasePt = sourceRule[0]; sMarkPt = sourceRule[1];
                if (sourceRule[2]) sBx = parseFloat(sourceRule[2]);
                if (sourceRule[3]) sBy = parseFloat(sourceRule[3]);
            }

            const srcBaseAnc = getAnchorFromRule(baseGlyph, strokeThickness, sBasePt, sBx, sBy);
            const srcMarkAnc = getAnchorFromRule(markGlyph, strokeThickness, sMarkPt);

            if (!srcBaseAnc || !srcMarkAnc) return;

            const targetAnchorDelta = VEC.sub(
                VEC.add(sourceOffset, srcMarkAnc),
                srcBaseAnc
            );

            // Propagate to ALL members of the class (positioned or not)
            // Note: We skip the source itself to avoid redundant calc
            memberChars.forEach(targetMemberChar => {
                if (!targetMemberChar || targetMemberChar.unicode === sourceMemberId) return;

                // Check exceptions
                const pairNameKey = type === 'mark' 
                    ? `${pivotCharObj!.name}-${targetMemberChar.name}`
                    : `${targetMemberChar.name}-${pivotCharObj!.name}`;
                
                if (classDef.exceptPairs && classDef.exceptPairs.includes(pairNameKey)) return;
                
                // Also check Applies/Exceptions lists on class
                if (type === 'mark') {
                    if (classDef.exceptions && expandMembers(classDef.exceptions, groups, characterSets).includes(pivotCharObj!.name)) return;
                    if (classDef.applies && !expandMembers(classDef.applies, groups, characterSets).includes(pivotCharObj!.name)) return;
                } else {
                    if (classDef.exceptions && expandMembers(classDef.exceptions, groups, characterSets).includes(pivotCharObj!.name)) return;
                    if (classDef.applies && !expandMembers(classDef.applies, groups, characterSets).includes(pivotCharObj!.name)) return;
                }


                const targetKey = type === 'mark' ? `${pivotId}-${targetMemberChar.unicode}` : `${targetMemberChar.unicode}-${pivotId}`;
                const targetLigature = allLigaturesByKey.get(targetKey);
                
                // Even if ligature doesn't exist in map (e.g. dynamic), we might need to position it if rules allow.
                // But typically we only position if user requested or if it's a known pair.
                // For sync, we update if it's in the ligatures map OR if it's already positioned.
                
                // Logic: If it exists in allLigaturesByKey, we update it.
                if (targetLigature) {
                     const tBaseChar = type === 'mark' ? pivotCharObj! : targetMemberChar;
                     const tMarkChar = type === 'mark' ? targetMemberChar : pivotCharObj!;
                     
                     const tBaseGlyph = newGlyphDataMap.get(tBaseChar.unicode!);
                     const tMarkGlyph = newGlyphDataMap.get(tMarkChar.unicode!);
                     if (!tBaseGlyph || !tMarkGlyph) return;

                     const tRule = resolveAttachmentRule(tBaseChar.name, tMarkChar.name, markAttachmentRules, characterSets, groups);
                     let tbPt = "topCenter", tmPt = "bottomCenter", tbx = 0, tby = 0;
                     if (tRule) {
                         tbPt = tRule[0]; tmPt = tRule[1];
                         if (tRule[2]) tbx = parseFloat(tRule[2]);
                         if (tRule[3]) tby = parseFloat(tRule[3]);
                     }
                     
                     const tBaseAnc = getAnchorFromRule(tBaseGlyph, strokeThickness, tbPt, tbx, tby);
                     const tMarkAnc = getAnchorFromRule(tMarkGlyph, strokeThickness, tmPt);
                     
                     if (tBaseAnc && tMarkAnc) {
                         const newTargetOffset = VEC.sub(
                            VEC.add(targetAnchorDelta, tBaseAnc),
                            tMarkAnc
                         );
                         
                         newMarkPositioningMap.set(targetKey, newTargetOffset);

                         // GSUB Check
                         const gsubRule = positioningRules.find(r => 
                            expandMembers(r.base, groups, characterSets).includes(tBaseChar.name) && 
                            expandMembers(r.mark, groups, characterSets).includes(tMarkChar.name)
                         );

                         if (gsubRule && gsubRule.gsub) {
                             const transformedMarkPaths = deepClone(tMarkGlyph.paths).map((p: Path) => ({
                                ...p,
                                points: p.points.map((pt: Point) => ({ x: pt.x + newTargetOffset.x, y: pt.y + newTargetOffset.y })),
                                segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: { x: seg.point.x + newTargetOffset.x, y: seg.point.y + newTargetOffset.y } }))) : undefined
                            }));
                            const combinedPaths = [...tBaseGlyph.paths, ...transformedMarkPaths];
                            newGlyphDataMap.set(targetLigature.unicode, { paths: combinedPaths });
                            newLigaturesToUpdate.set(targetLigature.unicode, targetLigature);
                         }
                     }
                }
            });
        });
    };

    // Run Sync for Marks
    markAttachmentClasses.forEach(cls => applySync(cls, 'mark'));
    
    // Run Sync for Bases
    baseAttachmentClasses.forEach(cls => applySync(cls, 'base'));

    // --- Update Character Sets for any new ligatures created ---
    const ligatureExistsMap = new Map<number, boolean>();
    newLigaturesToUpdate.forEach(lig => ligatureExistsMap.set(lig.unicode, false));

    const updatedSets = characterSets.map(set => ({
        ...set,
        characters: set.characters.map(char => {
            if (newLigaturesToUpdate.has(char.unicode)) {
                ligatureExistsMap.set(char.unicode, true);
                const updatedLigature = newLigaturesToUpdate.get(char.unicode)!;
                // Merge props
                return { ...char, ...updatedLigature };
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
                dynamicSet!.characters.push({ ...ligature });
            }
        }
    });

    return {
        updatedMarkPositioningMap: newMarkPositioningMap,
        updatedGlyphDataMap: newGlyphDataMap,
        updatedCharacterSets: updatedSets
    };
};
