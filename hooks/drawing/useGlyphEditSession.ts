
import { useState, useEffect, useRef, useCallback } from 'react';
import { Path, Character, GlyphData, AppSettings, FontMetrics, MarkAttachmentRules, CharacterSet } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData } from '../../services/glyphRenderService';

interface UseGlyphEditSessionProps {
    character: Character;
    glyphData: GlyphData | undefined;
    allGlyphData: Map<number, GlyphData>;
    allCharacterSets: CharacterSet[];
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    onSave: (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }, onSuccess: () => void, silent: boolean, skipCascade: boolean) => void;
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
    const { showNotification } = useLayout();

    const [currentPaths, setCurrentPaths] = useState<Path[]>([]);
    const [initialPathsOnLoad, setInitialPathsOnLoad] = useState<Path[]>([]);
    const [history, setHistory] = useState<Path[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    
    const [lsb, setLsb] = useState<number | undefined>(character.lsb);
    const [rsb, setRsb] = useState<number | undefined>(character.rsb);

    const [isTransitioning, setIsTransitioning] = useState(false);
    // New state to track if we need to run a cascade update even if paths are saved
    const [isCascadePending, setIsCascadePending] = useState(false);

    // New state: tracks if the glyph was empty when the session started.
    // This allows us to keep the background guide visible even after autosave updates the global context.
    const [wasEmptyOnLoad, setWasEmptyOnLoad] = useState(false);

    const prevCharUnicodeRef = useRef<number | undefined>(undefined);
    const autosaveTimeout = useRef<number | null>(null);
    
    // Navigation State
    const [pendingNavigation, setPendingNavigation] = useState<Character | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

    // --- INITIALIZATION & LOADING ---
    useEffect(() => {
        const characterChanged = prevCharUnicodeRef.current !== character.unicode;
        const isInitialMount = prevCharUnicodeRef.current === undefined;      

        const performUpdate = () => {
            // Clear pending autosaves when switching characters
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = null;
            }

            // Reset cascade pending flag on new char load
            setIsCascadePending(false);

            const loadedPaths = glyphData?.paths || [];
            const initiallyDrawn = isGlyphDrawn(glyphData);
            let isPrefilled = false;
    
            const allCharsByName = new Map<string, Character>();
            allCharacterSets.flatMap(set => set.characters).forEach(char => allCharsByName.set(char.name, char));
    
            const prefillSource = character.link || character.composite;
            const isPrefillEnabled = settings.isPrefillEnabled !== false;
    
            if (isPrefillEnabled && prefillSource && !initiallyDrawn) {
                const compositeGlyphData = generateCompositeGlyphData({
                    character,
                    allCharsByName,
                    allGlyphData,
                    settings,
                    metrics,
                    markAttachmentRules,
                    allCharacterSets
                });
                
                if (compositeGlyphData) {
                    isPrefilled = true;
                    setCurrentPaths(compositeGlyphData.paths);
                    setHistory([compositeGlyphData.paths]);
                    setHistoryIndex(0);
                }
            }
            
            if (!isPrefilled) {
                setInitialPathsOnLoad(JSON.parse(JSON.stringify(loadedPaths)));
                setCurrentPaths(loadedPaths);
                setHistory([loadedPaths]);
                setHistoryIndex(0);
            }
            
            setLsb(character.lsb); 
            setRsb(character.rsb);

            // Set wasEmptyOnLoad based on the state at load time.
            // If prefilled, it counts as "not empty" so the user sees the prefill, not the guide.
            if (characterChanged || isInitialMount) {
                setWasEmptyOnLoad(!initiallyDrawn && !isPrefilled);
            }
            
            if (isPrefilled && !character.link) {
                const componentNames = (character.composite || []).join(' + ');
                showNotification(t('compositeGlyphPrefilled', { components: componentNames }), 'info');
            }
        };
        
        if (characterChanged) {
            // Navigation to a DIFFERENT character. Show animation and reset history.
            setIsTransitioning(true);
            setTimeout(() => {
                performUpdate();
                setTimeout(() => setIsTransitioning(false), 50);
            }, 150);
        } else if (isInitialMount) {
            // Initial Mount. Load data.
             performUpdate();
        } 
        // If same character (e.g., re-render due to autosave updating props), 
        // do nothing here to preserve local history state.
    
        prevCharUnicodeRef.current = character.unicode;
      
    }, [character, glyphData, allCharacterSets, markAttachmentRules, allGlyphData, settings.isPrefillEnabled, metrics, showNotification, t]);


    // --- SAVING ---
    const handleSave = useCallback((pathsToSave: Path[] = currentPaths, silent: boolean = false, skipCascade: boolean = false) => {
        if (character.unicode === undefined) return;
        const onSuccess = () => {
            setInitialPathsOnLoad(JSON.parse(JSON.stringify(pathsToSave)));
            // Only clear the pending cascade flag if we actually ran the cascade
            if (!skipCascade) {
                setIsCascadePending(false);
            }
        };
        onSave(character.unicode, { paths: pathsToSave }, { lsb, rsb }, onSuccess, silent, skipCascade);
    }, [onSave, character.unicode, currentPaths, lsb, rsb]);

    // --- HISTORY MANAGEMENT ---
    const handlePathsChange = useCallback((newPaths: Path[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPaths);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentPaths(newPaths);
        
        // Mark that a cascade update is potentially needed
        setIsCascadePending(true);

        // Autosave Logic: Debounced, Silent, Skip Cascade
        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
            autosaveTimeout.current = window.setTimeout(() => {
                handleSave(newPaths, true, true); 
            }, 500);
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, handleSave]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const newPaths = history[newIndex];
            setCurrentPaths(newPaths);
            
            setIsCascadePending(true);

            if (settings.isAutosaveEnabled) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = window.setTimeout(() => handleSave(newPaths, true, true), 500);
            }
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, handleSave]);
    
    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const newPaths = history[newIndex];
            setCurrentPaths(newPaths);

            setIsCascadePending(true);

            if (settings.isAutosaveEnabled) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = window.setTimeout(() => handleSave(newPaths, true, true), 500);
            }
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, handleSave]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    // --- DIRTY STATE ---
    const hasPathChanges = JSON.stringify(currentPaths) !== JSON.stringify(initialPathsOnLoad);
    const hasBearingChanges = lsb !== character.lsb || rsb !== character.rsb;
    const hasUnsavedChanges = hasPathChanges || hasBearingChanges;

    // --- NAVIGATION INTERCEPTION ---
    const handleNavigationAttempt = useCallback((targetCharacter: Character | null) => {
        const proceed = () => {
            if (targetCharacter) onNavigate(targetCharacter);
            else onClose();
        };

        if (settings.isAutosaveEnabled) {
            // Trigger final save before navigating.
            // We save if there are unsaved changes OR if a cascade is pending.
            // Skip Cascade: NO. Leaving the glyph MUST ensure consistency for dependents.
            if (hasUnsavedChanges || isCascadePending) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                handleSave(currentPaths, true, false); 
            }
            proceed();
        } else if (hasUnsavedChanges) {
            setPendingNavigation(targetCharacter); 
            setIsUnsavedModalOpen(true);
        } else {
            proceed();
        }
    }, [settings.isAutosaveEnabled, hasUnsavedChanges, isCascadePending, handleSave, currentPaths, onNavigate, onClose]);

    const handleConfirmSave = () => {
        // Manual confirmation: Not silent, Full cascade
        handleSave(currentPaths, false, false);
        if (pendingNavigation) {
            onNavigate(pendingNavigation);
        } else {
            onClose(); 
        }
        setIsUnsavedModalOpen(false);
        setPendingNavigation(null);
    };

    const handleConfirmDiscard = () => {
        if (pendingNavigation) {
            onNavigate(pendingNavigation);
        } else {
            onClose();
        }
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
            allCharacterSets
        });
        
        if (compositeGlyphData) {
            handlePathsChange(compositeGlyphData.paths);
            setInitialPathsOnLoad(JSON.parse(JSON.stringify(compositeGlyphData.paths)));
        }
        showNotification(t('glyphRefreshedSuccess'), 'info');
      }, [character, allCharacterSets, allGlyphData, settings, metrics, markAttachmentRules, handlePathsChange, showNotification, t]);

    // Clean up timeout on unmount
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
        isTransitioning,
        hasUnsavedChanges,
        handleSave,
        handleRefresh,
        handleNavigationAttempt,
        wasEmptyOnLoad,
        isUnsavedModalOpen,
        closeUnsavedModal: () => setIsUnsavedModalOpen(false),
        confirmSave: handleConfirmSave,
        confirmDiscard: handleConfirmDiscard
    };
};
