
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../../contexts/ProjectContext';
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
import { deepClone } from '../../utils/cloneUtils';

declare var UnicodeProperties: any;

export interface SaveOptions {
    isDraft?: boolean;
    silent?: boolean;
}

// Standard names that should map to specific Unicode points instead of PUA
const STANDARD_NAMES: Record<string, number> = {
    'space': 32,
    'nbsp': 160,
    'zwnj': 8204,
    'zwj': 8205
};

export const useGlyphActions = (
    dependencyMap: React.MutableRefObject<Map<number, Set<number>>>,
    projectId: number | undefined
) => {
    const { t } = useLocale();
    const layout = useLayout();
    // MIGRATION: Replaced useCharacter with useProject
    const { characterSets, allCharsByUnicode, allCharsByName, dispatchCharacterAction: characterDispatch, markAttachmentRules } = useProject();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { settings, metrics, dispatch: settingsDispatch } = useSettings();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    
    // --- Atomic PUA Cursor ---
    // Tracks the highest assigned PUA to prevent race conditions during rapid additions
    const puaCursorRef = useRef<number>(0xE000 - 1);

    // Sync cursor with loaded data, but ensure it never moves backwards during a session
    useEffect(() => {
        let maxFound = 0xE000 - 1;
        allCharsByUnicode.forEach((char, unicode) => {
            // Check BMP PUA (E000-F8FF)
            if (unicode >= 0xE000 && unicode <= 0xF8FF) {
                maxFound = Math.max(maxFound, unicode);
            }
            // Check Supplementary PUA-A (F0000-FFFFD)
            else if (unicode >= 0xF0000 && unicode <= 0xFFFFD) {
                maxFound = Math.max(maxFound, unicode);
            }
        });
        
        // Only update if the found max is greater than current cursor to strictly increase
        if (maxFound > puaCursorRef.current) {
            puaCursorRef.current = maxFound;
        }
    }, [allCharsByUnicode]);

    const getNextAtomicPua = useCallback(() => {
        let next = puaCursorRef.current + 1;
        
        // Overflow Protection: If BMP PUA is full (hitting CJK Compatibility at F900), 
        // jump to Plane 15 (Supplementary Private Use Area-A)
        if (next > 0xF8FF && next < 0xF0000) {
            next = 0xF0000;
        }
        
        puaCursorRef.current = next;
        return next;
    }, []);

    // Track mounting state to cancel async operations if the user leaves the project
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Helper for async time-slicing
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    const handleSaveGlyph = useCallback(async (
        unicode: number,
        newGlyphData: GlyphData,
        newMetadata: { lsb?: number; rsb?: number; glyphClass?: Character['glyphClass']; advWidth?: number | string },
        onSuccess?: () => void,
        options: SaveOptions = {}
    ) => {
        const { isDraft = false, silent = false } = options;

        const charToSave = allCharsByUnicode.get(unicode);
        if (!charToSave) return;
    
        const oldPathsJSON = JSON.stringify(glyphDataMap.get(unicode)?.paths || []);
        const newPathsJSON = JSON.stringify(newGlyphData.paths);
        const hasPathChanges = oldPathsJSON !== newPathsJSON;
        const hasMetadataChanges = 
            newMetadata.lsb !== charToSave.lsb || 
            newMetadata.rsb !== charToSave.rsb ||
            newMetadata.glyphClass !== charToSave.glyphClass ||
            newMetadata.advWidth !== charToSave.advWidth;
    
        // 1. No Changes?
        if (!hasPathChanges && !hasMetadataChanges) {
            if (isDraft) {
                if (onSuccess) onSuccess();
                return;
            }
        }

        // 2. Prepare new data map (working copy)
        // We do NOT create a full clone here for the final dispatch if we are doing async work,
        // because the state might change while we calculate.
        
        // Apply updates to current glyph immediately
        if (hasPathChanges) {
             // OPTIMIZED: Use SET_GLYPH to mutate map in place instead of cloning
             glyphDataDispatch({ 
                 type: 'SET_GLYPH', 
                 payload: { unicode, data: newGlyphData } 
             });
        }
        // Metadata handled separately via characterDispatch
        if (hasMetadataChanges) {
            characterDispatch({ type: 'UPDATE_CHARACTER_METADATA', payload: { unicode, ...newMetadata } });
        }

        // 3. If this is a DRAFT (Autosave), stop here.
        if (isDraft) {
            if (onSuccess) onSuccess();
            return;
        }

        // 4. COMMIT Logic - Recursive Cascade (Async)
        
        // Check for immediate dependents
        const rawDependents = dependencyMap.current.get(unicode);
        
        // Filter Dependents: Only include actual LINKED glyphs.
        // Standard Composites should act as templates/copies and NOT update when source changes.
        const linkedDependents = new Set<number>();
        if (rawDependents) {
            rawDependents.forEach(depUni => {
                const depChar = allCharsByUnicode.get(depUni);
                if (depChar && depChar.link) {
                    linkedDependents.add(depUni);
                }
            });
        }
        
        // Check for positioned pairs (visual updates only, just for notification stats)
        let positionedPairCount = 0;
        markPositioningMap.forEach((_, key) => {
            const [baseUnicode, markUnicode] = key.split('-').map(Number);
            if (baseUnicode === unicode || markUnicode === unicode) {
                // Use the NEW glyph data for the check
                if (isGlyphDrawn(baseUnicode === unicode ? newGlyphData : glyphDataMap.get(baseUnicode)) && 
                    isGlyphDrawn(markUnicode === unicode ? newGlyphData : glyphDataMap.get(markUnicode))) {
                    positionedPairCount++;
                }
            }
        });

        const hasDependents = (linkedDependents.size > 0) || positionedPairCount > 0;

        if (hasDependents) {
            // Show "Processing" notification
            layout.showNotification(t('updatingDependents', { count: linkedDependents.size + positionedPairCount }), 'info', { duration: 10000 });

            // Defer heavy calculation to next tick to let UI render the immediate save
            setTimeout(async () => {
                if (!isMounted.current) return; // Cancel if unmounted

                const updates = new Map<number, GlyphData>();
                let totalUpdatedCount = 0;

                // BFS Traversal
                const queue: number[] = [unicode];
                const visited = new Set<number>([unicode]);
                
                // We need a "read-only" view of the data that includes our recent manual save
                // for calculation purposes.
                const calculationSourceMap = new Map(glyphDataMap);
                calculationSourceMap.set(unicode, newGlyphData);

                const BATCH_SIZE = 5;
                let processedInBatch = 0;

                while (queue.length > 0) {
                    if (!isMounted.current) return; // Check cancel token inside loop

                    const currentSourceUnicode = queue.shift()!;
                    const currentDependents = dependencyMap.current.get(currentSourceUnicode);

                    if (!currentDependents) continue;

                    for (const depUnicode of currentDependents) {
                        if (visited.has(depUnicode)) continue;

                        const dependentChar = allCharsByUnicode.get(depUnicode);
                        
                        // Strict Check: Only update if it is a Linked Glyph
                        if (!dependentChar || !dependentChar.link) continue;
            
                        // We use the map from start of transaction + accumulated updates
                        // This ensures consistency within the cascade
                        const dependentGlyphData = calculationSourceMap.get(depUnicode);
                        let resultData: GlyphData | null = null;
                        
                        // Case A: Not drawn yet -> Full Generate
                        if (!dependentGlyphData || !isGlyphDrawn(dependentGlyphData)) {
                             const regenerated = generateCompositeGlyphData({ 
                                character: dependentChar, 
                                allCharsByName, 
                                allGlyphData: calculationSourceMap, 
                                settings: settings!, 
                                metrics: metrics!, 
                                markAttachmentRules, 
                                allCharacterSets: characterSets! 
                            });
                            if(regenerated) {
                                resultData = regenerated;
                            }
                        }
                        // Case B: Smart Update
                        else {
                            const indicesToUpdate: number[] = [];
                            // For linked glyphs, we use the 'link' property
                            const components = dependentChar.link || [];
                            
                            components.forEach((name, index) => {
                                if (allCharsByName.get(name)?.unicode === currentSourceUnicode) {
                                    indicesToUpdate.push(index);
                                }
                            });
                    
                            if (indicesToUpdate.length > 0) {
                                let tempPaths = dependentGlyphData.paths;
                                const strokeThickness = settings?.strokeThickness ?? 1;
                                const sourceGlyphData = calculationSourceMap.get(currentSourceUnicode);
                                
                                if (sourceGlyphData) {
                                    let pathsNeedRegeneration = false;
                                    for (const index of indicesToUpdate) {
                                        const updatedPaths = updateComponentInPaths(
                                            tempPaths,
                                            index,
                                            sourceGlyphData.paths,
                                            strokeThickness,
                                            dependentChar.compositeTransform
                                        );

                                        if (!updatedPaths) {
                                            pathsNeedRegeneration = true;
                                            break;
                                        }
                                        tempPaths = updatedPaths;
                                    }
                            
                                    if (pathsNeedRegeneration) {
                                        const regenerated = generateCompositeGlyphData({ 
                                            character: dependentChar, 
                                            allCharsByName, 
                                            allGlyphData: calculationSourceMap, 
                                            settings: settings!, 
                                            metrics: metrics!, 
                                            markAttachmentRules, 
                                            allCharacterSets: characterSets! 
                                        });
                                        if(regenerated) resultData = regenerated;
                                    } else {
                                        resultData = { paths: tempPaths };
                                    }
                                }
                            }
                        }

                        if (resultData) {
                            updates.set(depUnicode, resultData);
                            calculationSourceMap.set(depUnicode, resultData); // Update local view for next steps
                            visited.add(depUnicode);
                            queue.push(depUnicode);
                            totalUpdatedCount++;
                        }

                        // Yield to main thread to prevent freezing
                        processedInBatch++;
                        if (processedInBatch >= BATCH_SIZE) {
                            processedInBatch = 0;
                            await yieldToMain();
                        }
                    }
                }

                if (!isMounted.current) return; // Final check before dispatch

                // Final Commit: OPTIMIZED batch update
                if (updates.size > 0) {
                    glyphDataDispatch({ 
                        type: 'BATCH_UPDATE_GLYPHS', 
                        payload: Array.from(updates.entries()) 
                    });
                }

                totalUpdatedCount += positionedPairCount;

                if (totalUpdatedCount > 0) {
                    layout.showNotification(
                        t('updatedDependents', { count: totalUpdatedCount }),
                        'success',
                    );
                } else if (!silent) {
                    layout.showNotification(t('saveGlyphSuccess'));
                }
            }, 0);
            
        } else {
             if (!silent) {
                layout.showNotification(t('saveGlyphSuccess'));
            }
        }
        
        if (onSuccess) onSuccess();

    }, [allCharsByUnicode, glyphDataMap, dependencyMap, markPositioningMap, characterSets, glyphDataDispatch, characterDispatch, positioningDispatch, layout, settings, metrics, markAttachmentRules, allCharsByName, t]);

    const handleDeleteGlyph = useCallback((unicode: number) => {
        const charToDelete = allCharsByUnicode.get(unicode); if (!charToDelete) return;
        
        // Snapshot for Undo (Synchronous part is fine for delete usually)
        const glyphDataSnapshot = new Map(glyphDataMap);
        const characterSetsSnapshot = deepClone(characterSets);
        const kerningSnapshot = new Map(kerningMap);
        const positioningSnapshot = new Map(markPositioningMap);
        const dependencySnapshot = new Map(dependencyMap.current);
        
        const undo = () => {
            glyphDataDispatch({ type: 'SET_MAP', payload: glyphDataSnapshot });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: characterSetsSnapshot });
            kerningDispatch({ type: 'SET_MAP', payload: kerningSnapshot });
            positioningDispatch({ type: 'SET_MAP', payload: positioningSnapshot });
            dependencyMap.current = dependencySnapshot;
        };

        const dependents = dependencyMap.current.get(unicode);
        
        // Handle Deletion Updates (Synchronous for now to ensure consistency before delete)
        // We might make this async later if deleting complex trees, but usually delete is fast enough.
        if (dependents && dependents.size > 0) {
            const dependentUnicodes = Array.from(dependents);
            const dependentNames: string[] = [];
            
            // Visual Update (Bake/Flatten Composites)
            // We need to calculate the new states for dependents before deleting the source.
            const batchUpdates: [number, GlyphData][] = [];
            
            dependentUnicodes.forEach((depUni: number) => {
                const depChar = allCharsByUnicode.get(depUni);
                if (depChar) dependentNames.push(depChar.name);
                // Attempt to regenerate/bake current state before source is lost
                if (depChar && (depChar.link || depChar.composite)) {
                    const compositeData = generateCompositeGlyphData({
                        character: depChar,
                        allCharsByName,
                        allGlyphData: glyphDataMap, // Use current state before delete
                        settings: settings!,
                        metrics: metrics!,
                        markAttachmentRules,
                        allCharacterSets: characterSets!
                    });
                    if (compositeData) {
                        batchUpdates.push([depUni, compositeData]);
                    }
                }
            });
            
            // Apply baked data to dependents
            if (batchUpdates.length > 0) {
                glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: batchUpdates });
            }

            // Metadata Update (Sever Links)
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
                            return newChar;
                        }
                        return char;
                    })
                }));
            }});
            
            dependencyMap.current.delete(unicode);
        }

        // Clean up auxiliary maps
        const newKerningMap = new Map<string, number>();
        kerningMap.forEach((value, key) => {
            const [left, right] = key.split('-').map(Number);
            if (left !== unicode && right !== unicode) {
                newKerningMap.set(key, value);
            }
        });

        const newPositioningMap = new Map<string, Point>();
        markPositioningMap.forEach((value, key) => {
            const [base, mark] = key.split('-').map(Number);
            if (base !== unicode && mark !== unicode) {
                newPositioningMap.set(key, value);
            }
        });

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

    const handleAddGlyph = useCallback((charData: { unicode?: number; name: string }, targetSetName?: string) => {
        let finalUnicode = charData.unicode;
        let isPuaAssigned = false;
        
        // Handle name mapping if no unicode provided
        if (finalUnicode === undefined) {
             const lowerName = charData.name.trim().toLowerCase();
             if (STANDARD_NAMES[lowerName]) {
                 finalUnicode = STANDARD_NAMES[lowerName];
                 // Ensure this standard mapped unicode doesn't clash
                 if (allCharsByUnicode.has(finalUnicode)) {
                     // If it clashes, we can't use the standard map. Fallback to PUA.
                     finalUnicode = undefined;
                 }
             }
        }
    
        if (finalUnicode === undefined) {
            // Use atomic PUA generator to prevent race conditions
            finalUnicode = getNextAtomicPua();
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

        // Use the passed targetSetName, or default to a generic fallback if not provided
        characterDispatch({ type: 'ADD_CHARACTERS', payload: { characters: [newChar], activeTabNameKey: targetSetName || '' } });

        layout.closeModal();
        layout.showNotification(t('glyphAddedSuccess', { name: newChar.name }));
        layout.selectCharacter(newChar);
    }, [characterDispatch, layout, t, allCharsByUnicode, getNextAtomicPua]);
    
    // New function for direct quick add without modal
    const handleQuickAddGlyph = useCallback((input: string, targetSetName: string = 'Custom Glyphs') => {
        const trimmedInput = input.trim();
        if (!trimmedInput) return;

        // Validation logic similar to AddGlyphModal
        if (allCharsByName.has(trimmedInput)) {
            layout.showNotification(t('errorNameExists'), 'error');
            return;
        }

        let unicode: number | undefined;
        let name: string = trimmedInput;
        
        // Check if it's a Hex code (e.g., U+0041 or 0041)
        const hexMatch = trimmedInput.match(/^(?:U\+)?([0-9a-fA-F]{1,6})$/);
        
        if (hexMatch) {
            // It looks like a hex code
            const potentialUnicode = parseInt(hexMatch[1], 16);
            if (!isNaN(potentialUnicode) && potentialUnicode <= 0x10FFFF) {
                if (allCharsByUnicode.has(potentialUnicode)) {
                    const existing = allCharsByUnicode.get(potentialUnicode);
                    layout.showNotification(t('errorGlyphExists', { 
                        codepoint: potentialUnicode.toString(16).toUpperCase().padStart(4, '0'), 
                        name: existing?.name || '' 
                    }), 'error');
                    return;
                }
                unicode = potentialUnicode;
                // If the input was just the hex code, assume the name is the character itself
                if (trimmedInput.toUpperCase() === hexMatch[1] || trimmedInput.toUpperCase() === `U+${hexMatch[1]}`) {
                    name = String.fromCodePoint(unicode);
                    // Check if name exists again (since we just derived it)
                     if (allCharsByName.has(name)) {
                        layout.showNotification(t('errorNameExists'), 'error');
                        return;
                    }
                }
            }
        }
        
        // If not a hex code (or if name derivation failed/wasn't done), treat as character input
        if (unicode === undefined) {
             if ([...trimmedInput].length === 1) {
                // Single character
                unicode = trimmedInput.codePointAt(0);
                if (unicode && allCharsByUnicode.has(unicode)) {
                    layout.showNotification(t('errorUnicodeFromCharExists', { 
                        char: trimmedInput, 
                        codepoint: unicode.toString(16).toUpperCase() 
                    }), 'error');
                    return;
                }
             } else {
                 // Multi-character string -> PUA or Standard Map
                 // Logic handled inside handleAddGlyph
                 unicode = undefined; 
             }
        }
        
        // Call existing add logic
        handleAddGlyph({ unicode, name }, targetSetName);

    }, [allCharsByName, allCharsByUnicode, handleAddGlyph, layout, t]);


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
                // OPTIMIZED: Use SET_GLYPH
                glyphDataDispatch({ type: 'SET_GLYPH', payload: { unicode, data: compositeData } });
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
    
    const handleUpdateDependencies = useCallback((unicode: number, newLinkComponents: string[] | null) => {
        const currentChar = allCharsByUnicode.get(unicode);
        const oldComponents = currentChar?.link || currentChar?.composite;

        if (oldComponents) {
            oldComponents.forEach(compName => {
                const compChar = allCharsByName.get(compName);
                if (compChar && compChar.unicode !== undefined) {
                    const dependents = dependencyMap.current.get(compChar.unicode);
                    if (dependents) {
                        dependents.delete(unicode);
                    }
                }
            });
        }

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
    
        // OPTIMIZED: Use BATCH_UPDATE_GLYPHS
        glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: glyphsToImport });

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
        handleQuickAddGlyph, // Exported
        handleUnlockGlyph,
        handleRelinkGlyph,
        handleUpdateDependencies,
        handleImportGlyphs,
        handleAddBlock,
        handleCheckGlyphExists,
        handleCheckNameExists,
    };
};
