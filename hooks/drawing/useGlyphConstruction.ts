
import { useState, useMemo, useCallback } from 'react';
import { Character, GlyphData, CharacterSet, ComponentTransform, FontMetrics, MarkAttachmentRules } from '../../types';
import { generateCompositeGlyphData } from '../../services/glyphRenderService';

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
                                if (transforms && transforms.length > 0) updated.compositeTransform = transforms;
                                else delete updated.compositeTransform;
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
                compositeTransform: transforms 
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
