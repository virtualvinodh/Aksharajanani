
import { useCallback } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { updatePositioningAndCascade } from '../../services/positioningService';
import { getAccurateGlyphBBox, calculateDefaultMarkOffset } from '../../services/glyphRenderService';
import { Character, GlyphData, Point, Path, PositioningRules, AttachmentClass, MarkAttachmentRules, CharacterSet, FontMetrics, MarkPositioningMap } from '../../types';
import { deepClone } from '../../utils/cloneUtils';
import { expandMembers } from '../../services/groupExpansionService';

interface UsePositioningActionsProps {
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    characterSets: CharacterSet[];
    positioningRules: PositioningRules[] | null;
    markAttachmentRules: MarkAttachmentRules | null;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    groups: Record<string, string[]>;
    settings: any; // AppSettings
    metrics: FontMetrics;
    allChars: Map<string, Character>;
    allLigaturesByKey: Map<string, Character>;
    displayedCombinations: { base: Character; mark: Character; ligature: Character }[];
    viewMode: 'base' | 'mark' | 'rules';
}

// Helper to check if a pair is eligible for auto-positioning (Representative or Independent)
const isPairEligible = (
    base: Character, 
    mark: Character, 
    markAttachmentClasses: AttachmentClass[] | null, 
    baseAttachmentClasses: AttachmentClass[] | null, 
    groups: Record<string, string[]>, 
    characterSets: CharacterSet[]
) => {
    const pairKey = `${base.name}-${mark.name}`;

    // Check Mark Classes
    if (markAttachmentClasses) {
        const mClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(mark.name));
        if (mClass) {
            let applies = true;
            if (mClass.applies && mClass.applies.length > 0 && !expandMembers(mClass.applies, groups, characterSets).includes(base.name)) applies = false;
            if (mClass.exceptions && expandMembers(mClass.exceptions, groups, characterSets).includes(base.name)) applies = false;
            
            if (applies) {
                if (mClass.exceptPairs?.includes(pairKey)) return true; // Exception = Independent = Eligible
                
                const members = expandMembers(mClass.members, groups, characterSets);
                // Leader is first member. If current mark is NOT leader, it's a sibling.
                if (members[0] !== mark.name) return false; 
            }
        }
    }

    // Check Base Classes
    if (baseAttachmentClasses) {
        const bClass = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(base.name));
        if (bClass) {
            let applies = true;
            if (bClass.applies && bClass.applies.length > 0 && !expandMembers(bClass.applies, groups, characterSets).includes(mark.name)) applies = false;
            if (bClass.exceptions && expandMembers(bClass.exceptions, groups, characterSets).includes(mark.name)) applies = false;
            
            if (applies) {
                if (bClass.exceptPairs?.includes(pairKey)) return true; // Exception = Independent = Eligible
                
                const members = expandMembers(bClass.members, groups, characterSets);
                // Leader is first member. If current base is NOT leader, it's a sibling.
                if (members[0] !== base.name) return false;
            }
        }
    }
    return true; // Default to eligible if not a sibling in any class
};

