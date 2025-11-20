
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useKerning } from '../../contexts/KerningContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useRules } from '../../contexts/RulesContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import * as dbService from '../../services/dbService';
import { ProjectData } from '../../types';
import { simpleHash } from '../../utils/stringUtils'; // Import from utils

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

    const [projectId, setProjectId] = useState<number | undefined>(initialProjectId);
    const [lastSavedState, setLastSavedState] = useState<string | null>(null);

    const fullProjectStateForSaving = useMemo((): Omit<ProjectData, 'projectId' | 'savedAt'> | null => {
        if (!script || !settings || !metrics || !characterSets || fontRules === null) return null;
        return {
            scriptId: script.id,
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
    }, [script, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, glyphDataMap, kerningMap, markPositioningMap]);

    const hasUnsavedChanges = useMemo(() => {
        if (lastSavedState === null || fullProjectStateForSaving === null) return false;
        return JSON.stringify(fullProjectStateForSaving) !== lastSavedState;
    }, [fullProjectStateForSaving, lastSavedState]);

    const saveProjectToDB = useCallback(async () => {
        if (!fullProjectStateForSaving) return;

        const currentState = {
            ...fullProjectStateForSaving,
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

            setLastSavedState(JSON.stringify(fullProjectStateForSaving));
            if (hasUnsavedRules) rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
        } catch (error) {
            console.error("Failed to save project to DB:", error);
            layout.showNotification("Error saving project to database.", 'error');
        }
    }, [projectId, fullProjectStateForSaving, hasUnsavedRules, rulesDispatch, layout]);

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
    }, [fullProjectStateForSaving, hasUnsavedChanges, isScriptDataLoading, script, settings, saveProjectToDB]);

    // Initial Save State Effect
    useEffect(() => {
        if (!isScriptDataLoading && lastSavedState === null && fullProjectStateForSaving) {
            setLastSavedState(JSON.stringify(fullProjectStateForSaving));
        }
    }, [isScriptDataLoading, fullProjectStateForSaving, lastSavedState]);

    const handleSaveToDB = useCallback(async () => {
        if (!fullProjectStateForSaving) return;
        await saveProjectToDB();
        layout.showNotification(t('projectSaved'));
    }, [fullProjectStateForSaving, saveProjectToDB, layout, t]);

    return {
        projectId,
        setProjectId,
        lastSavedState,
        setLastSavedState,
        fullProjectStateForSaving,
        hasUnsavedChanges,
        saveProjectToDB,
        handleSaveToDB
    };
};
