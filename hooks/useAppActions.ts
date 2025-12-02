
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout, Workspace } from '../contexts/LayoutContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRules } from '../contexts/RulesContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useProject } from '../contexts/ProjectContext';
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
    // Removed redundant state fields that are now accessed via context in children
    const { projectName, setProjectName, positioningRules, recommendedKerning, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses } = useProject();
    
    const dependencyMap = useRef<Map<number, Set<number>>>(new Map());
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
        handleCheckGlyphExists, handleCheckNameExists
    } = useGlyphActions(dependencyMap, projectId);

    // 4. Load Hook
    const {
        isScriptDataLoading, scriptDataError, fileInputRef, isFeaOnlyMode,
        initializeProjectState, handleFileChange, handleLoadProject
    } = useProjectLoad({
        allScripts, 
        setProjectId, 
        setLastSavedState, 
        dependencyMap
    });

    React.useEffect(() => {
        setIsScriptDataLoadingState(isScriptDataLoading);
    }, [isScriptDataLoading]);

    React.useEffect(() => {
        initializeProjectState(projectDataToRestore);
    }, [projectDataToRestore, initializeProjectState]);

    // 5. Export Actions Hook
    const {
        isExporting, feaErrorState, testPageFont,
        startExportProcess, handleSaveProject, handleSaveTemplate, handleTestClick, downloadFontBlob
    } = useExportActions({
        getProjectState, projectId, projectName, setIsAnimatingExport, downloadTriggerRef
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
            layout.showNotification(t('snapshotSaveError'), 'error');
            return;
        }
        const currentState = getProjectState();
        if (currentState) {
            const fullData = { ...currentState, projectId };
            const timestamp = Date.now();
            try {
                const existing = await dbService.getSnapshots(projectId);
                if (existing.length >= 5) {
                    const oldest = existing[existing.length - 1];
                    if (oldest.id) await dbService.deleteSnapshot(oldest.id);
                }
                await dbService.saveSnapshot({
                    projectId,
                    data: fullData,
                    timestamp
                });
                setHasSnapshot(true);
                layout.showNotification(t('snapshotSavedSuccess'), 'success');
            } catch (error) {
                console.error("Failed to save snapshot:", error);
                layout.showNotification(t('snapshotSaveFailed'), 'error');
            }
        }
    }, [getProjectState, layout, projectId, t]);
    
    const handleRestoreAction = useCallback(async (data: ProjectData) => {
        try {
            initializeProjectState(data);
            layout.showNotification(t('snapshotRestoredSuccess'), 'info');
            layout.closeModal();
        } catch (error) {
             console.error("Failed to restore snapshot:", error);
             layout.showNotification(t('snapshotRestoreFailed'), 'error');
        }
    }, [initializeProjectState, layout, t]);

    const handleRestoreSnapshot = useCallback(() => {
        if (hasSnapshot && projectId) {
            layout.openModal('snapshotRestore', {
                projectId: projectId,
                onRestore: handleRestoreAction
            });
        }
    }, [hasSnapshot, projectId, layout, handleRestoreAction]);
    
    const handleSaveAs = useCallback(async (newName: string) => {
        const currentState = getProjectState();
        if (!currentState) return;
        currentState.name = newName;
        const newData = {
            ...currentState,
            savedAt: new Date().toISOString()
        };
        try {
            const newId = await dbService.addProject(newData);
            setProjectId(newId);
            setProjectName(newName);
            setLastSavedState(JSON.stringify(newData));
            layout.closeModal();
            layout.showNotification(t('saveCopySuccess', { name: newName }), 'success');
            setHasSnapshot(false);
        } catch (error) {
            console.error("Failed to save copy:", error);
            layout.showNotification(t('saveCopyFailed'), 'error');
        }
    }, [getProjectState, layout, setProjectId, setLastSavedState, setProjectName, t]);

    const openSaveAsModal = useCallback(() => {
        layout.openModal('saveAs', {
            currentName: projectName,
            onConfirm: handleSaveAs
        });
    }, [layout, projectName, handleSaveAs]);
    
    const testText = settings?.customSampleText || '';
    const setTestText = (text: string) => {
        settingsDispatch({ type: 'UPDATE_SETTINGS', payload: s => s ? ({ ...s, customSampleText: text }) : null });
    };

    return {
        isScriptDataLoading,
        scriptDataError,
        hasUnsavedChanges,
        isExporting,
        isFeaOnlyMode,
        feaErrorState,
        testPageFont,
        testText,
        setTestText,
        fileInputRef,
        
        // Exposed Data
        recommendedKerning,
        positioningRules,
        markAttachmentRules,
        markAttachmentClasses,
        baseAttachmentClasses,

        handleSaveProject,
        handleSaveTemplate, 
        handleLoadProject,
        handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, hasUnsavedChanges, handleSaveToDB),
        handleChangeScriptClick,
        handleWorkspaceChange,
        handleSaveGlyph,
        handleDeleteGlyph,
        handleUnlockGlyph,
        handleRelinkGlyph,
        handleUpdateDependencies,
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
        handleTakeSnapshot,
        handleRestoreSnapshot,
        hasSnapshot,
        openSaveAsModal
    };
};
