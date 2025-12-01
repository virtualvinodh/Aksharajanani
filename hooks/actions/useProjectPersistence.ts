
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useKerning } from '../../contexts/KerningContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useRules } from '../../contexts/RulesContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { useProject } from '../../contexts/ProjectContext';
import * as dbService from '../../services/dbService';
import { ProjectData } from '../../types';

export const useProjectPersistence = (
    initialProjectId: number | undefined, 
    isScriptDataLoading: boolean
) => {
    const { t } = useLocale();
    const layout = useLayout();
    const { script, characterSets } = useCharacter();
    const { glyphDataMap } = useGlyphData();
    const { kerningMap } = useKerning();
    const { settings, metrics } = useSettings();
    const { markPositioningMap } = usePositioning();
    const { state: rulesState, dispatch: rulesDispatch } = useRules();
    const { fontRules, isFeaEditMode, manualFeaCode, hasUnsavedRules } = rulesState;
    const { projectName } = useProject();

    const [projectId, setProjectId] = useState<number | undefined>(initialProjectId);
    const [lastSavedState, setLastSavedState] = useState<string | null>(null);
    
    // Optimization: Track dirty state with a boolean instead of expensive deep comparison on every render.
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Optimization: Construct the project state ONLY when needed (Save/Export), not on every render.
    const getProjectState = useCallback((): Omit<ProjectData, 'projectId' | 'savedAt'> | null => {
        if (!script || !settings || !metrics || !characterSets || fontRules === null) return null;
        return {
            scriptId: script.id,
            name: projectName,
            settings,
            metrics,
            characterSets,
            fontRules,
            isFeaEditMode,
            manualFeaCode,
            glyphs: Array.from(glyphDataMap.entries()),
            kerning: Array.from(kerningMap.entries()),
            markPositioning: Array.from(markPositioningMap.entries()),
        };
    }, [script, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, glyphDataMap, kerningMap, markPositioningMap, projectName]);

    // Detect changes cheaply by watching dependencies
    useEffect(() => {
        if (!isScriptDataLoading && lastSavedState !== null) {
            setHasUnsavedChanges(true);
        }
    }, [
        // These are the dependencies that trigger a "change"
        glyphDataMap, kerningMap, markPositioningMap, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, projectName,
        // Dependencies that shouldn't trigger change but are needed for logic
        isScriptDataLoading, lastSavedState
    ]);

    const saveProjectToDB = useCallback(async () => {
        const currentStateObj = getProjectState();
        if (!currentStateObj) return;

        // Perform the expensive stringify only when we are actually attempting to save
        const currentStateString = JSON.stringify(currentStateObj);
        if (currentStateString === lastSavedState) {
            setHasUnsavedChanges(false);
            return;
        }

        const currentState = {
            ...currentStateObj,
            savedAt: new Date().toISOString(),
        };

        try {
            let currentProjectId = projectId;
            if (currentProjectId === undefined) {
                const newId = await dbService.addProject(currentState);
                setProjectId(newId);
                currentProjectId = newId;
            } else {
                const projectWithId: ProjectData = { ...currentState, projectId: currentProjectId };
                await dbService.updateProject(currentProjectId, projectWithId);
            }

            // Invalidate font cache after any save.
            if (currentProjectId !== undefined) {
                await dbService.deleteFontCache(currentProjectId);
            }

            setLastSavedState(currentStateString);
            setHasUnsavedChanges(false);
            if (hasUnsavedRules) rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
        } catch (error) {
            console.error("Failed to save project to DB:", error);
            layout.showNotification("Error saving project to database.", 'error');
        }
    }, [projectId, getProjectState, lastSavedState, hasUnsavedRules, rulesDispatch, layout]);

    // Autosave Effect
    const autosaveTimeout = React.useRef<number | null>(null);
    useEffect(() => {
        if (isScriptDataLoading || !script || !settings?.isAutosaveEnabled || !hasUnsavedChanges) {
            return;
        }
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        autosaveTimeout.current = window.setTimeout(() => {
            saveProjectToDB();
        }, 1500);
        return () => { if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current); };
    }, [hasUnsavedChanges, isScriptDataLoading, script, settings, saveProjectToDB]);

    // Initial Save State Effect - Sets the baseline for "clean" state
    useEffect(() => {
        if (!isScriptDataLoading && lastSavedState === null) {
            const initialState = getProjectState();
            if (initialState) {
                setLastSavedState(JSON.stringify(initialState));
                setHasUnsavedChanges(false);
            }
        }
    }, [isScriptDataLoading, getProjectState, lastSavedState]);

    const handleSaveToDB = useCallback(async () => {
        await saveProjectToDB();
        layout.showNotification(t('projectSaved'));
    }, [saveProjectToDB, layout, t]);

    return {
        projectId,
        setProjectId,
        lastSavedState,
        setLastSavedState,
        getProjectState, // Expose the getter instead of the object
        hasUnsavedChanges,
        saveProjectToDB,
        handleSaveToDB
    };
};
