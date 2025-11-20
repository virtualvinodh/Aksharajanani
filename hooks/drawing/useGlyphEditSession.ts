
import { useState, useEffect, useRef, useCallback } from 'react';
import { Path, Character, GlyphData, AppSettings, FontMetrics, MarkAttachmentRules, CharacterSet } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData } from '../../services/glyphRenderService';
import { SaveOptions } from '../actions/useGlyphActions';

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
    const { showNotification } = useLayout();

    // --- STATE INITIALIZATION ---
    
    const [currentPaths, setCurrentPaths] = useState<Path[]>(() => {
        // Check for prefill on mount
        const initiallyDrawn = isGlyphDrawn(glyphData);
        const prefillSource = character.link || character.composite;
        const isPrefillEnabled = settings.isPrefillEnabled !== false;

        if (isPrefillEnabled && prefillSource && !initiallyDrawn) {
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
            if (compositeGlyphData) return compositeGlyphData.paths;
        }
        return glyphData?.paths || [];
    });

    // Used to track "dirty" state against what was loaded/saved.
    // IMPORTANT: We initialize this to the *persisted* state (glyphData), not the *current* state (which might include prefill).
    // This ensures that if a glyph is prefilled for the first time, it counts as "unsaved changes".
    const [initialPathsOnLoad, setInitialPathsOnLoad] = useState<Path[]>(() => {
        return isGlyphDrawn(glyphData) ? (glyphData!.paths || []) : [];
    });
    
    // Tracks if any changes have happened that require a full commit (cascade update)
    const hasPendingCascade = useRef(false);
    
    // Was it empty when we started? Used for background guide visibility.
    // If prefilled, it counts as "not empty" (guide hidden) for the purpose of drawing tools,
    // but for saving logic, we care about persistence status.
    const [wasEmptyOnLoad] = useState(() => {
        const initiallyDrawn = isGlyphDrawn(glyphData);
        // If paths are populated (either from data or prefill), it's not empty visually
        return !initiallyDrawn && currentPaths.length === 0;
    });

    const [history, setHistory] = useState<Path[][]>([currentPaths]);
    const [historyIndex, setHistoryIndex] = useState(0);
    
    const [lsb, setLsbState] = useState<number | undefined>(character.lsb);
    const [rsb, setRsbState] = useState<number | undefined>(character.rsb);

    const setLsb = (val: number | undefined) => {
        setLsbState(val);
        hasPendingCascade.current = true;
    };
    
    const setRsb = (val: number | undefined) => {
        setRsbState(val);
        hasPendingCascade.current = true;
    };
    
    const [isTransitioning] = useState(false); // Kept for interface compat
    const autosaveTimeout = useRef<number | null>(null);
    
    // Navigation State
    const [pendingNavigation, setPendingNavigation] = useState<Character | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

    // --- NOTIFICATION ON MOUNT (Prefill) ---
    useEffect(() => {
        const isPrefilled = currentPaths.length > 0 && !isGlyphDrawn(glyphData);
        if (isPrefilled && !character.link) {
            const componentNames = (character.composite || []).join(' + ');
            showNotification(t('compositeGlyphPrefilled', { components: componentNames }), 'info');
        }
    }, []); // Run once on mount

    // --- SAVING WRAPPER ---
    const performSave = useCallback((
        pathsToSave: Path[] = currentPaths, 
        options: SaveOptions = {}
    ) => {
        if (character.unicode === undefined) return;
        
        const onSuccess = () => {
            // Update our baseline for "clean" state
            setInitialPathsOnLoad(JSON.parse(JSON.stringify(pathsToSave)));
            
            // If this was a commit (not draft), we clear the pending cascade flag
            if (!options.isDraft) {
                hasPendingCascade.current = false;
            }
        };

        onSave(character.unicode, { paths: pathsToSave }, { lsb, rsb }, onSuccess, options);
    }, [onSave, character.unicode, currentPaths, lsb, rsb]);


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
    // We assume it's dirty if the JSON strings don't match.
    // Since we initialized `initialPathsOnLoad` to `[]` for prefilled glyphs,
    // this will be true immediately for them, triggering autosave or prompts.
    const hasPathChanges = JSON.stringify(currentPaths) !== JSON.stringify(initialPathsOnLoad);
    const hasBearingChanges = lsb !== character.lsb || rsb !== character.rsb;
    const hasUnsavedChanges = hasPathChanges || hasBearingChanges;

    // --- INITIAL AUTOSAVE FOR PREFILL ---
    // If we loaded with prefill data (so hasUnsavedChanges is true immediately) and autosave is on,
    // trigger an immediate draft save so the grid updates without user interaction.
    useEffect(() => {
        if (settings.isAutosaveEnabled && hasUnsavedChanges) {
             if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
             autosaveTimeout.current = window.setTimeout(() => {
                performSave(currentPaths, { isDraft: true, silent: true });
            }, 500);
        }
    }, []);

    // --- NAVIGATION & CLOSING ---
    const handleNavigationAttempt = useCallback((targetCharacter: Character | null) => {
        // Cleanup pending autosaves immediately
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
        // Explicit user save -> Commit + Cascade
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
            allCharacterSets
        });
        
        if (compositeGlyphData) {
            handlePathsChange(compositeGlyphData.paths);
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
        handleSave: () => performSave(currentPaths, { isDraft: false }), // Manual save button = Commit
        handleRefresh,
        handleNavigationAttempt,
        wasEmptyOnLoad,
        isUnsavedModalOpen,
        closeUnsavedModal: () => setIsUnsavedModalOpen(false),
        confirmSave: handleConfirmSave,
        confirmDiscard: handleConfirmDiscard
    };
};
