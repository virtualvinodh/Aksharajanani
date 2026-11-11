
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    isScriptDataLoading: boolean,
    /** False while another tab has this project open and saves it (P3). */
    canSaveRef?: React.MutableRefObject<boolean>
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
        baseFontBinary,
        guideFont
    } = useProject();

    const [projectId, setProjectIdState] = useState<number | undefined>(initialProjectId);
    const [lastSavedState, setLastSavedStateValue] = useState<string | null>(null);
    
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Saves run one after another and must see the newest id / saved state immediately (not
    // after the next render), or a second Ctrl+S on a new project would add it twice (P7).
    const projectIdRef = useRef<number | undefined>(initialProjectId);
    const lastSavedStateRef = useRef<string | null>(null);
    const setProjectId = useCallback((id: number | undefined) => {
        projectIdRef.current = id;
        setProjectIdState(id);
    }, []);
    const setLastSavedState = useCallback((value: string | null) => {
        lastSavedStateRef.current = value;
        setLastSavedStateValue(value);
    }, []);

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
            // The guide font chosen in Settings lives in ProjectContext, not on the script.
            guideFont: guideFont || script.guideFont || undefined,
            
            // Edit Mode
            isEditMode,
            baseFontBinary,

            // Self-contained script configuration (P2); character sets are already saved above.
            scriptConfig: {
                ...script,
                characterSetData: script.characterSetData?.filter(d => !('characters' in d)),
            },
        };
    }, [script, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, glyphDataMap, kerningMap, suggestedKerningMap, ignoredPairs, markPositioningMap, projectName, positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning, guideFont, glyphVersion, isEditMode, baseFontBinary]);

    // Unsaved-changes flag (P4). It used to be switched on by any change to its trigger list, which
    // included lastSavedState itself, so every save or load turned it straight back on. Now any
    // edit schedules an exact comparison with what was last saved, and the flag follows that.
    const getProjectStateRef = useRef(getProjectState);
    const isScriptDataLoadingRef = useRef(isScriptDataLoading);
    getProjectStateRef.current = getProjectState;
    isScriptDataLoadingRef.current = isScriptDataLoading;
    const dirtyCheckTimer = useRef<number | null>(null);
    useEffect(() => {
        if (dirtyCheckTimer.current) clearTimeout(dirtyCheckTimer.current);
        dirtyCheckTimer.current = window.setTimeout(() => {
            if (isScriptDataLoadingRef.current || lastSavedStateRef.current === null) return;
            const state = getProjectStateRef.current();
            setHasUnsavedChanges(!!state && JSON.stringify(state) !== lastSavedStateRef.current);
        }, 300);
        return () => { if (dirtyCheckTimer.current) clearTimeout(dirtyCheckTimer.current); };
    }, [
        // glyphDataMap is mutated in place; glyphVersion changes on update.
        glyphVersion, 
        kerningMap, suggestedKerningMap, ignoredPairs, markPositioningMap, settings, metrics, characterSets, fontRules, isFeaEditMode, manualFeaCode, projectName,
        positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning, guideFont,
        isScriptDataLoading
    ]);

    // One save attempt. Resolves to true when the project is saved (or nothing had changed).
    const hasUnsavedRulesRef = useRef(hasUnsavedRules);
    const layoutRef = useRef(layout);
    hasUnsavedRulesRef.current = hasUnsavedRules;
    layoutRef.current = layout;
    const runSave = useCallback(async (): Promise<boolean> => {
        if (canSaveRef && !canSaveRef.current) return false;
        const currentStateObj = getProjectStateRef.current();
        if (!currentStateObj) return false;

        const currentStateString = JSON.stringify(currentStateObj);
        if (currentStateString === lastSavedStateRef.current) {
            setHasUnsavedChanges(false);
            return true;
        }

        const currentState = {
            ...currentStateObj,
            savedAt: new Date().toISOString(),
        };

        try {
            let currentProjectId = projectIdRef.current;
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
            // Edits made while the save was running stay marked as unsaved.
            const latest = getProjectStateRef.current();
            setHasUnsavedChanges(!!latest && JSON.stringify(latest) !== currentStateString);
            if (hasUnsavedRulesRef.current) rulesDispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: false });
            return true;
        } catch (error) {
            console.error("Failed to save project to DB:", error);
            layoutRef.current.showNotification("Error saving project to database.", 'error');
            return false;
        }
    }, [rulesDispatch, setProjectId, setLastSavedState, canSaveRef]);

    // Saves are queued: a save requested while another runs starts after it, with the latest state.
    const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
    const saveProjectToDB = useCallback((): Promise<boolean> => {
        const next = saveChainRef.current.catch(() => false).then(() => runSave());
        saveChainRef.current = next;
        return next;
    }, [runSave]);

    // Latest values for timers and window event handlers, so they never act on stale state
    // and don't need to be re-armed whenever these callbacks change identity.
    const saveProjectToDBRef = useRef(saveProjectToDB);
    const isAutosaveEnabledRef = useRef(!!settings?.isAutosaveEnabled);
    saveProjectToDBRef.current = saveProjectToDB;
    isAutosaveEnabledRef.current = !!settings?.isAutosaveEnabled;

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
    }, [isScriptDataLoading, getProjectState, lastSavedState, setLastSavedState]);

    // Save once the state from a just-applied load (e.g. a snapshot restore) has rendered; saving
    // straight away would read the state from before it (P5).
    const [pendingSave, setPendingSave] = useState(false);
    const requestSaveAfterRender = useCallback(() => setPendingSave(true), []);
    useEffect(() => {
        if (!pendingSave || isScriptDataLoading) return;
        setPendingSave(false);
        saveProjectToDB();
    }, [pendingSave, isScriptDataLoading, saveProjectToDB]);

    // Resolves to true once saved, so "save and continue" actions can stop if the save failed.
    const handleSaveToDB = useCallback(async (): Promise<boolean> => {
        const ok = await saveProjectToDB();
        if (ok) layoutRef.current.showNotification(t('projectSaved'));
        return ok;
    }, [saveProjectToDB, t]);

    return {
        projectId,
        setProjectId,
        lastSavedState,
        setLastSavedState,
        getProjectState,
        hasUnsavedChanges,
        saveProjectToDB,
        requestSaveAfterRender,
        handleSaveToDB
    };
};
