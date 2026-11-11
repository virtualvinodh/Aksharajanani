
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout, Workspace } from '../contexts/LayoutContext';
import { useSettings } from '../contexts/SettingsContext';
import { useProject } from '../contexts/ProjectContext';
import { ScriptConfig, ProjectData } from '../types';

import { useGlyphData } from '../contexts/GlyphDataContext';
import { mergeFontIntoProject } from '../services/importFontService';
import { useProjectTabLock } from './useProjectTabLock';
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
}

export const useAppActions = ({ 
    projectDataToRestore, onBackToSelection, allScripts, hasUnsavedRules, 
    setIsAnimatingExport
}: UseAppActionsProps) => {
    
    const { t } = useLocale();
    const layout = useLayout();
    const { settings, dispatch: settingsDispatch } = useSettings();
    const { workspace, setWorkspace } = layout;
    
    // Consolidate all project-related data from useProject
    const { dispatch: glyphDataDispatch } = useGlyphData();
    const { 
        projectName, 
        setProjectName, 
        positioningRules, 
        recommendedKerning, 
        markAttachmentRules, 
        markAttachmentClasses, 
        baseAttachmentClasses,
        characterSets,
        dispatch: characterDispatch
    } = useProject();
    
    const dependencyMap = useRef<Map<number, Set<number>>>(new Map());
    // Whether this tab may save the open project (another tab may have it, P3).
    const canSaveRef = useRef(true);
    const [isScriptDataLoadingState, setIsScriptDataLoadingState] = useState(true);

    const refreshDependencyMap = useCallback(() => {
        if (!characterSets) return;
        const newMap = new Map<number, Set<number>>();
        const allCharsByName = new Map(characterSets.flatMap(s => s.characters).map(c => [c.name, c]));
        
        characterSets.forEach(set => {
            set.characters.forEach(char => {
                if (char.unicode !== undefined) {
                    // Unified scan of all possible component sources
                    const sources = [
                        ...(char.link || []),
                        ...(char.composite || []),
                        ...(char.position || []),
                        ...(char.kern || [])
                    ];
                    
                    if (sources.length > 0) {
                        sources.forEach(sourceName => {
                            const sourceChar = allCharsByName.get(sourceName);
                            if (sourceChar?.unicode !== undefined) {
                                if (!newMap.has(sourceChar.unicode)) newMap.set(sourceChar.unicode, new Set());
                                newMap.get(sourceChar.unicode)!.add(char.unicode!);
                            }
                        });
                    }
                }
            });
        });
        dependencyMap.current = newMap;
    }, [characterSets]);

    // Reactive sync: Rebuild dependency map whenever characterSets change (Add/Delete/Import)
    useEffect(() => {
        refreshDependencyMap();
    }, [characterSets, refreshDependencyMap]);

    // 2. Persistence Hook
    const {
        projectId, setProjectId, setLastSavedState, getProjectState,
        hasUnsavedChanges, handleSaveToDB, requestSaveAfterRender, saveProjectToDB
    } = useProjectPersistence(projectDataToRestore?.projectId, isScriptDataLoadingState, canSaveRef);

    const handleMergeImportedFont = useCallback((importedProject: ProjectData) => {
        const currentProjectState = getProjectState();
        if (!currentProjectState) return;

        const { newGlyphs, newCharacters } = mergeFontIntoProject(currentProjectState, importedProject);

        if (newGlyphs.length > 0) {
            glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: newGlyphs });
        }

        if (newCharacters.length > 0) {
            characterDispatch({ 
                type: 'ADD_CHARACTERS', 
                payload: { 
                    characters: newCharacters, 
                    activeTabNameKey: 'Imported' 
                } 
            });
        }
        
        layout.showNotification(t('fontMergedSuccess', { count: newCharacters.length }) || `Imported ${newCharacters.length} glyphs`, 'success');
        layout.closeModal();
    }, [getProjectState, glyphDataDispatch, characterDispatch, layout, t]);

    // 3. Glyph Actions Hook
    const {
        handleSaveGlyph, handleDeleteGlyph, handleAddGlyph, handleQuickAddGlyph, handleUnlockGlyph, 
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

    // A failed load counts as "not loaded" for saving: autosave must not write a half-loaded project (P6).
    React.useEffect(() => {
        setIsScriptDataLoadingState(isScriptDataLoading || !!scriptDataError);
    }, [isScriptDataLoading, scriptDataError]);

    React.useEffect(() => {
        initializeProjectState(projectDataToRestore);
    }, [projectDataToRestore, initializeProjectState]);

    // One tab per project saves (P3).
    const { isOwner: isProjectTabOwner, takeOver: takeOverProjectTab } = useProjectTabLock(projectId, {
        beforeRelease: () => saveProjectToDB(),
        afterTakeOver: async () => {
            if (projectId === undefined) return;
            const latest = await dbService.getProject(projectId);
            if (latest) await initializeProjectState(latest);
        },
    });
    canSaveRef.current = isProjectTabOwner;

    useEffect(() => {
        const onUpgradeBlocked = () => layout.showNotification(t('dbUpgradeBlocked'), 'info', { duration: 60000 });
        window.addEventListener('aksharajanani:db-upgrade-blocked', onUpgradeBlocked);
        return () => window.removeEventListener('aksharajanani:db-upgrade-blocked', onUpgradeBlocked);
    }, [layout, t]);

    // 5. Export Actions Hook
    const {
        exportingType, feaErrorState, testPageFont, creatorFont,
        startExportProcess, handleSaveProject, handleSaveTemplate, handleTestClick, handleCreatorClick, downloadFontBlob
    } = useExportActions({
        getProjectState, projectId, projectName, setIsAnimatingExport
    });

    // --- Coordinator Logic (Navigation, Shortcuts) ---

    const handleChangeScriptClick = useCallback(() => {
        if (hasUnsavedChanges) {
            layout.openModal('confirmChangeScript', {
                onConfirm: onBackToSelection, 
                onSaveAndConfirm: async () => { if (await handleSaveToDB()) onBackToSelection(); },
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
            // Restoring is a deliberate choice, so save it right away (P5); it used to be marked as
            // already saved, so the database kept the version from before the restore.
            await initializeProjectState(data, { treatAsUnsaved: true });
            requestSaveAfterRender();
            layout.showNotification(t('snapshotRestoredSuccess'), 'info');
            layout.closeModal();
        } catch (error) {
             console.error("Failed to restore snapshot:", error);
             layout.showNotification(t('snapshotRestoreFailed'), 'error');
        }
    }, [initializeProjectState, requestSaveAfterRender, layout, t]);

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
        isProjectTabOwner,
        takeOverProjectTab,
        isScriptDataLoading,
        scriptDataError,
        hasUnsavedChanges,
        exportingType,
        isFeaOnlyMode,
        feaErrorState,
        testPageFont,
        creatorFont,
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
        handleImportGlyphs,
        handleSaveToDB,
        handleTestClick,
        handleCreatorClick,
        handleTakeSnapshot,
        handleRestoreSnapshot,
        hasSnapshot,
        openSaveAsModal,
        refreshDependencyMap,
        // FIX: Added missing exported actions from sub-hooks and local scope to resolve errors in App.tsx
        downloadFontBlob,
        handleAddGlyph,
        handleQuickAddGlyph,
        handleCheckGlyphExists,
        handleCheckNameExists,
        handleAddBlock,
        startExportProcess,
        handleLoadProjectData: initializeProjectState,
        handleMergeImportedFont
    };
};
