
import { useState, useEffect, useRef, useCallback } from 'react';
import { Path, Character, GlyphData, AppSettings, FontMetrics, MarkAttachmentRules, CharacterSet } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData } from '../../services/glyphRenderService';
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
    onSave: (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }, onSuccess?: () => void, options?: SaveOptions) => void;
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
        // Check for prefill on mount
        const initiallyDrawn = isGlyphDrawn(glyphData);
        const prefillSource = character.link || character.composite;
        const isPrefillEnabled = settings.isPrefillEnabled !== false;

        // Force regeneration if it's a Linked Glyph (to get latest component state)
        // OR if it's a Composite/Template that hasn't been drawn yet.
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

    // Used to track "dirty" state against what was loaded/saved.
    const [initialPathsOnLoad, setInitialPathsOnLoad] = useState<Path[]>(() => {
        return isGlyphDrawn(glyphData) ? (glyphData!.paths || []) : [];
    });
    
    // Tracks if any changes have happened that require a full commit (cascade update)
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
    
    const [isTransitioning] = useState(false); // Kept for interface compat
    const autosaveTimeout = useRef<number | null>(null);
    
    // Navigation State
    const [pendingNavigation, setPendingNavigation] = useState<Character | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

    // --- NOTIFICATIONS ON MOUNT ---
    useEffect(() => {
        const componentNames = character.link || character.composite;
        
        // 1. Check for missing components if composite/linked and currently empty
        if (componentNames && componentNames.length > 0 && currentPaths.length === 0) {
             const missingComponents: string[] = [];
             
             // Create a quick lookup for name -> char to get unicode
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
                     // If char not found or no unicode, assume missing/undrawn
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

        // 2. Existing Prefill Notification
        // Only show if it's a template composite (not linked) and was just filled
        const isPrefilled = currentPaths.length > 0 && !isGlyphDrawn(glyphData);
        if (isPrefilled && !character.link) {
            const hasSeen = checkAndSetFlag('composite_intro');
            const joiner = hasSeen ? ', ' : ' + ';
            const componentNamesStr = (character.composite || []).join(joiner);
            const messageKey = hasSeen ? 'compositeGlyphPrefilledShort' : 'compositeGlyphPrefilled';
            showNotification(t(messageKey, { components: componentNamesStr }), 'info');
        }
    }, []);

    // --- SAVING WRAPPER ---
    const performSave = useCallback((
        pathsToSave: Path[] = currentPaths, 
        options: SaveOptions = {}
    ) => {
        if (character.unicode === undefined) return;
        
        const onSuccess = () => {
            // Update our baseline for "clean" state
            setInitialPathsOnLoad(deepClone(pathsToSave));
            
            // If this was a commit (not draft), we clear the pending cascade flag
            if (!options.isDraft) {
                hasPendingCascade.current = false;
            }
        };

        // Note: The onSave callback from parent is typed to accept 'newBearings' object.
        // We are passing expanded metadata now. The implementation in useGlyphActions.ts handles this extension.
        // We cast to any to bypass strict type checking here as we updated the context/hook but interfaces might lag slightly.
        const metadata: any = { lsb, rsb, glyphClass, advWidth };
        
        onSave(character.unicode, { paths: pathsToSave }, metadata, onSuccess, options);
    }, [onSave, character.unicode, currentPaths, lsb, rsb, glyphClass, advWidth]);


    // --- HISTORY & AUTOSAVE ---
    const handlePathsChange = useCallback((newPaths: Path[]) => {
        // 1. Update History
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPaths);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        
        // 2. Update State
        setCurrentPaths(newPaths);
        hasPendingCascade.current = true;

        // 3. Trigger Autosave (Draft)
        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
            autosaveTimeout.current = window.setTimeout(() => {
                performSave(newPaths, { isDraft: true, silent: true });
            }, 500);
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, performSave]);

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

    // --- DIRTY STATE ---
    const hasPathChanges = JSON.stringify(currentPaths) !== JSON.stringify(initialPathsOnLoad);
    const hasBearingChanges = lsb !== character.lsb || rsb !== character.rsb;
    const hasMetadataChanges = hasBearingChanges || glyphClass !== character.glyphClass || advWidth !== character.advWidth;
    const hasUnsavedChanges = hasPathChanges || hasMetadataChanges;

    // --- INITIAL AUTOSAVE FOR PREFILL OR REGENERATION ---
    useEffect(() => {
        if (settings.isAutosaveEnabled && hasUnsavedChanges) {
             if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
             autosaveTimeout.current = window.setTimeout(() => {
                performSave(currentPaths, { isDraft: true, silent: true });
            }, 500);
        }
    }, []);

    // --- AUTOSAVE FOR METADATA ---
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


    // --- NAVIGATION & CLOSING ---
    const handleNavigationAttempt = useCallback((targetCharacter: Character | null) => {
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);

        const proceed = () => {
            if (targetCharacter) onNavigate(targetCharacter);
            else onClose();
        };

        if (settings.isAutosaveEnabled) {
            // Force a commit save (cascade updates) if anything was touched
            if (hasPendingCascade.current || hasUnsavedChanges) {
                performSave(currentPaths, { isDraft: false, silent: true });
            }
            proceed();
        } else if (hasUnsavedChanges) {
            setPendingNavigation(targetCharacter); 
            setIsUnsavedModalOpen(true);
        } else {
            proceed();
        }
    }, [settings.isAutosaveEnabled, hasUnsavedChanges, performSave, currentPaths, onNavigate, onClose]);

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
