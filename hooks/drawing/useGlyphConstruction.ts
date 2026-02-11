
import { useState, useMemo, useCallback } from 'react';
import { Character, GlyphData, CharacterSet, ComponentTransform, FontMetrics, MarkAttachmentRules, Path } from '../../types';
import { generateCompositeGlyphData, getAccurateGlyphBBox, calculateDefaultMarkOffset } from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';
import { deepClone } from '../../utils/cloneUtils';

interface UseGlyphConstructionProps {
    character: Character;
    currentPaths: any[];
    allCharsByName: Map<string, Character>;
    allGlyphData: Map<number, GlyphData>;
    allCharacterSets: CharacterSet[];
    settings: any;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    groups: Record<string, string[]>;
    characterDispatch: any;
    glyphDataDispatch: any;
    onUpdateDependencies: (unicode: number, components: string[] | null) => void;
    handlePathsChange: (paths: any[]) => void;
    showNotification: (msg: string, type?: 'success' | 'info' | 'error') => void;
    t: (key: string) => string;
}

export const useGlyphConstruction = ({
    character, currentPaths, allCharsByName, allGlyphData, allCharacterSets, settings, metrics, 
    markAttachmentRules, groups, characterDispatch, glyphDataDispatch, onUpdateDependencies, 
    handlePathsChange, showNotification, t
}: UseGlyphConstructionProps) => {
    const [isConstructionWarningOpen, setIsConstructionWarningOpen] = useState(false);
    const [pendingConstruction, setPendingConstruction] = useState<any>(null);

    const isLocked = !!character.link;
    const isComposite = !!character.composite && character.composite.length > 0;

    const executeConstructionUpdate = useCallback((type: 'drawing' | 'composite' | 'link', components: string[], transforms?: ComponentTransform[]) => {
        if (character.unicode === undefined) return;
        
        let calculatedTransforms: ComponentTransform[] | undefined = transforms;

        // For Linked Glyphs, force Absolute Positioning to ensure independent movement
        if (type === 'link' && components.length > 0) {
            const newTransforms: ComponentTransform[] = [];
            let accumulatedPaths: Path[] = [];

            components.forEach((name, index) => {
                const compChar = allCharsByName.get(name);
                const compGlyph = compChar?.unicode !== undefined ? allGlyphData.get(compChar.unicode) : undefined;
                const manualT = transforms?.[index];

                if (!compChar || !compGlyph || !compGlyph.paths || compGlyph.paths.length === 0) {
                     // If component is missing or empty, preserve manual values or default to zero
                     newTransforms.push({ 
                         x: manualT?.x ?? 0, 
                         y: manualT?.y ?? 0, 
                         scale: manualT?.scale ?? 1, 
                         rotation: manualT?.rotation ?? 0,
                         mode: 'absolute' 
                     });
                     return;
                }

                const compPaths = deepClone(compGlyph.paths);
                let targetX = 0;
                let targetY = 0;

                // Priority Logic:
                // 1. If user provided an Absolute transform (manual edit), use it.
                // 2. If user provided Relative/Touching (or it's new), calculate the Auto position.
                //    - Allows smart placement of new components while respecting manual edits of existing ones.

                if (manualT && manualT.mode === 'absolute') {
                    targetX = manualT.x || 0;
                    targetY = manualT.y || 0;
                } else {
                    // Calculate Auto-Layout Offset (Relative logic converted to Absolute)
                    let autoOffsetX = 0;
                    let autoOffsetY = 0;

                    if (index > 0) {
                         const baseBbox = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
                         const markBbox = getAccurateGlyphBBox(compPaths, settings.strokeThickness);
                         
                         if (manualT && manualT.mode === 'touching') {
                             if (baseBbox && markBbox) {
                                 autoOffsetX = (baseBbox.x + baseBbox.width) - markBbox.x;
                             }
                         } else {
                             // Default Relative
                             const prevChar = allCharsByName.get(components[index-1]) || compChar;
                             const offset = calculateDefaultMarkOffset(
                                prevChar,
                                compChar,
                                baseBbox,
                                markBbox,
                                markAttachmentRules,
                                metrics,
                                allCharacterSets,
                                false, 
                                groups
                            );
                            autoOffsetX = offset.x;
                            autoOffsetY = offset.y;
                         }
                    }
                    
                    // Add any manual relative tweak to the auto position
                    targetX = autoOffsetX + (manualT?.x || 0);
                    targetY = autoOffsetY + (manualT?.y || 0);
                }
                
                newTransforms.push({ 
                    x: targetX, 
                    y: targetY, 
                    scale: manualT?.scale ?? 1, 
                    rotation: manualT?.rotation ?? 0,
                    mode: 'absolute' 
                });
                
                // Accumulate paths for next iteration's bbox calculation using the new absolute coordinates
                const shifted = compPaths.map(p => ({
                    ...p,
                    points: p.points.map(pt => VEC.add(pt, { x: targetX, y: targetY })),
                    segmentGroups: p.segmentGroups?.map(g => g.map(s => ({...s, point: VEC.add(s.point, { x: targetX, y: targetY })})))
                }));
                accumulatedPaths = [...accumulatedPaths, ...shifted];
            });
            calculatedTransforms = newTransforms;
        }

        characterDispatch({
            type: 'UPDATE_CHARACTER_SETS',
            payload: (prevSets: CharacterSet[] | null) => {
                if (!prevSets) return null;
                return prevSets.map(set => ({
                    ...set,
                    characters: set.characters.map(c => {
                        if (c.unicode === character.unicode) {
                            const updated = { ...c };
                            if (type === 'drawing') {
                                delete updated.link; 
                                delete updated.composite; 
                                delete updated.compositeTransform;
                            } else if (type === 'link' || type === 'composite') {
                                if (type === 'link') { 
                                    updated.link = components; 
                                    delete updated.composite; 
                                } else { 
                                    updated.composite = components; 
                                    delete updated.link; 
                                }
                                
                                if (calculatedTransforms && calculatedTransforms.length > 0) {
                                    updated.compositeTransform = calculatedTransforms;
                                } else if (transforms && transforms.length > 0) {
                                    updated.compositeTransform = transforms;
                                } else {
                                    delete updated.compositeTransform;
                                }
                            }
                            return updated;
                        }
                        return c;
                    })
                }));
            }
        });

        onUpdateDependencies(character.unicode, (type === 'link' || type === 'composite') ? components : null);

        if (type === 'link' || type === 'composite') {
            const tempChar: Character = { 
                ...character, 
                link: type === 'link' ? components : undefined, 
                composite: type === 'composite' ? components : undefined, 
                compositeTransform: calculatedTransforms || transforms 
            };
            const compositeData = generateCompositeGlyphData({ 
                character: tempChar, 
                allCharsByName, 
                allGlyphData, 
                settings, 
                metrics, 
                markAttachmentRules, 
                allCharacterSets, 
                groups 
            });

            if (compositeData) {
                handlePathsChange(compositeData.paths);
                glyphDataDispatch({ 
                    type: 'SET_GLYPH', 
                    payload: { unicode: character.unicode, data: compositeData } 
                });
            } else { 
                handlePathsChange([]); 
            }
        }
        
        showNotification(t('glyphRefreshedSuccess'), 'success');
        setIsConstructionWarningOpen(false); 
        setPendingConstruction(null);
    }, [character, characterDispatch, onUpdateDependencies, allCharsByName, allGlyphData, settings, metrics, markAttachmentRules, allCharacterSets, groups, handlePathsChange, glyphDataDispatch, showNotification, t]);

    const handleSaveConstruction = useCallback((type: 'drawing' | 'composite' | 'link', components: string[], transforms?: ComponentTransform[]) => {
        const hasContent = currentPaths.length > 0;
        // Warn if we are overwriting manual drawing with a template
        if (!(isLocked || isComposite) && (type === 'link' || type === 'composite') && hasContent) {
            setPendingConstruction({ type, components, transforms });
            setIsConstructionWarningOpen(true);
        } else { 
            executeConstructionUpdate(type, components, transforms); 
        }
    }, [currentPaths.length, isLocked, isComposite, executeConstructionUpdate]);

    const dependentsCount = useMemo(() => {
        if (!character || !allCharacterSets) return 0;
        let count = 0;
        allCharacterSets.forEach(set => {
            set.characters.forEach(c => {
                const components = c.link || c.composite;
                if (components && components.includes(character.name)) count++;
            });
        });
        return count;
    }, [character, allCharacterSets]);

    return {
        isLocked,
        isComposite,
        executeConstructionUpdate,
        handleSaveConstruction,
        isConstructionWarningOpen,
        setIsConstructionWarningOpen,
        pendingConstruction,
        dependentsCount
    };
};
