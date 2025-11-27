
import React, { useState, useCallback } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useKerning } from '../../contexts/KerningContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { Character, GlyphData, Path, Point, CharacterSet } from '../../types';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData, updateComponentInPaths } from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';
import * as dbService from '../../services/dbService';

declare var UnicodeProperties: any;

export interface SaveOptions {
    isDraft?: boolean;  // If true, skip cascade updates (fast/autosave). If false, run cascade (commit).
    silent?: boolean;   // If true, do not show success notifications (unless critical cascade).
}

export const useGlyphActions = (
    dependencyMap: React.MutableRefObject<Map<number, Set<number>>>,
    projectId: number | undefined
) => {
    const { t } = useLocale();
    const layout = useLayout();
    const { characterSets, allCharsByUnicode, allCharsByName, dispatch: characterDispatch } = useCharacter();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { settings, metrics, dispatch: settingsDispatch } = useSettings();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    
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

        // 4. COMMIT Logic (Navigation or Manual Save) - Run Recursive Cascade
        
        // Determine if we need to run cascade at all
        // We can check immediate dependents first to save time
        const immediateDependents = dependencyMap.current.get(unicode);
        
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

        const hasDependents = (immediateDependents && immediateDependents.size > 0) || positionedPairCount > 0;

        if (hasDependents) {
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

            // 2. Perform Recursive Cascade Update
            let totalUpdatedCount = 0;

            glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prevGlyphData) => {
                const newGlyphDataMap = new Map(prevGlyphData);
                // Ensure the source is updated in the map used for regeneration
                newGlyphDataMap.set(unicode, newGlyphData);
        
                // BFS Queue for recursive updates
                // Queue holds unicodes that have been updated and need their dependents checked
                const queue: number[] = [unicode];
                const visited = new Set<number>([unicode]);

                while (queue.length > 0) {
                    const currentSourceUnicode = queue.shift()!;
                    const currentDependents = dependencyMap.current.get(currentSourceUnicode);

                    if (!currentDependents) continue;

                    currentDependents.forEach(depUnicode => {
                        if (visited.has(depUnicode)) return; // Cycle detection / already processed

                        const dependentChar = allCharsByUnicode.get(depUnicode);
                        if (!dependentChar || !dependentChar.link) return;
            
                        const dependentGlyphData = newGlyphDataMap.get(depUnicode);
                        
                        // --- Regeneration Logic ---
                        // This logic mimics the original single-level update but applies recursively

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
                                visited.add(depUnicode);
                                queue.push(depUnicode);
                                totalUpdatedCount++;
                            }
                            return;
                        }
            
                        // SMART CASCADE: Preserve offsets/transforms
                        // Find which components of the dependent char correspond to the *currently updated* source char
                        const indicesToUpdate: number[] = [];
                        dependentChar.link.forEach((name, index) => {
                            if (allCharsByName.get(name)?.unicode === currentSourceUnicode) {
                                indicesToUpdate.push(index);
                            }
                        });
                
                        if (indicesToUpdate.length === 0) return;
                
                        let pathsNeedRegeneration = false;
                        let tempPaths = dependentGlyphData.paths;
                        const strokeThickness = settings?.strokeThickness ?? 1;
                        
                        // Fetch the *new* data for the current source (it might be an intermediate node in the chain)
                        const sourceGlyphData = newGlyphDataMap.get(currentSourceUnicode);
                        if (!sourceGlyphData) return;

                        for (const index of indicesToUpdate) {
                            const updatedPaths = updateComponentInPaths(
                                tempPaths,
                                index,
                                sourceGlyphData.paths,
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

                        visited.add(depUnicode);
                        queue.push(depUnicode);
                        totalUpdatedCount++;
                    });
                }
                
                return newGlyphDataMap;
            }});

            // Add positioned pairs count to total
            totalUpdatedCount += positionedPairCount;

            // 3. Notification: ALWAYS show if there was a cascade
            layout.showNotification(
                t('updatedDependents', { count: totalUpdatedCount }),
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
        
        // 1. Snapshot for Undo (All affected contexts)
        const glyphDataSnapshot = new Map(glyphDataMap);
        const characterSetsSnapshot = JSON.parse(JSON.stringify(characterSets));
        const kerningSnapshot = new Map(kerningMap);
        const positioningSnapshot = new Map(markPositioningMap);
        const dependencySnapshot = new Map(dependencyMap.current); // Shallow copy of map structure
        
        const undo = () => {
            glyphDataDispatch({ type: 'SET_MAP', payload: glyphDataSnapshot });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: characterSetsSnapshot });
            kerningDispatch({ type: 'SET_MAP', payload: kerningSnapshot });
            positioningDispatch({ type: 'SET_MAP', payload: positioningSnapshot });
            dependencyMap.current = dependencySnapshot; // Restore dependency graph
        };

        // 2. Handle Dependents (Bake and Unlink)
        // If this glyph is a component for others, those others need to become independent now.
        const dependents = dependencyMap.current.get(unicode);
        if (dependents && dependents.size > 0) {
            // We must perform updates to the dependents BEFORE deleting the source glyph from data maps,
            // otherwise generation logic might fail to find the source.
            
            // Set of unicode IDs that need to be updated
            const dependentUnicodes = Array.from(dependents);
            
            // A. Update Glyph Data (Bake shapes)
            glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prev) => {
                const next = new Map(prev);
                dependentUnicodes.forEach(depUni => {
                    const depChar = allCharsByUnicode.get(depUni);
                    // If it's a linked glyph, we need to ensure its current shape is captured as static paths
                    if (depChar && (depChar.link || depChar.composite)) {
                        const compositeData = generateCompositeGlyphData({
                            character: depChar,
                            allCharsByName,
                            allGlyphData: prev, // Use current state before deletion
                            settings: settings!,
                            metrics: metrics!,
                            markAttachmentRules,
                            allCharacterSets: characterSets!
                        });
                        // If we successfully generated data, save it. 
                        // If not (maybe it was already empty), keep what we have or empty it.
                        if (compositeData) {
                            next.set(depUni, compositeData);
                        }
                    }
                });
                return next;
            }});

            // B. Update Metadata (Remove links)
            characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets) => {
                if (!prevSets) return null;
                return prevSets.map(set => ({
                    ...set,
                    characters: set.characters.map(char => {
                        if (dependentUnicodes.includes(char.unicode!)) {
                            const newChar = { ...char };
                            delete newChar.link;
                            delete newChar.composite;
                            delete newChar.compositeTransform;
                            delete newChar.sourceLink;
                            // It effectively becomes a standard base glyph
                            return newChar;
                        }
                        return char;
                    })
                }));
            }});
            
            // C. Clean up dependency map
            dependencyMap.current.delete(unicode);
        }

        // 3. Cascade Delete Logic (Kerning & Positioning)
        
        // Filter Kerning Map
        const newKerningMap = new Map<string, number>();
        kerningMap.forEach((value, key) => {
            const [left, right] = key.split('-').map(Number);
            if (left !== unicode && right !== unicode) {
                newKerningMap.set(key, value);
            }
        });

        // Filter Positioning Map
        const newPositioningMap = new Map<string, Point>();
        markPositioningMap.forEach((value, key) => {
            const [base, mark] = key.split('-').map(Number);
            if (base !== unicode && mark !== unicode) {
                newPositioningMap.set(key, value);
            }
        });

        // 4. Dispatch Updates
        glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode }});
        characterDispatch({ type: 'DELETE_CHARACTER', payload: { unicode } });
        kerningDispatch({ type: 'SET_MAP', payload: newKerningMap });
        positioningDispatch({ type: 'SET_MAP', payload: newPositioningMap });
        
        layout.closeCharacterModal();
        layout.showNotification(
            t('glyphDeletedSuccess', { name: charToDelete.name }),
            'success',
            { onUndo: undo }
        );
    }, [allCharsByUnicode, t, glyphDataDispatch, characterDispatch, kerningDispatch, positioningDispatch, layout, glyphDataMap, characterSets, kerningMap, markPositioningMap, dependencyMap, allCharsByName, settings, metrics, markAttachmentRules]);

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
    
    // NEW: Handle manual update of dependencies (e.g. via properties panel)
    const handleUpdateDependencies = useCallback((unicode: number, newLinkComponents: string[] | null) => {
        // 1. Clean up existing dependencies (from current character definition)
        const currentChar = allCharsByUnicode.get(unicode);
        if (currentChar && currentChar.link) {
            currentChar.link.forEach(compName => {
                const compChar = allCharsByName.get(compName);
                if (compChar && compChar.unicode !== undefined) {
                    const dependents = dependencyMap.current.get(compChar.unicode);
                    if (dependents) {
                        dependents.delete(unicode);
                    }
                }
            });
        }

        // 2. Register new dependencies if provided (i.e. we are linking)
        if (newLinkComponents && newLinkComponents.length > 0) {
            newLinkComponents.forEach(compName => {
                const compChar = allCharsByName.get(compName);
                if (compChar && compChar.unicode !== undefined) {
                    if (!dependencyMap.current.has(compChar.unicode)) {
                        dependencyMap.current.set(compChar.unicode, new Set());
                    }
                    dependencyMap.current.get(compChar.unicode)!.add(unicode);
                }
            });
        }
    }, [allCharsByUnicode, allCharsByName, dependencyMap]);

    const handleImportGlyphs = useCallback((glyphsToImport: [number, GlyphData][]) => {
        if (!glyphsToImport || glyphsToImport.length === 0) return;
    
        glyphDataDispatch({ type: 'UPDATE_MAP', payload: (prevMap) => {
            const newMap = new Map(prevMap);
            for (const [unicode, glyphData] of glyphsToImport) {
                newMap.set(unicode, glyphData);
            }
            return newMap;
        }});

        if (projectId !== undefined) {
            dbService.deleteFontCache(projectId);
        }
        
        layout.showNotification(t('glyphsImportedSuccess', { count: glyphsToImport.length }));
        layout.closeModal();
    
    }, [glyphDataDispatch, layout, t, projectId]);

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
        handleUpdateDependencies, // Exposed new function
        handleImportGlyphs,
        handleAddBlock,
        handleCheckGlyphExists,
        handleCheckNameExists,
        setMarkAttachmentRules, 
        markAttachmentRules
    };
};
