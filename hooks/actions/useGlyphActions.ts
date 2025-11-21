
import React, { useState, useCallback } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { Character, GlyphData, Path, Point, CharacterSet } from '../../types';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData, getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';

declare var UnicodeProperties: any;

export interface SaveOptions {
    isDraft?: boolean;  // If true, skip cascade updates (fast/autosave). If false, run cascade (commit).
    silent?: boolean;   // If true, do not show success notifications.
}

export const useGlyphActions = (dependencyMap: React.MutableRefObject<Map<number, Set<number>>>) => {
    const { t } = useLocale();
    const layout = useLayout();
    const { characterSets, allCharsByUnicode, allCharsByName, dispatch: characterDispatch } = useCharacter();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { settings, metrics, dispatch: settingsDispatch } = useSettings();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    
    const [markAttachmentRules, setMarkAttachmentRules] = useState<any>(null);

    const handleSaveGlyph = useCallback((
        unicode: number,
        newGlyphData: GlyphData,
        newBearings: { lsb?: number; rsb?: number },
        onSuccess?: () => void,
        options: SaveOptions = {}
    ) => {
        const { isDraft = false, silent = false } = options;

        const charToSave = allCharsByUnicode.get(unicode);
        if (!charToSave) return;
    
        const oldPathsJSON = JSON.stringify(glyphDataMap.get(unicode)?.paths || []);
        const newPathsJSON = JSON.stringify(newGlyphData.paths);
        const hasPathChanges = oldPathsJSON !== newPathsJSON;
        const hasBearingChanges = newBearings.lsb !== charToSave.lsb || newBearings.rsb !== charToSave.rsb;
    
        // 1. No Changes?
        if (!hasPathChanges && !hasBearingChanges) {
            if (isDraft) {
                if (onSuccess) onSuccess();
                return;
            }
            // If it's not a draft (manual save), we might still want to trigger cascade if it was forced
        }

        // 2. Apply updates to current glyph
        if (hasPathChanges) {
            glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prev) => new Map(prev).set(unicode, newGlyphData) });
        }
        if (hasBearingChanges) {
            characterDispatch({ type: 'UPDATE_CHARACTER_BEARINGS', payload: { unicode, ...newBearings } });
        }

        // 3. If this is a DRAFT (Autosave), we stop here. 
        if (isDraft) {
            if (onSuccess) onSuccess();
            return;
        }

        // 4. COMMIT Logic (Navigation or Manual Save) - Run Cascade
        // RELINKING LOGIC: If this is a relink operation (detected by lack of paths/bearings args usually, 
        // but here we rely on the caller), we proceed. 
        // NOTE: The caller actually passes new data.
        
        const dependents = dependencyMap.current.get(unicode);
        
        // Also check for positioned pairs that might need updates (visual cascade)
        let positionedPairCount = 0;
        markPositioningMap.forEach((_, key) => {
            const [baseUnicode, markUnicode] = key.split('-').map(Number);
            if (baseUnicode === unicode || markUnicode === unicode) {
                if (isGlyphDrawn(glyphDataMap.get(baseUnicode)) && isGlyphDrawn(glyphDataMap.get(markUnicode))) {
                    positionedPairCount++;
                }
            }
        });

        const hasDependents = (dependents && dependents.size > 0);

        if (hasDependents) {
            if (!silent) {
                layout.showNotification(t('updatingDependents', { count: dependents.size }), 'info');
            }

            glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prevGlyphData) => {
                const newGlyphDataMap = new Map(prevGlyphData);
                // Ensure the source is updated in the map used for regeneration
                newGlyphDataMap.set(unicode, newGlyphData);
        
                dependents.forEach(depUnicode => {
                    const dependentChar = allCharsByUnicode.get(depUnicode);
                    if (!dependentChar || !dependentChar.link) return;
        
                    const dependentGlyphData = newGlyphDataMap.get(depUnicode);
                    
                    // If dependent isn't drawn yet, we can just regenerate it entirely if we want, 
                    // or skip it. Usually better to regenerate if possible.
                    if (!dependentGlyphData || !isGlyphDrawn(dependentGlyphData)) {
                         // Attempt full regeneration
                         const regenerated = generateCompositeGlyphData({ 
                            character: dependentChar, 
                            allCharsByName, 
                            allGlyphData: newGlyphDataMap, 
                            settings: settings!, 
                            metrics: metrics!, 
                            markAttachmentRules, 
                            allCharacterSets: characterSets! 
                        });
                        if(regenerated) {
                            newGlyphDataMap.set(depUnicode, regenerated);
                        }
                        return;
                    }
        
                    // SMART CASCADE: Preserve offsets/transforms
                    const indicesToUpdate: number[] = [];
                    dependentChar.link.forEach((name, index) => {
                        if (allCharsByName.get(name)?.unicode === unicode) {
                            indicesToUpdate.push(index);
                        }
                    });
            
                    if (indicesToUpdate.length === 0) return;
            
                    let pathsNeedRegeneration = false;
                    let tempPaths = dependentGlyphData.paths;
            
                    for (const index of indicesToUpdate) {
                        const groupIdToUpdate = `component-${index}`;
                        
                        // Find paths belonging to this specific component instance
                        // We check for exact match or prefix (in case ids were modified)
                        const oldPathsOfComponent = tempPaths.filter(p => p.groupId === groupIdToUpdate || (p.groupId && p.groupId.startsWith(`${groupIdToUpdate}-`)));
                        
                        if (oldPathsOfComponent.length === 0) {
                            // If we can't find the old paths to measure, we must regenerate.
                            pathsNeedRegeneration = true;
                            break; 
                        }
                        
                        const newPathsOfSourceComponent = newGlyphData.paths;
                        const strokeThickness = settings?.strokeThickness ?? 1;
                        
                        const oldBbox = getAccurateGlyphBBox(oldPathsOfComponent, strokeThickness);
                        const newSourceBbox = getAccurateGlyphBBox(newPathsOfSourceComponent, strokeThickness);
            
                        if (!oldBbox || !newSourceBbox || newSourceBbox.width === 0 || newSourceBbox.height === 0) {
                            pathsNeedRegeneration = true;
                            break;
                        }

                        // Calculate transformation (Scale and Translation)
                        const scaleX = oldBbox.width / newSourceBbox.width;
                        const scaleY = oldBbox.height / newSourceBbox.height;
                        
                        const newSourceCenter = { x: newSourceBbox.x + newSourceBbox.width / 2, y: newSourceBbox.y + newSourceBbox.height / 2 };
                        const oldCenter = { x: oldBbox.x + oldBbox.width / 2, y: oldBbox.y + oldBbox.height / 2 };

                        if (!isFinite(scaleX) || !isFinite(scaleY)) {
                            pathsNeedRegeneration = true;
                            break;
                        }

                        const transformPoint = (pt: Point): Point => {
                            // 1. Center the point relative to source
                            const vec = VEC.sub(pt, newSourceCenter);
                            // 2. Scale
                            const scaledVec = { x: vec.x * scaleX, y: vec.y * scaleY };
                            // 3. Translate to old center
                            return VEC.add(scaledVec, oldCenter);
                        };
                        
                        const transformedNewPaths = newPathsOfSourceComponent.map((p: Path) => ({
                            ...p,
                            id: `${p.id}-c${index}-${Date.now()}`, // Ensure unique IDs
                            groupId: groupIdToUpdate,
                            points: p.points.map(transformPoint),
                            segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({
                                ...seg,
                                point: transformPoint(seg.point),
                                handleIn: { x: seg.handleIn.x * scaleX, y: seg.handleIn.y * scaleY },
                                handleOut: { x: seg.handleOut.x * scaleX, y: seg.handleOut.y * scaleY }
                            }))) : undefined
                        }));
                        
                        // Remove old paths for this component and append new ones
                        const otherPaths = tempPaths.filter(p => p.groupId !== groupIdToUpdate && (!p.groupId || !p.groupId.startsWith(`${groupIdToUpdate}-`)));
                        tempPaths = [...otherPaths, ...transformedNewPaths];
                    }
            
                    if (pathsNeedRegeneration) {
                        console.warn(`Could not calculate bbox for smart cascade on ${dependentChar.name}. Regenerating fully.`);
                        const regenerated = generateCompositeGlyphData({ 
                            character: dependentChar, 
                            allCharsByName, 
                            allGlyphData: newGlyphDataMap, 
                            settings: settings!, 
                            metrics: metrics!, 
                            markAttachmentRules, 
                            allCharacterSets: characterSets! 
                        });
                        if(regenerated) {
                            newGlyphDataMap.set(depUnicode, regenerated);
                        }
                    } else {
                        newGlyphDataMap.set(depUnicode, { paths: tempPaths });
                    }
                });
                
                return newGlyphDataMap;
            }});
        } else if (!silent) {
             if (positionedPairCount > 0) {
                 layout.showNotification(`${t('saveGlyphSuccess')} (Affected ${positionedPairCount} positioned pairs)`, 'success');
             } else {
                 layout.showNotification(t('saveGlyphSuccess'));
             }
        }
        
        if (onSuccess) onSuccess();

    }, [allCharsByUnicode, glyphDataMap, dependencyMap, markPositioningMap, characterSets, glyphDataDispatch, characterDispatch, positioningDispatch, layout, settings, metrics, markAttachmentRules, allCharsByName, t]);

    const handleDeleteGlyph = useCallback((unicode: number) => {
        const charToDelete = allCharsByUnicode.get(unicode); if (!charToDelete) return;
        glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode }});
        characterDispatch({ type: 'DELETE_CHARACTER', payload: { unicode } });
        layout.closeCharacterModal();
        layout.showNotification(t('glyphDeletedSuccess', { name: charToDelete.name }));
    }, [allCharsByUnicode, t, glyphDataDispatch, characterDispatch, layout]);

    const handleAddGlyph = useCallback((charData: { unicode?: number; name: string }) => {
        let finalUnicode = charData.unicode;
        let isPuaAssigned = false;
    
        if (finalUnicode === undefined) {
            let puaCounter = 0xE000 - 1;
            allCharsByUnicode.forEach(char => {
                if (char.unicode && char.unicode >= 0xE000 && char.unicode <= 0xF8FF) {
                    puaCounter = Math.max(puaCounter, char.unicode);
                }
            });
            finalUnicode = puaCounter + 1;
            isPuaAssigned = true;
        }
    
        const category = UnicodeProperties.getCategory(finalUnicode);
        const glyphClass = (category === 'Mn' || category === 'Mc' || category === 'Me') ? 'mark' : 'base';
    
        const newChar: Character = {
            ...charData,
            unicode: finalUnicode,
            isCustom: true,
            isPuaAssigned: isPuaAssigned,
            glyphClass,
        };
    
        if (category === 'Mn') {
            newChar.advWidth = 0;
        }

        characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets) => {
            if (!prevSets) return [{ nameKey: 'punctuationsAndOthers', characters: [newChar] }];
            const newSets: CharacterSet[] = JSON.parse(JSON.stringify(prevSets));
            const activeSet = newSets[layout.activeTab] || newSets[newSets.length - 1] || { nameKey: 'punctuationsAndOthers', characters: [] };
            if (!newSets.includes(activeSet)) newSets.push(activeSet);
            activeSet.characters.push(newChar);
            return newSets;
        }});
        layout.closeModal();
        layout.showNotification(t('glyphAddedSuccess', { name: newChar.name }));
        layout.selectCharacter(newChar);
    }, [characterDispatch, layout, t, allCharsByUnicode]);

    const handleUnlockGlyph = useCallback((unicode: number) => {
        const charToUnlock = allCharsByUnicode.get(unicode);
        if (!charToUnlock || !charToUnlock.link) return;
    
        const unlockedChar = { ...charToUnlock };
        unlockedChar.composite = unlockedChar.link;
        unlockedChar.sourceLink = unlockedChar.link;
        delete unlockedChar.link;
    
        if (layout.selectedCharacter?.unicode === unicode) {
            layout.selectCharacter(unlockedChar);
        }
        
        characterDispatch({ type: 'UNLINK_GLYPH', payload: { unicode } });
    
        dependencyMap.current.forEach((dependents, key) => {
            if (dependents.has(unicode)) {
                dependents.delete(unicode);
            }
        });
    
    }, [characterDispatch, allCharsByUnicode, dependencyMap, layout]);

    const handleRelinkGlyph = useCallback((unicode: number) => {
        const charToRelink = allCharsByUnicode.get(unicode);
        if (!charToRelink || !charToRelink.sourceLink) return;

        const relinkedChar = { ...charToRelink };
        relinkedChar.link = relinkedChar.sourceLink;
        delete relinkedChar.sourceLink;
        delete relinkedChar.composite;

        if (layout.selectedCharacter?.unicode === unicode) {
            layout.selectCharacter(relinkedChar);
        }

        characterDispatch({ type: 'RELINK_GLYPH', payload: { unicode } });
        
        // Regenerate the composite data from the components
        if (relinkedChar.link && settings && metrics && characterSets) {
            const compositeData = generateCompositeGlyphData({
                character: relinkedChar,
                allCharsByName,
                allGlyphData: glyphDataMap,
                settings,
                metrics,
                markAttachmentRules,
                allCharacterSets: characterSets
            });
            
            if (compositeData) {
                glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prev) => new Map(prev).set(unicode, compositeData) });
            } else {
                glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode } });
            }
        } else {
            glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode } });
        }

        if (relinkedChar.link) {
            relinkedChar.link.forEach(compName => {
                const componentChar = allCharsByName.get(compName);
                if (componentChar?.unicode !== undefined) {
                    if (!dependencyMap.current.has(componentChar.unicode)) {
                        dependencyMap.current.set(componentChar.unicode, new Set());
                    }
                    dependencyMap.current.get(componentChar.unicode)!.add(unicode);
                }
            });
        }
    }, [characterDispatch, glyphDataDispatch, allCharsByUnicode, allCharsByName, dependencyMap, layout, settings, metrics, markAttachmentRules, characterSets, glyphDataMap]);

    const handleImportGlyphs = useCallback((glyphsToImport: [number, GlyphData][]) => {
        if (!glyphsToImport || glyphsToImport.length === 0) return;
    
        glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prevMap) => {
            const newMap = new Map(prevMap);
            for (const [unicode, glyphData] of glyphsToImport) {
                newMap.set(unicode, glyphData);
            }
            return newMap;
        }});
        
        layout.showNotification(t('glyphsImportedSuccess', { count: glyphsToImport.length }));
        layout.closeModal();
    
    }, [glyphDataDispatch, layout, t]);

    const handleAddBlock = useCallback((charsToAdd: Character[]) => {
        if (!characterSets) return;
        
        const visibleCharacterSets = characterSets
            .map(set => ({
                ...set,
                characters: set.characters.filter(char => char.unicode !== 8205 && char.unicode !== 8204)
            }))
            .filter(set => set.nameKey !== 'dynamicLigatures' && set.characters.length > 0);
        
        const activeTabNameKey = (layout.activeTab < visibleCharacterSets.length) 
            ? visibleCharacterSets[layout.activeTab].nameKey 
            : 'punctuationsAndOthers';

        characterDispatch({ type: 'ADD_CHARACTERS', payload: { characters: charsToAdd, activeTabNameKey } });
        
        if (charsToAdd.length > 0) {
            layout.showNotification(t('glyphsAddedFromBlock', { count: charsToAdd.length }), 'success');
        } else {
            layout.showNotification(t('allGlyphsFromBlockExist'), 'info');
        }
    }, [characterSets, characterDispatch, layout, t]);

    const handleCheckGlyphExists = useCallback((unicode: number): boolean => allCharsByUnicode.has(unicode), [allCharsByUnicode]);
    const handleCheckNameExists = useCallback((name: string): boolean => allCharsByName.has(name), [allCharsByName]);

    return {
        handleSaveGlyph,
        handleDeleteGlyph,
        handleAddGlyph,
        handleUnlockGlyph,
        handleRelinkGlyph,
        handleImportGlyphs,
        handleAddBlock,
        handleCheckGlyphExists,
        handleCheckNameExists,
        setMarkAttachmentRules, 
        markAttachmentRules
    };
};
