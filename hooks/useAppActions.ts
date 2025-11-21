
import React, { useState, useRef, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout, Workspace } from '../contexts/LayoutContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRules } from '../contexts/RulesContext';
import { useCharacter } from '../contexts/CharacterContext';
import { ScriptConfig, ProjectData } from '../types';

import { useProjectPersistence } from './actions/useProjectPersistence';
import { useGlyphActions } from './actions/useGlyphActions';
import { useProjectLoad } from './actions/useProjectLoad';
import { useExportActions } from './actions/useExportActions';

interface UseAppActionsProps {
    projectDataToRestore: ProjectData | null;
    onBackToSelection: () => void;
    allScripts: ScriptConfig[];
    hasUnsavedRules: boolean;
    setIsAnimatingExport: React.Dispatch<React.SetStateAction<boolean>>;
    downloadTriggerRef: React.MutableRefObject<(() => void) | null>;
}

export const useAppActions = ({ 
    projectDataToRestore, onBackToSelection, allScripts, hasUnsavedRules, 
    setIsAnimatingExport, downloadTriggerRef 
}: UseAppActionsProps) => {
    
    const { t } = useLocale();
    const layout = useLayout();
    const { script } = useCharacter();
    const { settings, dispatch: settingsDispatch } = useSettings();
    const { workspace, setWorkspace } = layout;
    const [testText, setTestText] = useState('');

    // Dependency Map (Ref) needs to be shared or passed around, typically managed where glyphs are managed
    const dependencyMap = useRef<Map<number, Set<number>>>(new Map());

    // Forward declarations to solve ordering
    const [isScriptDataLoadingState, setIsScriptDataLoadingState] = useState(true);

    // 2. Persistence Hook
    const {
        projectId, setProjectId, setLastSavedState, fullProjectStateForSaving,
        hasUnsavedChanges, handleSaveToDB
    } = useProjectPersistence(projectDataToRestore?.projectId, isScriptDataLoadingState);

    // 3. Glyph Actions Hook
    const {
        handleSaveGlyph, handleDeleteGlyph, handleAddGlyph, handleUnlockGlyph, 
        handleRelinkGlyph, handleImportGlyphs, handleAddBlock, 
        handleCheckGlyphExists, handleCheckNameExists,
        setMarkAttachmentRules, markAttachmentRules
    } = useGlyphActions(dependencyMap, projectId);

    // 4. Load Hook
    const {
        isScriptDataLoading, scriptDataError, fileInputRef, isFeaOnlyMode,
        recommendedKerning, positioningRules, markAttachmentClasses, baseAttachmentClasses,
        initializeProjectState, handleFileChange, handleLoadProject
    } = useProjectLoad({
        allScripts, 
        setProjectId, 
        setLastSavedState, 
        setMarkAttachmentRules,
        dependencyMap,
        setTestText
    });

    // Sync the local loading state for Persistence to see
    React.useEffect(() => {
        setIsScriptDataLoadingState(isScriptDataLoading);
    }, [isScriptDataLoading]);

    // Init project on mount
    React.useEffect(() => {
        initializeProjectState(projectDataToRestore);
    }, [projectDataToRestore, initializeProjectState]);

    // 5. Export Actions Hook
    const {
        isExporting, feaErrorState, testPageFont,
        startExportProcess, handleSaveProject, handleTestClick, downloadFontBlob
    } = useExportActions({
        fullProjectStateForSaving, projectId, setIsAnimatingExport, downloadTriggerRef,
        recommendedKerning, positioningRules, markAttachmentRules
    });

    // --- Coordinator Logic (Navigation, Shortcuts) ---

    const handleChangeScriptClick = useCallback(() => {
        if (hasUnsavedChanges) {
            layout.openModal('confirmChangeScript', {
                onConfirm: onBackToSelection, 
                onSaveAndConfirm: () => { handleSaveToDB(); onBackToSelection(); },
                confirmActionText: t('changeWithoutSaving'), 
                saveAndConfirmActionText: t('saveAndChange')
            });
        } else { onBackToSelection(); }
    }, [layout, onBackToSelection, handleSaveToDB, hasUnsavedChanges, t]);
  
    const handleWorkspaceChange = useCallback((newWorkspace: Workspace) => {
        if (workspace === 'rules' && newWorkspace !== 'rules' && hasUnsavedRules && !settings?.isAutosaveEnabled) {
            layout.openModal('unsavedRules', { pendingWorkspace: newWorkspace });
        } else { setWorkspace(newWorkspace); }
    }, [workspace, hasUnsavedRules, settings?.isAutosaveEnabled, layout, setWorkspace]);

    const handleEditorModeChange = useCallback((mode: 'simple' | 'advanced') => {
        if (mode === 'simple') {
            if (workspace === 'rules') {
                setWorkspace('drawing');
            } else if (workspace === 'kerning') {
                if (script?.kerning !== 'true') {
                    setWorkspace('drawing');
                }
            }
        }
        settingsDispatch({ type: 'UPDATE_SETTINGS', payload: s => s ? { ...s, editorMode: mode } : null });
    }, [workspace, setWorkspace, script, settingsDispatch]);

    // --- Session Snapshot Logic ---
    const [sessionSnapshot, setSessionSnapshot] = useState<{ data: any, timestamp: number } | null>(null);

    const handleTakeSnapshot = useCallback(() => {
        if (fullProjectStateForSaving) {
            // Deep clone the current state
            setSessionSnapshot({
                data: JSON.parse(JSON.stringify(fullProjectStateForSaving)),
                timestamp: Date.now()
            });
            layout.showNotification("Snapshot taken", 'success');
        }
    }, [fullProjectStateForSaving, layout]);
    
    const confirmRestore = useCallback(() => {
         if (sessionSnapshot) {
            // Restore using the load logic
            initializeProjectState(sessionSnapshot.data);
            layout.showNotification("Session restored from snapshot", 'info');
            layout.closeModal();
        }
    }, [sessionSnapshot, initializeProjectState, layout]);

    const handleRestoreSnapshot = useCallback(() => {
        if (sessionSnapshot) {
            layout.openModal('confirmSnapshotRestore', {
                timestamp: sessionSnapshot.timestamp,
                onConfirm: confirmRestore
            });
        }
    }, [sessionSnapshot, layout, confirmRestore]);


    return {
        // State
        isScriptDataLoading,
        scriptDataError,
        hasUnsavedChanges,
        isExporting,
        isFeaOnlyMode,
        feaErrorState,
        testPageFont,
        testText,
        setTestText,
        
        // Refs
        fileInputRef,
        
        // Data
        recommendedKerning,
        positioningRules,
        markAttachmentRules,
        markAttachmentClasses,
        baseAttachmentClasses,

        // Actions
        handleSaveProject,
        handleLoadProject,
        handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, hasUnsavedChanges, handleSaveToDB),
        handleChangeScriptClick,
        handleWorkspaceChange,
        handleSaveGlyph,
        handleDeleteGlyph,
        handleUnlockGlyph,
        handleRelinkGlyph,
        handleEditorModeChange,
        downloadFontBlob,
        handleAddGlyph,
        handleCheckGlyphExists,
        handleCheckNameExists,
        handleAddBlock,
        handleImportGlyphs,
        startExportProcess,
        handleSaveToDB,
        handleTestClick,
        
        // Snapshot
        handleTakeSnapshot,
        handleRestoreSnapshot,
        hasSnapshot: !!sessionSnapshot
    };
};
