
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout, Workspace } from '../contexts/LayoutContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRules } from '../contexts/RulesContext';
import { useProject } from '../contexts/ProjectContext';
import { ScriptConfig, ProjectData } from '../types';

import { useGlyphData } from '../contexts/GlyphDataContext';
import { mergeFontIntoProject } from '../services/importFontService';
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
    const { settings, dispatch: settingsDispatch } = useSettings();
    const { workspace, setWorkspace } = layout;
    
    // Consolidate all project-related data from useProject
    const { dispatch: glyphDataDispatch } = useGlyphData();
    const { 
        script, // Retrieved from ProjectContext now
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
        hasUnsavedChanges, handleSaveToDB
    } = useProjectPersistence(projectDataToRestore?.projectId, isScriptDataLoadingState);

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

    React.useEffect(() => {
        setIsScriptDataLoadingState(isScriptDataLoading);
    }, [isScriptDataLoading]);

    React.useEffect(() => {
        initializeProjectState(projectDataToRestore);
    }, [projectDataToRestore, initializeProjectState]);

    // 5. Export Actions Hook
    const {
        exportingType, feaErrorState, testPageFont, creatorFont,
        startExportProcess, handleSaveProject, handleSaveTemplate, handleTestClick, handleCreatorClick, downloadFontBlob,
        getCachedOrGeneratedFont
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
            // Don't force exit from rules workspace
            if (workspace === 'kerning') {
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
        handleEditorModeChange,
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
