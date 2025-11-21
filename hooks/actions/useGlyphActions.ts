
import React, { useState, useCallback } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { Character, GlyphData, Path, Point, CharacterSet } from '../../types';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData, updateComponentInPaths } from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';

declare var UnicodeProperties: any;

export interface SaveOptions {
    isDraft?: boolean;  // If true, skip cascade updates (fast/autosave). If false, run cascade (commit).
    silent?: boolean;   // If true, do not show success notifications (unless critical cascade).
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
        
        const dependents = dependencyMap.current.get(unicode);
        
        // Check for positioned pairs that might need updates (visual cascade)
        let positionedPairCount = 0;
        markPositioningMap.forEach((_, key) => {
            const [baseUnicode, markUnicode] = key.split('-').map(Number);
            if (baseUnicode === unicode || markUnicode === unicode) {
                if (isGlyphDrawn(glyphDataMap.get(baseUnicode)) && isGlyphDrawn(glyphDataMap.get(markUnicode))) {
                    positionedPairCount++;
                }
            }
        });

        const totalDependents = (dependents ? dependents.size : 0) + positionedPairCount;
        const hasCascade = totalDependents > 0;

        if (hasCascade) {
            // 1. Snapshot state before making changes for Undo
            const glyphDataSnapshot = new Map(glyphDataMap.entries());
            const characterSetsSnapshot = JSON.parse(JSON.stringify(characterSets));
            const markPositioningSnapshot = new Map(markPositioningMap.entries());
            
            const undoChanges = () => {
                glyphDataDispatch({ type: 'SET_MAP', payload: glyphDataSnapshot });
                characterDispatch({ type: 'SET_CHARACTER_SETS', payload: characterSetsSnapshot });
                positioningDispatch({ type: 'SET_MAP', payload: markPositioningSnapshot });
                layout.showNotification(t('glyphUpdateReverted'), 'info');
            };

            // 2. Perform Cascade Update
            glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prevGlyphData) => {
                const newGlyphDataMap = new Map(prevGlyphData);
                // Ensure the source is updated in the map used for regeneration
                newGlyphDataMap.set(unicode, newGlyphData);
        
                dependents?.forEach(depUnicode => {
                    const dependentChar = allCharsByUnicode.get(depUnicode);
                    if (!dependentChar || !dependentChar.link) return;
        
                    const dependentGlyphData = newGlyphDataMap.get(depUnicode);
                    
                    // If dependent isn't drawn yet, attempt full regeneration
                    if (!dependentGlyphData || !isGlyphDrawn(dependentGlyphData)) {
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
                    const strokeThickness = settings?.strokeThickness ?? 1;
            
                    for (const index of indicesToUpdate) {
                        const updatedPaths = updateComponentInPaths(
                            tempPaths,
                            index,
                            newGlyphData.paths,
                            strokeThickness,
                            dependentChar.compositeTransform
                        );

                        if (!updatedPaths) {
                            // If transformation fails (e.g. missing bounding boxes), flag for full regeneration
                            pathsNeedRegeneration = true;
                            break;
                        }

                        tempPaths = updatedPaths;
                    }
            
                    if (pathsNeedRegeneration) {
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

            // 3. Notification: ALWAYS show if there was a cascade, even if silent=true (e.g. navigation)
            // This is crucial so the user knows other glyphs were affected and can Undo.
            layout.showNotification(
                t('updatedDependents', { count: totalDependents }),
                'success',
                // { onUndo: undoChanges, duration: 7000 }
            );
            
        } else if (!silent) {
            // No cascade, only show success if NOT silent
            layout.showNotification(t('saveGlyphSuccess'));
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
