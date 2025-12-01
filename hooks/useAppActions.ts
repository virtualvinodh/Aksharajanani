
import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import * as dbService from '../services/dbService';

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
    
    // Dependency Map (Ref) needs to be shared or passed around, typically managed where glyphs are managed
    const dependencyMap = useRef<Map<number, Set<number>>>(new Map());

    // Forward declarations to solve ordering
    const [isScriptDataLoadingState, setIsScriptDataLoadingState] = useState(true);

    // 2. Persistence Hook
    const {
        projectId, setProjectId, setLastSavedState, getProjectState,
        hasUnsavedChanges, handleSaveToDB
    } = useProjectPersistence(projectDataToRestore?.projectId, isScriptDataLoadingState);

    // 3. Glyph Actions Hook
    const {
        handleSaveGlyph, handleDeleteGlyph, handleAddGlyph, handleUnlockGlyph, 
        handleRelinkGlyph, handleUpdateDependencies, handleImportGlyphs, handleAddBlock, 
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
        dependencyMap
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
        getProjectState, projectId, setIsAnimatingExport, downloadTriggerRef,
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
    const [hasSnapshot, setHasSnapshot] = useState(false);

    // Check for existing snapshots on mount or when project ID changes
    useEffect(() => {
        if (projectId) {
            dbService.getSnapshots(projectId).then(list => {
                setHasSnapshot(list.length > 0);
            }).catch(err => console.error("Error checking snapshots", err));
        } else {
            setHasSnapshot(false);
        }
    }, [projectId]);

    const handleTakeSnapshot = useCallback(async () => {
        if (!projectId) {
            layout.showNotification("Please save the project before taking a snapshot.", 'error');
            return;
        }
        const currentState = getProjectState();
        if (currentState) {
            const fullData = { ...currentState, projectId };
            const timestamp = Date.now();
            try {
                // 1. Get current list
                const existing = await dbService.getSnapshots(projectId);
                
                // 2. Limit to 5 (Delete oldest if needed)
                if (existing.length >= 5) {
                    // Existing list is sorted desc (newest first), so pop the last one (oldest)
                    const oldest = existing[existing.length - 1];
                    if (oldest.id) await dbService.deleteSnapshot(oldest.id);
                }

                // 3. Save new
                await dbService.saveSnapshot({
                    projectId,
                    data: fullData,
                    timestamp
                });
                setHasSnapshot(true);
                layout.showNotification("Snapshot saved to history", 'success');
            } catch (error) {
                console.error("Failed to save snapshot:", error);
                layout.showNotification("Failed to save snapshot", 'error');
            }
        }
    }, [getProjectState, layout, projectId]);
    
    const handleRestoreAction = useCallback(async (data: ProjectData) => {
        try {
            initializeProjectState(data);
            layout.showNotification("Restored from snapshot", 'info');
            layout.closeModal();
        } catch (error) {
             console.error("Failed to restore snapshot:", error);
             layout.showNotification("Failed to restore snapshot", 'error');
        }
    }, [initializeProjectState, layout]);

    const handleRestoreSnapshot = useCallback(() => {
        if (hasSnapshot && projectId) {
            layout.openModal('snapshotRestore', {
                projectId: projectId,
                onRestore: handleRestoreAction
            });
        }
    }, [hasSnapshot, projectId, layout, handleRestoreAction]);
    
    // --- Save As Logic ---
    const handleSaveAs = useCallback(async (newName: string) => {
        const currentState = getProjectState();
        if (!currentState) return;

        // Update font name in state
        currentState.settings.fontName = newName;
        
        // Prepare for new DB entry (remove ID)
        const newData = {
            ...currentState,
            savedAt: new Date().toISOString()
        };

        try {
            // Add as new project
            const newId = await dbService.addProject(newData);
            
            // Switch context
            setProjectId(newId);
            setLastSavedState(JSON.stringify(newData));
            settingsDispatch({ type: 'UPDATE_SETTINGS', payload: s => s ? ({ ...s, fontName: newName }) : null });
            
            // Close modal and notify
            layout.closeModal();
            layout.showNotification(`Saved copy as "${newName}"`, 'success');
            
            // Check snapshots for new ID (should be empty)
            setHasSnapshot(false);

        } catch (error) {
            console.error("Failed to save copy:", error);
            layout.showNotification("Failed to save copy", 'error');
        }
    }, [getProjectState, layout, setProjectId, setLastSavedState, settingsDispatch]);

    const openSaveAsModal = useCallback(() => {
        if (!settings) return;
        layout.openModal('saveAs', {
            currentName: settings.fontName,
            onConfirm: handleSaveAs
        });
    }, [layout, settings, handleSaveAs]);

    
    const testText = settings?.customSampleText || '';
    const setTestText = (text: string) => {
        settingsDispatch({ type: 'UPDATE_SETTINGS', payload: s => s ? ({ ...s, customSampleText: text }) : null });
    };


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
        handleUpdateDependencies, // Exposed
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
        hasSnapshot,

        // Save As
        openSaveAsModal
    };
};
