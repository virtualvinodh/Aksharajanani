import { useState, useEffect, useRef, useCallback } from 'react';
import { Path, Character, GlyphData, AppSettings, FontMetrics, MarkAttachmentRules, CharacterSet, ComponentTransform } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData, getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { SaveOptions } from '../actions/useGlyphActions';
import { deepClone } from '../../utils/cloneUtils';
import { useRules } from '../../contexts/RulesContext';

interface UseGlyphEditSessionProps {
    character: Character;
    glyphData: GlyphData | undefined;
    allGlyphData: Map<number, GlyphData>;
    allCharacterSets: CharacterSet[];
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    onSave: (unicode: number, newGlyphData: GlyphData, newMetadata: any, onSuccess?: () => void, options?: SaveOptions) => void;
    onNavigate: (character: Character) => void;
    onClose: () => void;
}

export const useGlyphEditSession = ({
    character,
    glyphData,
    allGlyphData,
    allCharacterSets,
    settings,
    metrics,
    markAttachmentRules,
    onSave,
    onNavigate,
    onClose
}: UseGlyphEditSessionProps) => {
    const { t } = useLocale();
    const { showNotification, checkAndSetFlag } = useLayout();
    const { state: rulesState } = useRules();
    const groups = rulesState.fontRules?.groups || {};

    // --- STATE INITIALIZATION ---
    
    const [currentPaths, setCurrentPaths] = useState<Path[]>(() => {
        const initiallyDrawn = isGlyphDrawn(glyphData);
        const prefillSource = character.link || character.composite;
        const isPrefillEnabled = settings.isPrefillEnabled !== false;

        const shouldRegenerate = (!!character.link) || (isPrefillEnabled && prefillSource && !initiallyDrawn);

        if (shouldRegenerate) {
             const allCharsByName = new Map<string, Character>();
             allCharacterSets.flatMap(set => set.characters).forEach(char => allCharsByName.set(char.name, char));

             const compositeGlyphData = generateCompositeGlyphData({
                character,
                allCharsByName,
                allGlyphData,
                settings,
                metrics,
                markAttachmentRules,
                allCharacterSets,
                groups
            });
            if (compositeGlyphData) return compositeGlyphData.paths;
        }
        return glyphData?.paths || [];
    });

    const [initialPathsOnLoad, setInitialPathsOnLoad] = useState<Path[]>(() => {
        return isGlyphDrawn(glyphData) ? (glyphData!.paths || []) : [];
    });
    
    const hasPendingCascade = useRef(false);
    
    const [wasEmptyOnLoad] = useState(() => {
        return !isGlyphDrawn(glyphData);
    });

    const [history, setHistory] = useState<Path[][]>([currentPaths]);
    const [historyIndex, setHistoryIndex] = useState(0);
    
    // Metadata States
    const [lsb, setLsbState] = useState<number | undefined>(character.lsb);
    const [rsb, setRsbState] = useState<number | undefined>(character.rsb);
    const [glyphClass, setGlyphClassState] = useState<Character['glyphClass']>(character.glyphClass);
    const [advWidth, setAdvWidthState] = useState<number | string | undefined>(character.advWidth);
    const [position, setPositionState] = useState<[string, string] | undefined>(character.position);
    const [kern, setKernState] = useState<[string, string] | undefined>(character.kern);
    const [gpos, setGposState] = useState<string | undefined>(character.gpos);
    const [gsub, setGsubState] = useState<string | undefined>(character.gsub);
    const [link, setLinkState] = useState<string[] | undefined>(character.link);
    const [composite, setCompositeState] = useState<string[] | undefined>(character.composite);
    const [liga, setLigaState] = useState<string[] | undefined>(character.liga);
    const [compositeTransform, setCompositeTransformState] = useState<ComponentTransform[] | undefined>(character.compositeTransform);

    // --- SYNCHRONOUS METADATA TRACKING ---
    const metaRef = useRef({ lsb, rsb, glyphClass, advWidth, position, kern, gpos, gsub, link, composite, liga, compositeTransform });
    
    useEffect(() => {
        metaRef.current = { lsb, rsb, glyphClass, advWidth, position, kern, gpos, gsub, link, composite, liga, compositeTransform };
    }, [lsb, rsb, glyphClass, advWidth, position, kern, gpos, gsub, link, composite, liga, compositeTransform]);

    // --- EXTERNAL PROP SYNC ---
    // Critical: Listen for external updates (e.g. from Properties Panel) to avoid stale overwrites
    useEffect(() => {
        setLsbState(character.lsb);
        setRsbState(character.rsb);
        setGlyphClassState(character.glyphClass);
        setAdvWidthState(character.advWidth);
        setPositionState(character.position);
        setKernState(character.kern);
        setGposState(character.gpos);
        setGsubState(character.gsub);
        setLinkState(character.link);
        setCompositeState(character.composite);
        setLigaState(character.liga);
        setCompositeTransformState(character.compositeTransform);
        
        // Reset the "Saved Base" for path tracking to prevent the app from thinking 
        // newly applied construction changes are unsaved local modifications.
        if (glyphData) {
            setInitialPathsOnLoad(deepClone(glyphData.paths || []));
        }
        
        hasPendingCascade.current = false;
    }, [character, glyphData]);

    const setLsb = (val: number | undefined) => {
        setLsbState(val);
        hasPendingCascade.current = true;
    };
    
    const setRsb = (val: number | undefined) => {
        setRsbState(val);
        hasPendingCascade.current = true;
    };

    const setGlyphClass = (val: Character['glyphClass']) => {
        setGlyphClassState(val);
        hasPendingCascade.current = true;
    };
    
    const setAdvWidth = (val: number | string | undefined) => {
        setAdvWidthState(val);
        hasPendingCascade.current = true;
    };

    const setGpos = (val: string | undefined) => {
        setGposState(val);
        hasPendingCascade.current = true;
    };

    const setGsub = (val: string | undefined) => {
        setGsubState(val);
        hasPendingCascade.current = true;
    };

    const setLink = (val: string[] | undefined) => {
        setLinkState(val);
        hasPendingCascade.current = true;
    };

    const setComposite = (val: string[] | undefined) => {
        setCompositeState(val);
        hasPendingCascade.current = true;
    };

    const setLiga = (val: string[] | undefined) => {
        setLigaState(val);
        hasPendingCascade.current = true;
    };

    const setPosition = (val: [string, string] | undefined) => {
        setPositionState(val);
        hasPendingCascade.current = true;
    };

    const setKern = (val: [string, string] | undefined) => {
        setKernState(val);
        hasPendingCascade.current = true;
    };

    const setCompositeTransform = (val: ComponentTransform[] | undefined) => {
        setCompositeTransformState(val);
        hasPendingCascade.current = true;
    };
    
    const [isTransitioning] = useState(false);
    const autosaveTimeout = useRef<number | null>(null);
    
    const [pendingNavigation, setPendingNavigation] = useState<Character | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

    useEffect(() => {
        const componentNames = character.link || character.composite;
        if (componentNames && componentNames.length > 0 && currentPaths.length === 0) {
             const missingComponents: string[] = [];
             const tempAllCharsByName = new Map<string, Character>();
             allCharacterSets.flatMap(set => set.characters).forEach(char => tempAllCharsByName.set(char.name, char));

             componentNames.forEach(name => {
                 const compChar = tempAllCharsByName.get(name);
                 if (compChar && compChar.unicode !== undefined) {
                     const compData = allGlyphData.get(compChar.unicode);
                     if (!isGlyphDrawn(compData)) {
                         missingComponents.push(name);
                     }
                 } else {
                     missingComponents.push(name);
                 }
             });

             if (missingComponents.length > 0) {
                 setTimeout(() => {
                     showNotification(t('errorComponentsNotDrawn', { components: missingComponents.join(', ') }), 'error');
                 }, 100);
                 return;
             }
        }

        const isPrefilled = currentPaths.length > 0 && !isGlyphDrawn(glyphData);
        if (isPrefilled && !character.link) {
            const hasSeen = checkAndSetFlag('composite_intro');
            const joiner = hasSeen ? ', ' : ' + ';
            const componentNamesStr = (character.composite || []).join(joiner);
            const messageKey = hasSeen ? 'compositeGlyphPrefilledShort' : 'compositeGlyphPrefilled';
            showNotification(t(messageKey, { components: componentNamesStr }), 'info');
        }
    }, []);

    const performSave = useCallback((
        pathsToSave: Path[] = currentPaths, 
        options: SaveOptions = {},
        metadataOverride?: any
    ) => {
        if (character.unicode === undefined) return;
        
        const onSuccess = () => {
            setInitialPathsOnLoad(deepClone(pathsToSave));
            if (!options.isDraft) {
                hasPendingCascade.current = false;
            }
        };

        const metadata: any = metadataOverride || metaRef.current;
        onSave(character.unicode, { paths: pathsToSave }, metadata, onSuccess, options);
    }, [onSave, character.unicode, currentPaths]);


    const handlePathsChange = useCallback((newPaths: Path[]) => {
        let updatedTransforms = metaRef.current.compositeTransform ? [...metaRef.current.compositeTransform] : [];
        const componentsList = character.link || character.composite;

        if (componentsList && componentsList.length > 0) {
            let metadataChanged = false;

            for (let i = 0; i < componentsList.length; i++) {
                const groupId = `component-${i}`;
                const oldCompPaths = currentPaths.filter(p => p.groupId === groupId);
                const newCompPaths = newPaths.filter(p => p.groupId === groupId);
                
                if (oldCompPaths.length > 0 && newCompPaths.length > 0) {
                    const oldBbox = getAccurateGlyphBBox(oldCompPaths, settings.strokeThickness);
                    const newBbox = getAccurateGlyphBBox(newCompPaths, settings.strokeThickness);
                    
                    if (oldBbox && newBbox) {
                        const dx = newBbox.x - oldBbox.x;
                        const dy = newBbox.y - oldBbox.y;
                        
                        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                            if (!updatedTransforms[i]) {
                                updatedTransforms[i] = { scale: 1, x: 0, y: 0, mode: 'relative' };
                            } else {
                                updatedTransforms[i] = { ...updatedTransforms[i] };
                            }
                            updatedTransforms[i].x = Math.round((updatedTransforms[i].x || 0) + dx);
                            updatedTransforms[i].y = Math.round((updatedTransforms[i].y || 0) + dy);
                            metadataChanged = true;
                        }
                    }
                }
            }

            if (metadataChanged) {
                setCompositeTransform(updatedTransforms);
                metaRef.current.compositeTransform = updatedTransforms;
            }
        }

        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPaths);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        
        setCurrentPaths(newPaths);
        hasPendingCascade.current = true;

        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => {
                performSave(newPaths, { isDraft: true, silent: true });
            }, 500);
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, performSave, currentPaths, character, settings.strokeThickness]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const newPaths = history[newIndex];
            setCurrentPaths(newPaths);
            hasPendingCascade.current = true;
            
            if (settings.isAutosaveEnabled) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = window.setTimeout(() => performSave(newPaths, { isDraft: true, silent: true }), 500);
            }
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, performSave]);
    
    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const newPaths = history[newIndex];
            setCurrentPaths(newPaths);
            hasPendingCascade.current = true;

            if (settings.isAutosaveEnabled) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = window.setTimeout(() => performSave(newPaths, { isDraft: true, silent: true }), 500);
            }
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, performSave]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    const hasPathChanges = JSON.stringify(currentPaths) !== JSON.stringify(initialPathsOnLoad);
    const hasMetadataChanges = lsb !== character.lsb || 
                                rsb !== character.rsb || 
                                glyphClass !== character.glyphClass || 
                                advWidth !== character.advWidth || 
                                JSON.stringify(position) !== JSON.stringify(character.position) || 
                                JSON.stringify(kern) !== JSON.stringify(character.kern) || 
                                gpos !== character.gpos || 
                                gsub !== character.gsub || 
                                JSON.stringify(link) !== JSON.stringify(character.link) || 
                                JSON.stringify(composite) !== JSON.stringify(character.composite) || 
                                JSON.stringify(liga) !== JSON.stringify(character.liga) || 
                                JSON.stringify(compositeTransform) !== JSON.stringify(character.compositeTransform);
    const hasUnsavedChanges = hasPathChanges || hasMetadataChanges;

    useEffect(() => {
        if (settings.isAutosaveEnabled && hasUnsavedChanges) {
             if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
             autosaveTimeout.current = window.setTimeout(() => {
                performSave(currentPaths, { isDraft: true, silent: true });
            }, 500);
        }
    }, []);

    useEffect(() => {
        if (settings.isAutosaveEnabled && hasMetadataChanges) {
             if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
            autosaveTimeout.current = window.setTimeout(() => {
                performSave(currentPaths, { isDraft: true, silent: true });
            }, 500);
        }
    }, [settings.isAutosaveEnabled, hasMetadataChanges, performSave, currentPaths]);


    const handleNavigationAttempt = useCallback((targetCharacter: Character | null) => {
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);

        const proceed = () => {
            if (targetCharacter) onNavigate(targetCharacter);
            else onClose();
        };

        // Check against current local variables AND the metaRef for the most accurate dirty check
        const isDirty = hasUnsavedChanges || (JSON.stringify(metaRef.current.compositeTransform) !== JSON.stringify(character.compositeTransform));

        if (settings.isAutosaveEnabled) {
            if (hasPendingCascade.current || isDirty) {
                performSave(currentPaths, { isDraft: false, silent: true });
            }
            proceed();
        } else if (isDirty) {
            setPendingNavigation(targetCharacter); 
            setIsUnsavedModalOpen(true);
        } else {
            proceed();
        }
    }, [settings.isAutosaveEnabled, hasUnsavedChanges, performSave, currentPaths, onNavigate, onClose, character.compositeTransform]);

    const handleConfirmSave = () => {
        performSave(currentPaths, { isDraft: false });
        if (pendingNavigation) onNavigate(pendingNavigation);
        else onClose();
        
        setIsUnsavedModalOpen(false);
        setPendingNavigation(null);
    };

    const handleConfirmDiscard = () => {
        if (pendingNavigation) onNavigate(pendingNavigation);
        else onClose();
        setIsUnsavedModalOpen(false);
        setPendingNavigation(null);
    };

    const handleRefresh = useCallback(() => {
        const allCharsByName = new Map<string, Character>();
        allCharacterSets.flatMap(set => set.characters).forEach(char => allCharsByName.set(char.name, char));
        
        const compositeGlyphData = generateCompositeGlyphData({
            character,
            allCharsByName,
            allGlyphData,
            settings,
            metrics,
            markAttachmentRules,
            allCharacterSets,
            groups
        });
        
        if (compositeGlyphData) {
            handlePathsChange(compositeGlyphData.paths);
        }
        showNotification(t('glyphRefreshedSuccess'), 'info');
    }, [character, allCharacterSets, allGlyphData, settings, metrics, markAttachmentRules, handlePathsChange, showNotification, t, groups]);

    useEffect(() => {
        return () => {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
        };
    }, []);

    return {
        currentPaths,
        handlePathsChange,
        undo,
        redo,
        canUndo,
        canRedo,
        lsb,
        setLsb,
        rsb,
        setRsb,
        glyphClass,
        setGlyphClass,
        advWidth,
        setAdvWidth,
        position, setPosition,
        kern, setKern,
        gpos, setGpos,
        gsub, setGsub,
        link, setLink,
        composite, setComposite,
        liga, setLiga,
        compositeTransform, setCompositeTransform,
        isTransitioning,
        hasUnsavedChanges,
        handleSave: () => performSave(currentPaths, { isDraft: false }), 
        handleRefresh,
        handleNavigationAttempt,
        wasEmptyOnLoad,
        isUnsavedModalOpen,
        closeUnsavedModal: () => setIsUnsavedModalOpen(false),
        confirmSave: handleConfirmSave,
        confirmDiscard: handleConfirmDiscard
    };
};