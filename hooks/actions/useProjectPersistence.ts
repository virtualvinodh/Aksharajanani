
import { useState, useEffect, useCallback, useRef } from 'react';
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
    const { script, characterSets } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap, suggestedKerningMap, ignoredPairs } = useKerning();
    const { settings, metrics } = useSettings();
    const { markPositioningMap } = usePositioning();
    const { state: rulesState, dispatch: rulesDispatch } = useRules();
    const { fontRules, isFeaEditMode, manualFeaCode, hasUnsavedRules } = rulesState;
    
    // Consume Unified Data from ProjectContext
    const { 
        projectName, 
        positioningRules, 
        markAttachmentRules, 
        markAttachmentClasses, 
        baseAttachmentClasses, 
        recommendedKerning,
        isEditMode,
        baseFontBinary
    } = useProject();

    const [projectId, setProjectId] = useState<number | undefined>(initialProjectId);
    const [lastSavedState, setLastSavedState] = useState<string | null>(null);
    
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Update: Include all structural definitions in the saved project state
    const getProjectState = useCallback((): Omit<ProjectData, 'projectId' | 'savedAt'> | null => {
        if (!script || !settings || !metrics || !characterSets || fontRules === null) return null;
        return {
            scriptId: script.id,
            name: projectName,
            settings,
            metrics,
            characterSets,
            fontRules, // fontRules is now kept in sync via RulesContext/ProjectContext unification
            isFeaEditMode,
            manualFeaCode,
            glyphs: Array.from(glyphDataMap.entries()),
            kerning: Array.from(kerningMap.entries()),
            suggestedKerning: Array.from(suggestedKerningMap.entries()),
            ignoredKerning: Array.from(ignoredPairs),
            markPositioning: Array.from(markPositioningMap.entries()),
            
            // Unified Model Additions
            positioningRules: positioningRules || undefined,
            markAttachmentRules: markAttachmentRules || undefined,
            markAttachmentClasses: markAttachmentClasses || undefined,
            baseAttachmentClasses: baseAttachmentClasses || undefined,
            recommendedKerning: recommendedKerning || undefined,
            groups: fontRules.groups || undefined,
            guideFont: script.guideFont || undefined,
            
            // Edit Mode
            isEditMode,
            baseFontBinary
        };
    }, [script, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, glyphDataMap, kerningMap, suggestedKerningMap, ignoredPairs, markPositioningMap, projectName, positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning, glyphVersion, isEditMode, baseFontBinary]);

    useEffect(() => {
        if (!isScriptDataLoading && lastSavedState !== null) {
            setHasUnsavedChanges(true);
        }
    }, [
        // Trigger dependencies
        // glyphDataMap is a ref, so it's stable. glyphVersion changes on update.
        glyphVersion, 
        kerningMap, suggestedKerningMap, ignoredPairs, markPositioningMap, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, projectName,
        positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning,
        // Logic dependencies
        isScriptDataLoading, lastSavedState
    ]);

    const saveProjectToDB = useCallback(async () => {
        const currentStateObj = getProjectState();
        if (!currentStateObj) return;

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

    // Latest values for timers and window event handlers, so they never act on stale state
    // and don't need to be re-armed whenever these callbacks change identity.
    const saveProjectToDBRef = useRef(saveProjectToDB);
    const getProjectStateRef = useRef(getProjectState);
    const lastSavedStateRef = useRef(lastSavedState);
    const isAutosaveEnabledRef = useRef(!!settings?.isAutosaveEnabled);
    const isScriptDataLoadingRef = useRef(isScriptDataLoading);
    saveProjectToDBRef.current = saveProjectToDB;
    getProjectStateRef.current = getProjectState;
    lastSavedStateRef.current = lastSavedState;
    isAutosaveEnabledRef.current = !!settings?.isAutosaveEnabled;
    isScriptDataLoadingRef.current = isScriptDataLoading;

    // Autosave Effect
    // The timer is deliberately NOT re-armed when saveProjectToDB changes identity: it depends on
    // `layout`, which changes on every notification/selection, and re-arming on each change could
    // postpone the save indefinitely. The timeout calls the latest saveProjectToDB through the ref.
    const autosaveTimeout = useRef<number | null>(null);
    const isAutosaveEnabled = !!settings?.isAutosaveEnabled;
    useEffect(() => {
        if (isScriptDataLoading || !script || !isAutosaveEnabled || !hasUnsavedChanges) {
            return;
        }
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        autosaveTimeout.current = window.setTimeout(() => {
            saveProjectToDBRef.current();
        }, 1500);
        return () => { if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current); };
    }, [hasUnsavedChanges, isScriptDataLoading, script, isAutosaveEnabled]);

    // Protect against losing work when the tab is hidden, reloaded or closed.
    useEffect(() => {
        // Exact check (rather than the hasUnsavedChanges flag, which can be set spuriously).
        const hasUnpersistedState = () => {
            if (isScriptDataLoadingRef.current) return false;
            const state = getProjectStateRef.current();
            return !!state && JSON.stringify(state) !== lastSavedStateRef.current;
        };

        const flushIfAutosave = () => {
            if (isAutosaveEnabledRef.current && hasUnpersistedState()) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                saveProjectToDBRef.current();
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flushIfAutosave();
        };

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!hasUnpersistedState()) return;
            // Start the save (it may complete if the user chooses to stay), and ask the browser
            // to confirm leaving so the user isn't silently losing work.
            flushIfAutosave();
            e.preventDefault();
            e.returnValue = '';
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Initial Save State Effect
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
        getProjectState,
        hasUnsavedChanges,
        saveProjectToDB,
        handleSaveToDB
    };
};