export const usePositioningActions = ({
    glyphDataMap,
    markPositioningMap,
    characterSets,
    positioningRules,
    markAttachmentRules,
    markAttachmentClasses,
    baseAttachmentClasses,
    groups,
    settings,
    metrics,
    allChars,
    allLigaturesByKey,
    displayedCombinations,
    viewMode
}: UsePositioningActionsProps) => {
    
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const { dispatch: glyphDataDispatch } = useGlyphData();
    const { dispatch: positioningDispatch } = usePositioning();
    const { dispatch: characterDispatch } = useProject();

    const savePositioningUpdate = useCallback((
        baseChar: Character,
        markChar: Character,
        targetLigature: Character,
        newGlyphData: GlyphData,
        newOffset: Point,
        newBearings: { 
            lsb?: number, 
            rsb?: number,
            glyphClass?: Character['glyphClass'],
            advWidth?: number | string,
            gsub?: string,
            gpos?: string
        },
        isAutosave: boolean = false,
        isManual: boolean = false
    ) => {
        if (!characterSets || !settings) return;
    
        const snapshot = {
            glyphDataMap: new Map(glyphDataMap.entries()),
            characterSets: JSON.parse(JSON.stringify(characterSets)),
            markPositioningMap: new Map(markPositioningMap.entries()),
        };
    
        const result = updatePositioningAndCascade({
            baseChar, markChar, targetLigature, newGlyphData, newOffset, newBearings,
            allChars, allLigaturesByKey,
            markAttachmentClasses, baseAttachmentClasses,
            markPositioningMap, glyphDataMap, characterSets, positioningRules,
            markAttachmentRules,
            groups,
            strokeThickness: settings.strokeThickness,
            metrics,
            isManual
        });
    
        const propagatedCount = result.updatedMarkPositioningMap.size - markPositioningMap.size - 1;
    
        if (propagatedCount > 0) {
            const undoPropagation = () => {
                glyphDataDispatch({ type: 'SET_MAP', payload: snapshot.glyphDataMap });
                characterDispatch({ type: 'SET_CHARACTER_SETS', payload: snapshot.characterSets });
                positioningDispatch({ type: 'SET_MAP', payload: snapshot.markPositioningMap });
    
                const reapplyResult = updatePositioningAndCascade({
                    baseChar, markChar, targetLigature, newGlyphData, newOffset, newBearings,
                    allChars, allLigaturesByKey,
                    markAttachmentClasses: [], 
                    baseAttachmentClasses: [], 
                    markPositioningMap: snapshot.markPositioningMap,
                    glyphDataMap: snapshot.glyphDataMap,
                    characterSets: snapshot.characterSets,
                    positioningRules,
                    markAttachmentRules,
                    groups,
                    strokeThickness: settings.strokeThickness,
                    metrics,
                    isManual
                });
    
                positioningDispatch({ type: 'SET_MAP', payload: reapplyResult.updatedMarkPositioningMap });
                glyphDataDispatch({ type: 'SET_MAP', payload: reapplyResult.updatedGlyphDataMap });
                characterDispatch({ type: 'SET_CHARACTER_SETS', payload: reapplyResult.updatedCharacterSets });
    
                showNotification(t('positioningPropagationReverted'), 'info');
            };
    
            positioningDispatch({ type: 'SET_MAP', payload: result.updatedMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: result.updatedGlyphDataMap });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: result.updatedCharacterSets });
    
            if (!isAutosave) {
                showNotification(t('propagatedPositions', { count: propagatedCount }), 'success', { onUndo: undoPropagation, duration: 7000 });
            }
        } else {
            positioningDispatch({ type: 'SET_MAP', payload: result.updatedMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: result.updatedGlyphDataMap });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: result.updatedCharacterSets });
            if (!isAutosave) showNotification(t('positioningUpdated'), 'success');
        }
    
    }, [
        characterSets, allChars, allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses,
        markPositioningMap, glyphDataMap, positioningRules, positioningDispatch, glyphDataDispatch,
        characterDispatch, showNotification, t, groups, markAttachmentRules, settings, metrics
    ]);

    const handleConfirmPosition = useCallback((base: Character, mark: Character, ligature: Character) => {
        const baseGlyph = glyphDataMap.get(base.unicode);
        const markGlyph = glyphDataMap.get(mark.unicode);
        if (!baseGlyph || !markGlyph || !metrics || !characterSets || !settings) return;

        // Find the rule to determine constraint
        const rule = positioningRules?.find(r => 
            expandMembers(r.base, groups, characterSets).includes(base.name) && 
            expandMembers(r.mark, groups, characterSets).includes(mark.name)
        );
        const constraint = (rule && (rule.movement === 'horizontal' || rule.movement === 'vertical')) ? rule.movement : 'none';

        const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, settings.strokeThickness);
        const markBbox = getAccurateGlyphBBox(markGlyph.paths, settings.strokeThickness);
        const offset = calculateDefaultMarkOffset(base, mark, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups, constraint);
    
        const transformedMarkPaths = deepClone(markGlyph.paths).map((p: Path) => ({
            ...p,
            points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
        }));
        const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
        const newGlyphData = { paths: combinedPaths };
        const newBearings = { lsb: ligature.lsb, rsb: ligature.rsb, glyphClass: ligature.glyphClass, advWidth: ligature.advWidth, gsub: ligature.gsub, gpos: ligature.gpos };
    
        // We pass 'true' for isAutosave to suppress the notification, as visual feedback is sufficient here.
        savePositioningUpdate(base, mark, ligature, newGlyphData, offset, newBearings, true, false);
    }, [glyphDataMap, markAttachmentRules, savePositioningUpdate, t, metrics, characterSets, settings, groups, positioningRules]);

    const handleAcceptAllDefaults = useCallback((pairsToProcess?: { base: Character; mark: Character; ligature: Character }[]) => {
        if (!characterSets) return;
        
        const targetList = pairsToProcess || displayedCombinations;

        // Apply to unpositioned pairs that are ELIGIBLE (Representatives or Independent)
        const unpositionedPairs = targetList.filter(combo => {
            const isPositioned = markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`);
            if (isPositioned) return false;
            
            // Check Class Eligibility (skip siblings)
            return isPairEligible(combo.base, combo.mark, markAttachmentClasses, baseAttachmentClasses, groups, characterSets);
        });

        if (unpositionedPairs.length === 0) return;
        
        let tempMarkPositioningMap = new Map(markPositioningMap);
        let tempGlyphDataMap = new Map(glyphDataMap);
        let tempCharacterSets = JSON.parse(JSON.stringify(characterSets!));

        for (const { base, mark, ligature } of unpositionedPairs) {
            const baseGlyph = tempGlyphDataMap.get(base.unicode);
            const markGlyph = tempGlyphDataMap.get(mark.unicode);
            if (!baseGlyph || !markGlyph || !metrics || !settings) continue;

            // Resolve rule for constraint
            const rule = positioningRules?.find(r => 
                expandMembers(r.base, groups, characterSets).includes(base.name) && 
                expandMembers(r.mark, groups, characterSets).includes(mark.name)
            );
            const constraint = (rule && (rule.movement === 'horizontal' || rule.movement === 'vertical')) ? rule.movement : 'none';

            const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, settings.strokeThickness);
            const markBbox = getAccurateGlyphBBox(markGlyph.paths, settings.strokeThickness);
            const offset = calculateDefaultMarkOffset(base, mark, baseBbox, markBbox, markAttachmentRules, metrics, tempCharacterSets, false, groups, constraint);

            const transformedMarkPaths = deepClone(markGlyph.paths).map((p: Path) => ({
                ...p,
                points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
                segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
            }));
            const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
            const newGlyphData = { paths: combinedPaths };
            const newBearings = { lsb: ligature.lsb, rsb: ligature.rsb, glyphClass: ligature.glyphClass, advWidth: ligature.advWidth, gsub: ligature.gsub, gpos: ligature.gpos };
            
            const result = updatePositioningAndCascade({
                baseChar: base, markChar: mark, targetLigature: ligature, newGlyphData,
                newOffset: offset, newBearings, allChars, allLigaturesByKey,
                markAttachmentClasses, baseAttachmentClasses,
                markPositioningMap: tempMarkPositioningMap,
                glyphDataMap: tempGlyphDataMap,
                characterSets: tempCharacterSets,
                positioningRules,
                markAttachmentRules,
                groups,
                strokeThickness: settings.strokeThickness,
                metrics,
                isManual: false
            });
            
            tempMarkPositioningMap = result.updatedMarkPositioningMap;
            tempGlyphDataMap = result.updatedGlyphDataMap;
            tempCharacterSets = result.updatedCharacterSets;
        }

        positioningDispatch({ type: 'SET_MAP', payload: tempMarkPositioningMap });
        glyphDataDispatch({ type: 'SET_MAP', payload: tempGlyphDataMap });
        characterDispatch({ type: 'SET_CHARACTER_SETS', payload: tempCharacterSets });

        showNotification(t('acceptedAllDefaults', { count: unpositionedPairs.length }), 'success');
    }, [displayedCombinations, markPositioningMap, glyphDataMap, t, metrics, settings, markAttachmentRules, characterSets, allChars, allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses, positioningRules, positioningDispatch, glyphDataDispatch, characterDispatch, groups, showNotification]);

    const handleCopyPositions = useCallback((copyFromItem: Character, reuseSourceItem: Character, navItems: Character[]) => {
        // Reuse logic simplified: works on displayedCombinations (Grid View).
        if (!reuseSourceItem) return;

        const newMarkPositioningMap = new Map(markPositioningMap);
        const newGlyphDataMap = new Map(glyphDataMap);
        const ligaturesToAddOrUpdate: Character[] = [];
        
        let positionsCopiedCount = 0;
        
        // Only works in Grid View efficiently
        displayedCombinations.forEach(targetCombo => {
            const otherChar = viewMode === 'base' ? targetCombo.mark : targetCombo.base;
            const sourceBase = viewMode === 'base' ? copyFromItem : otherChar;
            const sourceMark = viewMode === 'base' ? otherChar : copyFromItem;
            
            const sourceKey = `${sourceBase.unicode}-${sourceMark.unicode}`;
            const sourceOffset = markPositioningMap.get(sourceKey);

            if (sourceOffset) {
                const targetKey = `${targetCombo.base.unicode}-${targetCombo.mark.unicode}`;
                newMarkPositioningMap.set(targetKey, sourceOffset);

                const baseGlyph = glyphDataMap.get(targetCombo.base.unicode);
                const markGlyph = glyphDataMap.get(targetCombo.mark.unicode);
                if (baseGlyph && markGlyph) {
                    const transformedMarkPaths = deepClone(markGlyph.paths).map((p: Path) => ({
                        ...p,
                        points: p.points.map((pt: Point) => ({ x: pt.x + sourceOffset.x, y: pt.y + sourceOffset.y }))
                    }));
                    const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
                    newGlyphDataMap.set(targetCombo.ligature.unicode, { paths: combinedPaths });
                    ligaturesToAddOrUpdate.push(targetCombo.ligature);
                    positionsCopiedCount++;
                }
            }
        });

        if (positionsCopiedCount > 0) {
            positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: newGlyphDataMap });

            characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets: CharacterSet[] | null) => {
                if (!prevSets) return null;
                const updatedSets: CharacterSet[] = JSON.parse(JSON.stringify(prevSets));
                const allExistingChars = new Map<number, Character>();
                updatedSets.forEach(set => set.characters.forEach(char => allExistingChars.set(char.unicode, char)));

                const DYNAMIC_LIGATURES_KEY = 'dynamicLigatures';
                let dynamicSet = updatedSets.find(s => s.nameKey === DYNAMIC_LIGATURES_KEY);
                if (!dynamicSet) {
                    dynamicSet = { nameKey: DYNAMIC_LIGATURES_KEY, characters: [] };
                    updatedSets.push(dynamicSet);
                }
                
                ligaturesToAddOrUpdate.forEach(ligature => {
                    if (!allExistingChars.has(ligature.unicode)) {
                        dynamicSet!.characters.push(ligature);
                        allExistingChars.set(ligature.unicode, ligature);
                    }
                });

                return updatedSets;
            }});

            showNotification(t('positionsCopied'), 'success');
        } else {
            showNotification(t('noPositionsToCopy'), 'info');
        }
    }, [markPositioningMap, displayedCombinations, viewMode, glyphDataMap, positioningDispatch, glyphDataDispatch, characterDispatch, showNotification, t]);

    const handleResetPositions = useCallback((pairsToReset: { base: Character; mark: Character; ligature: Character }[], activeItemName: string | undefined, onComplete: () => void) => {
        if (!characterSets) return;
        
        const newMarkPositioningMap = new Map(markPositioningMap);
        const newGlyphDataMap = new Map(glyphDataMap);
        let resetCount = 0;
    
        for (const combo of pairsToReset) {
            const key = `${combo.base.unicode}-${combo.mark.unicode}`;
            if (markPositioningMap.has(key)) {
                newMarkPositioningMap.delete(key);
                if (combo.ligature.unicode && newGlyphDataMap.has(combo.ligature.unicode)) {
                     newGlyphDataMap.delete(combo.ligature.unicode);
                }
                resetCount++;
            }
        }
        if (resetCount > 0) {
            positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: newGlyphDataMap });
            showNotification(t('positionsResetSuccess', { name: activeItemName ? activeItemName : `${resetCount} pairs` }), 'success');
        }
        onComplete();
    }, [characterSets, markPositioningMap, glyphDataMap, positioningRules, positioningDispatch, glyphDataDispatch, showNotification, t, groups]);

    const handleResetSinglePair = useCallback((base: Character, mark: Character, ligature: Character) => {
        if (!characterSets) return;
        const key = `${base.unicode}-${mark.unicode}`;
        if (!markPositioningMap.has(key)) return;
    
        const newMarkPositioningMap = new Map(markPositioningMap);
        newMarkPositioningMap.delete(key);
        positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
    
        // Aggressive cleanup for ligature
        if (ligature.unicode) {
            const newGlyphDataMap = new Map(glyphDataMap);
            if (newGlyphDataMap.has(ligature.unicode)) {
                newGlyphDataMap.delete(ligature.unicode);
                glyphDataDispatch({ type: 'SET_MAP', payload: newGlyphDataMap });
            }
        }
        showNotification(t('positionResetSuccess', { name: ligature.name }), 'success');
    }, [characterSets, markPositioningMap, positioningDispatch, glyphDataMap, glyphDataDispatch, showNotification, t]);

    return {
        savePositioningUpdate,
        handleConfirmPosition,
        handleAcceptAllDefaults,
        handleCopyPositions,
        handleResetPositions,
        handleResetSinglePair
    };
};
