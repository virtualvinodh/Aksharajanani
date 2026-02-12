
import {
    Character,
    GlyphData,
    Path,
    Point,
    MarkPositioningMap,
    AttachmentClass,
    CharacterSet,
    PositioningRules,
    MarkAttachmentRules,
    FontMetrics
} from '../types';
import { deepClone } from '../utils/cloneUtils';
import { expandMembers } from './groupExpansionService';
import { getAccurateGlyphBBox, calculateDefaultMarkOffset } from './glyphRenderService';
import { VEC } from '../utils/vectorUtils';

interface UpdatePositioningAndCascadeArgs {
    baseChar: Character;
    markChar: Character;
    targetLigature: Character;
    newGlyphData: GlyphData;
    newOffset: Point;
    newBearings: { 
        lsb?: number; 
        rsb?: number; 
        glyphClass?: Character['glyphClass']; 
        advWidth?: number | string;
        gsub?: string;
        gpos?: string;
        liga?: string[];
        link?: string[];
        composite?: string[];
        position?: [string, string];
        kern?: [string, string];
    };
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
    strokeThickness: number;
    metrics: FontMetrics;
    isManual?: boolean;
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
        markAttachmentRules,
        groups = {},
        strokeThickness,
        metrics,
        isManual = false
    } = args;

    const newMarkPositioningMap = new Map(markPositioningMap);
    const newGlyphDataMap = new Map(glyphDataMap);
    const newLigaturesToUpdate = new Map<number, Character>();

    // 1. Update the manual leader
    const primaryKey = `${baseChar.unicode}-${markChar.unicode}`;
    newMarkPositioningMap.set(primaryKey, newOffset);
    
    const leaderRule = positioningRules?.find(rule => 
        expandMembers(rule.base, groups, characterSets).includes(baseChar.name) && 
        expandMembers(rule.mark || [], groups, characterSets).includes(markChar.name)
    );
    const leaderConstraint = (leaderRule?.movement === 'horizontal' || leaderRule?.movement === 'vertical') ? leaderRule.movement : 'none';
    
    // Update baked glyph if GSUB is requested
    if (leaderRule && leaderRule.gsub) {
        newGlyphDataMap.set(targetLigature.unicode, newGlyphData);
    }

    // Prepare the metadata update for the target ligature
    const newLigatureInfo = { ...targetLigature, ...newBearings };
    
    // Cleanup undefined to avoid literal "undefined" strings in JSON
    if (newBearings.lsb === undefined) delete (newLigatureInfo as any).lsb;
    if (newBearings.rsb === undefined) delete (newLigatureInfo as any).rsb;
    if (newBearings.glyphClass === undefined) delete (newLigatureInfo as any).glyphClass;
    if (newBearings.advWidth === undefined) delete (newLigatureInfo as any).advWidth;
    if (newBearings.gsub === undefined) delete (newLigatureInfo as any).gsub;
    if (newBearings.gpos === undefined) delete (newLigatureInfo as any).gpos;
    if (newBearings.liga === undefined) delete (newLigatureInfo as any).liga;
    
    newLigaturesToUpdate.set(targetLigature.unicode, newLigatureInfo);

    // 2. Propagation Logic
    const baseGlyphOriginal = glyphDataMap.get(baseChar.unicode);
    const markGlyphOriginal = glyphDataMap.get(markChar.unicode);
    
    if (baseGlyphOriginal && markGlyphOriginal) {
        const baseBbox = getAccurateGlyphBBox(baseGlyphOriginal.paths, strokeThickness);
        const markBbox = getAccurateGlyphBBox(markGlyphOriginal.paths, strokeThickness);
        
        const leaderDefaultOffset = calculateDefaultMarkOffset(
            baseChar, markChar, baseBbox, markBbox, 
            markAttachmentRules || null, metrics, 
            characterSets, false, groups, leaderConstraint
        );

        const userDelta = VEC.sub(newOffset, leaderDefaultOffset);
        const currentPairKey = `${baseChar.name}-${markChar.name}`;

        // Find relevant classes
        const marksToUpdate = new Set<Character>([markChar]);
        if (markAttachmentClasses) {
            const mCls = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(markChar.name));
            if (mCls && !(mCls.exceptPairs && mCls.exceptPairs.includes(currentPairKey))) {
                const appliesToBase = (!mCls.exceptions || !expandMembers(mCls.exceptions, groups, characterSets).includes(baseChar.name)) &&
                                       (!mCls.applies || mCls.applies.length === 0 || expandMembers(mCls.applies, groups, characterSets).includes(baseChar.name));
                if (appliesToBase) {
                    expandMembers(mCls.members, groups, characterSets).forEach(name => {
                        const char = allChars.get(name);
                        if (char && !(mCls.exceptPairs && mCls.exceptPairs.includes(`${baseChar.name}-${name}`))) {
                            marksToUpdate.add(char);
                        }
                    });
                }
            }
        }

        const basesToUpdate = new Set<Character>([baseChar]);
        if (baseAttachmentClasses) {
            const bCls = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(baseChar.name));
            if (bCls && !(bCls.exceptPairs && bCls.exceptPairs.includes(currentPairKey))) {
                const appliesToMark = (!bCls.exceptions || !expandMembers(bCls.exceptions, groups, characterSets).includes(markChar.name)) &&
                                      (!bCls.applies || bCls.applies.length === 0 || expandMembers(bCls.applies, groups, characterSets).includes(markChar.name));
                if (appliesToMark) {
                    expandMembers(bCls.members, groups, characterSets).forEach(name => {
                        const char = allChars.get(name);
                        if (char && !(bCls.exceptPairs && bCls.exceptPairs.includes(`${name}-${markChar.name}`))) {
                            basesToUpdate.add(char);
                        }
                    });
                }
            }
        }

        // Apply Delta to all siblings
        basesToUpdate.forEach(currentBase => {
            marksToUpdate.forEach(currentMark => {
                if (currentBase.unicode === baseChar.unicode && currentMark.unicode === markChar.unicode) return;

                const key = `${currentBase.unicode}-${currentMark.unicode}`;
                const siblingBaseGlyph = glyphDataMap.get(currentBase.unicode);
                const siblingMarkGlyph = glyphDataMap.get(currentMark.unicode);

                if (!siblingBaseGlyph || !siblingMarkGlyph) return;

                // Resolve specific constraint for this sibling
                const siblingRule = positioningRules?.find(rule => 
                    expandMembers(rule.base, groups, characterSets).includes(currentBase.name) && 
                    expandMembers(rule.mark || [], groups, characterSets).includes(currentMark.name)
                );
                
                const siblingConstraint = (siblingRule?.movement === 'horizontal' || siblingRule?.movement === 'vertical') ? siblingRule.movement : 'none';
                const sBaseBbox = getAccurateGlyphBBox(siblingBaseGlyph.paths, strokeThickness);
                const sMarkBbox = getAccurateGlyphBBox(siblingMarkGlyph.paths, strokeThickness);

                const siblingDefaultOffset = calculateDefaultMarkOffset(
                    currentBase, currentMark, sBaseBbox, sMarkBbox,
                    markAttachmentRules || null, metrics,
                    characterSets, false, groups, siblingConstraint
                );

                const siblingFinalOffset = VEC.add(siblingDefaultOffset, userDelta);
                
                // 1. Commit to GPOS map
                newMarkPositioningMap.set(key, siblingFinalOffset);

                // 2. Commit to baked paths (GSUB) only if a rule exists and it has gsub property
                const ligature = allLigaturesByKey.get(key);
                if (ligature && siblingRule?.gsub) {
                    const transformedMarkPaths = deepClone(siblingMarkGlyph.paths).map((p: Path) => ({
                        ...p,
                        points: p.points.map((pt: Point) => ({ x: pt.x + siblingFinalOffset.x, y: pt.y + siblingFinalOffset.y })),
                        segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: { x: seg.point.x + siblingFinalOffset.x, y: seg.point.y + siblingFinalOffset.y } }))) : undefined
                    }));
                    newGlyphDataMap.set(ligature.unicode, { paths: [...siblingBaseGlyph.paths, ...transformedMarkPaths] });
                }
            });
        });
    }

    const updatedSets = characterSets.map(set => ({
        ...set,
        characters: set.characters.map(char => {
            if (newLigaturesToUpdate.has(char.unicode)) {
                const updatedLigature = newLigaturesToUpdate.get(char.unicode)!;
                
                // Surgical update of character properties
                const updatedChar = { ...char };
                if (updatedLigature.lsb !== undefined) updatedChar.lsb = updatedLigature.lsb;
                if (updatedLigature.rsb !== undefined) updatedChar.rsb = updatedLigature.rsb;
                if (updatedLigature.glyphClass !== undefined) updatedChar.glyphClass = updatedLigature.glyphClass;
                if (updatedLigature.advWidth !== undefined) updatedChar.advWidth = updatedLigature.advWidth;
                if (updatedLigature.gsub !== undefined) updatedChar.gsub = updatedLigature.gsub;
                if (updatedLigature.gpos !== undefined) updatedChar.gpos = updatedLigature.gpos;
                if (updatedLigature.liga !== undefined) updatedChar.liga = updatedLigature.liga;
                
                // Only merge construction props if we are in manual mode (Apply button)
                if (isManual) {
                    if (updatedLigature.position) updatedChar.position = updatedLigature.position;
                    if (updatedLigature.kern) updatedChar.kern = updatedLigature.kern;
                    if (updatedLigature.link) updatedChar.link = updatedLigature.link;
                    if (updatedLigature.composite) updatedChar.composite = updatedLigature.composite;
                }

                return updatedChar;
            }
            return char;
        })
    }));

    return {
        updatedMarkPositioningMap: newMarkPositioningMap,
        updatedGlyphDataMap: newGlyphDataMap,
        updatedCharacterSets: updatedSets
    };
};

export const syncAttachmentClasses = (args: any): UpdatePositioningResult => {
    return updatePositioningAndCascade(args);
};
