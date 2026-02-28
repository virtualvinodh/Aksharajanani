

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useKerning } from '../../contexts/KerningContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useRules } from '../../contexts/RulesContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { ScriptConfig, ProjectData, Character, CharacterSet, CharacterDefinition, AttachmentClass, RecommendedKerning, MarkAttachmentRules, PositioningRules, AppSettings } from '../../types';
import { FONT_META_DEFAULTS } from '../../constants';

interface UseProjectLoadProps {
    allScripts: ScriptConfig[];
    setProjectId: (id: number | undefined) => void;
    setLastSavedState: (state: string | null) => void;
    dependencyMap: React.MutableRefObject<Map<number, Set<number>>>;
}

export const useProjectLoad = ({ 
    allScripts, setProjectId, setLastSavedState, dependencyMap 
}: UseProjectLoadProps) => {
    
    const { t } = useLocale();
    const layout = useLayout();
    const { script, dispatchCharacterAction: characterDispatch } = useProject();
    const { dispatch: glyphDataDispatch } = useGlyphData();
    const { dispatch: kerningDispatch } = useKerning();
    const { dispatch: settingsDispatch } = useSettings();
    const { dispatch: positioningDispatch } = usePositioning();
    const { dispatch: rulesDispatch } = useRules();
    
    const { 
        setProjectName,
        setPositioningRules,
        setMarkAttachmentRules,
        setMarkAttachmentClasses,
        setBaseAttachmentClasses,
        setRecommendedKerning,
        setGuideFont,
        setPositioningGroupNames,
        setIsEditMode,
        setBaseFontBinary
    } = useProject();

    const [isScriptDataLoading, setIsScriptDataLoading] = useState(true);
    const [scriptDataError, setScriptDataError] = useState<string | null>(null);
    const [isFeaOnlyMode, setIsFeaOnlyMode] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const scriptRef = useRef(script);
    useEffect(() => {
        scriptRef.current = script;
    }, [script]);

    const initializeProjectState = useCallback(async (projectToLoad: ProjectData | null) => {
        const currentScript = scriptRef.current;
        if (!currentScript) return;

        setIsScriptDataLoading(true);
        setScriptDataError(null);
    
        glyphDataDispatch({ type: 'RESET' });
        kerningDispatch({ type: 'RESET' });
        positioningDispatch({ type: 'RESET' });
        setProjectId(projectToLoad?.projectId);

        try {
            let characterDefinitions: CharacterDefinition[], positioningDefinitions: CharacterDefinition[], rulesData: any, feaFileData: string | null = null, isFeaOnly = false;

            const isStandardScript = allScripts.some(s => s.id === currentScript.id);

            if (projectToLoad?.characterSets) {
                 characterDefinitions = projectToLoad.characterSets;
            } else if (currentScript.characterSetData) {
                characterDefinitions = currentScript.characterSetData.filter(d => 'characters' in d);
            } else {
                const charactersPath = `/data/characters_${currentScript.id}.json`;
                const charResponse = await fetch(charactersPath);
                if (!charResponse.ok) throw new Error(`Failed to load character set from ${charactersPath}`);
                characterDefinitions = await charResponse.json();
            }

            if (currentScript.characterSetData) {
                 positioningDefinitions = currentScript.characterSetData.filter(d => !('characters' in d));
            } else {
                 const positioningPath = `/data/positioning_${currentScript.id}.json`;
                 try {
                    const posResponse = await fetch(positioningPath);
                    positioningDefinitions = posResponse.ok ? await posResponse.json() : [];
                 } catch {
                     positioningDefinitions = [];
                 }
            }
            
            const charDefinition = [...characterDefinitions, ...positioningDefinitions];
            
            if (projectToLoad?.fontRules) {
                rulesData = projectToLoad.fontRules;
            } else if (isStandardScript) {
                const rulesPath = currentScript.rulesPath || `/data/rules_${currentScript.id}.json`;
                const rulesFeaPath = currentScript.rulesFeaPath;
                
                if (rulesFeaPath) {
                    const feaResponse = await fetch(rulesFeaPath);
                    if (feaResponse.ok) {
                        feaFileData = await feaResponse.text();
                        isFeaOnly = true; 
                    }
                }
                try {
                    const rulesResponse = await fetch(rulesPath);
                    rulesData = rulesResponse.ok ? await rulesResponse.json() : { 'DFLT': {} };
                } catch(error) {
                    rulesData = { 'DFLT': {} }
                }    
            } else {
                if (currentScript.rulesFeaContent) {
                    feaFileData = currentScript.rulesFeaContent;
                    isFeaOnly = true;
                }
                rulesData = currentScript.rulesData || {};
            }

            const scriptTagForMigration = Object.keys(rulesData).find(key => key !== 'groups' && key !== 'lookups');
            if (scriptTagForMigration && rulesData[scriptTagForMigration]) {
                for (const featureTag in rulesData[scriptTagForMigration]) {
                    const feature = rulesData[scriptTagForMigration][featureTag];
                    if (feature && feature.children === undefined) {
                        const hasInlineRules = ['liga', 'context', 'single', 'multiple', 'dist'].some(key => feature[key] && Object.keys(feature[key]).length > 0);
                        const lookupRefs = Array.isArray(feature.lookups) ? feature.lookups.map((name: string) => ({ type: 'lookup', name })) : [];
                        
                        // Create children array
                        feature.children = [];
                        if (hasInlineRules) feature.children.push({ type: 'inline' });
                        if (lookupRefs.length > 0) feature.children.push(...lookupRefs);
                        
                        // --- INJECT AUTO-GENERATED PLACEHOLDER ---
                        // For reordering capability, we ensure the placeholder exists in common GSUB features.
                        // We check if it's missing and append it.
                        if (!feature.children.some((c: any) => c.type === 'auto_generated')) {
                             // Only add to features that typically have auto-generation to avoid clutter,
                             // or just add to all since it's empty by default if not used.
                             // Adding to all GSUB features is safer for consistency.
                             feature.children.push({ type: 'auto_generated' });
                        }

                        delete feature.lookups;
                    } else if (feature && feature.children) {
                        // Existing project with children: Ensure placeholder exists for reordering
                         if (!feature.children.some((c: any) => c.type === 'auto_generated')) {
                             feature.children.push({ type: 'auto_generated' });
                        }
                    }
                }
            }
            
            setIsFeaOnlyMode(isFeaOnly);
            
            const defaultCharSets = charDefinition.filter(i => 'characters' in i) as CharacterSet[];
            
            let puaCounter = 0xE000 - 1;
            const finalCharacterSets = projectToLoad?.characterSets || defaultCharSets;
            
            const allCharacterLists = finalCharacterSets.flatMap(set => set.characters);
            allCharacterLists.forEach(char => {
                const codepoint = char.unicode ?? (([...char.name].length === 1 ? char.name.codePointAt(0) : undefined));
                if (codepoint !== undefined && codepoint >= 0xE000 && codepoint <= 0xF8FF) {
                    // FIX: Corrected typo 'pCounter' to 'puaCounter'
                    puaCounter = Math.max(puaCounter, codepoint);
                }
            });

            const processedCharSets = finalCharacterSets.map(set => ({
                ...set,
                characters: set.characters.map(char => {
                    if (char.unicode === undefined || char.unicode === null) {
                        if ([...char.name].length === 1) {
                            const codepoint = char.name.codePointAt(0)!;
                            return { ...char, unicode: codepoint };
                        } else {
                            puaCounter++;
                            return { ...char, unicode: puaCounter, isPuaAssigned: true };
                        }
                    }
                    return char;
                })
            }));
            
            const allCharSetsByName = new Map<string, CharacterSet>();
            processedCharSets.forEach(set => allCharSetsByName.set(set.nameKey, set));
            const allCharacters = processedCharSets.flatMap(set => set.characters);
            const allCharsByNameLocal = new Map(allCharacters.map(c => [c.name, c]));

            // Load Groups
            const positioningGroups = (positioningDefinitions.find(i => 'groups' in i) as { groups: Record<string, string[]> } | undefined)?.groups || {};
            const rulesGroups = rulesData.groups || {};
            const customGroups = {...positioningGroups, ...rulesGroups};
            
            // Store positioning group names for UI filtering
            setPositioningGroupNames(new Set(Object.keys(positioningGroups)));
            
            // JIT Change: We DO NOT expand groups here anymore. We pass the raw definitions to the context.
            // expansion happens in services/groupExpansionService when needed.
            
            const finalRulesData = { ...rulesData, groups: customGroups };
            rulesDispatch({ type: 'SET_FONT_RULES', payload: finalRulesData });

            // --- Hydrate Positioning & Attachment Rules ---
            
            // 1. Recommended Kerning
            if (projectToLoad?.recommendedKerning) {
                 setRecommendedKerning(projectToLoad.recommendedKerning);
            } else {
                const rawRecommendedKerning = (charDefinition.find(i => 'recommendedKerning' in i) as any)?.recommendedKerning || [];
                // Note: We keep raw recommended kerning (which may contain groups)
                // The KerningWorkspace will handle expansion for generation
                setRecommendedKerning(rawRecommendedKerning);
            }

            // 2. Mark/Base Attachment Rules & Classes
            // We pass them raw. The services will handle lookups.
            const rawMarkAttachmentRules = (charDefinition.find(i => 'markAttachment' in i) as any)?.markAttachment || {};
            const rawMarkAttachmentClasses = (charDefinition.find(i => 'markAttachmentClass' in i) as any)?.markAttachmentClass || [];
            const rawBaseAttachmentClasses = (charDefinition.find(i => 'baseAttachmentClass' in i) as any)?.baseAttachmentClass || [];
            
            const activeMarkAttachmentRules = projectToLoad?.markAttachmentRules || rawMarkAttachmentRules;

            setMarkAttachmentRules(activeMarkAttachmentRules);
            setMarkAttachmentClasses(projectToLoad?.markAttachmentClasses || rawMarkAttachmentClasses);
            setBaseAttachmentClasses(projectToLoad?.baseAttachmentClasses || rawBaseAttachmentClasses);
            
            // 3. Positioning Rules
            const rawPositioningRules = (charDefinition.filter(i => 'positioning' in i) as any[])?.flatMap(i => i.positioning) || null;
            const activePositioningRules = projectToLoad?.positioningRules || rawPositioningRules;
            setPositioningRules(activePositioningRules);

            if (!projectToLoad?.characterSets) {
                // Dynamic Ligature Creation
                 const scriptTag = Object.keys(rulesData).find(key => key !== 'groups' && key !== 'lookups');
                if (scriptTag && activePositioningRules) {
                    activePositioningRules.forEach(rule => {
                        if (rule.gsub) {
                            if (!rulesData[scriptTag][rule.gsub]) rulesData[scriptTag][rule.gsub] = {};
                            if (!rulesData[scriptTag][rule.gsub].liga) rulesData[scriptTag][rule.gsub].liga = {};
                            
                            // Here we technically need expansion to find all pairs to generate dynamic glyphs.
                            // However, dynamic ligature generation on initial load is an edge case for templates.
                            // If we don't expand, we might miss creating glyph placeholders for group-based rules.
                            // For JIT, we can defer this creation until the user actually visits/edits the pair.
                            // OR, we use the service here locally just for this step.
                            
                            // For now, we skip auto-generation of ALL PUA glyphs for group rules to keep load fast.
                            // They will be created JIT when the user positions them.
                        }
                    });
                }
            }
            
            const updatedScriptConfig = {
                ...currentScript,
                characterSetData: [
                     ...processedCharSets,
                     ...(currentScript.characterSetData?.filter(d => !('characters' in d)) || [])
                ],
                guideFont: projectToLoad?.guideFont || currentScript.guideFont
            };
            characterDispatch({ type: 'SET_SCRIPT', payload: updatedScriptConfig });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: processedCharSets });
            setGuideFont(projectToLoad?.guideFont || currentScript.guideFont || null);

            const newDependencyMap = new Map<number, Set<number>>();
            allCharsByNameLocal.forEach(char => {
                if (char.unicode !== undefined) {
                    const components = char.link || char.composite;
                    if (components) {
                        components.forEach(compName => {
                            const componentChar = allCharsByNameLocal.get(compName);
                            if (componentChar?.unicode !== undefined) {
                                if (!newDependencyMap.has(componentChar.unicode)) newDependencyMap.set(componentChar.unicode, new Set());
                                newDependencyMap.get(componentChar.unicode)!.add(char.unicode!);
                            }
                        });
                    }
                }
            });
            dependencyMap.current = newDependencyMap;
            
            let sampleText = currentScript.sampleText;
            try {
                const sampleTextResponse = await fetch(`/data/sample_${currentScript.id}.txt`);
                if (sampleTextResponse.ok) {
                    const text = await sampleTextResponse.text();
                    const contentType = sampleTextResponse.headers.get("content-type");
                    // Check if it's actually HTML (SPA fallback)
                    if (contentType && contentType.includes("text/html")) {
                        sampleText = "";
                    } else if (text.trim().toLowerCase().startsWith('<!doctype html>')) {
                        sampleText = "";
                    } else {
                        sampleText = text;
                    }
                } else {
                    sampleText = "";
                }
            } catch (e) { 
                sampleText = "";
            }

            if (!sampleText && processedCharSets) {
                const allChars = processedCharSets.flatMap(cs => cs.characters);
                if (allChars.length > 0) {
                    const basesAndLigs = allChars.filter(c => c.unicode !== undefined && (c.glyphClass === 'base' || c.glyphClass === 'ligature')).filter(c => c.name !== '◌');
                    const withSpaces = allChars.filter(c => c.unicode !== undefined).map(c => String.fromCodePoint(c.unicode!)).join(' ');
                    const withoutSpaces = basesAndLigs.filter(c => c.unicode !== undefined).map(c => String.fromCodePoint(c.unicode!)).join('');
                    sampleText = `${withSpaces}\n\n${withoutSpaces}`.trim();
                } else {
                    sampleText = "";
                }
            } else if (!sampleText) {
                sampleText = "";
            }
            
            if (sampleText && sampleText !== currentScript.sampleText) {
                characterDispatch({ type: 'SET_SCRIPT', payload: { ...updatedScriptConfig, sampleText } });
            }

            const baseSettings = { ...currentScript.defaults };
            if (projectToLoad) {
                const newSettings: AppSettings = { 
                    ...FONT_META_DEFAULTS, 
                    ...baseSettings, 
                    showUnicodeValues: projectToLoad.settings.showUnicodeValues ?? false, 
                    gridGhostSize: projectToLoad.settings.gridGhostSize ?? currentScript.grid.characterNameSize,
                    isBackgroundAutoKerningEnabled: projectToLoad.settings.isBackgroundAutoKerningEnabled ?? false,
                    ...projectToLoad.settings 
                };
                newSettings.testPage = { ...currentScript.testPage, ...(newSettings.testPage || {}), fontSize: { ...currentScript.testPage.fontSize, ...(newSettings.testPage?.fontSize || {}) }, lineHeight: { ...currentScript.testPage.lineHeight, ...(newSettings.testPage?.lineHeight || {}) } };
                if (!newSettings.customSampleText) newSettings.customSampleText = sampleText;
                if (!newSettings.description) newSettings.description = `${newSettings.fontName} - ${t(currentScript.nameKey)}`;
                
                settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings });
                settingsDispatch({ type: 'SET_METRICS', payload: { ...currentScript.metrics, ...projectToLoad.metrics } });
                glyphDataDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.glyphs) });
                if (projectToLoad.kerning) kerningDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.kerning) });
                if (projectToLoad.suggestedKerning) kerningDispatch({ type: 'SET_SUGGESTIONS', payload: new Map(projectToLoad.suggestedKerning) });
                if (projectToLoad.ignoredKerning) kerningDispatch({ type: 'SET_IGNORED', payload: new Set(projectToLoad.ignoredKerning) });
                if (projectToLoad.markPositioning) positioningDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.markPositioning) });
                rulesDispatch({ type: 'SET_FEA_EDIT_MODE', payload: isFeaOnly ? true : (projectToLoad.isFeaEditMode ?? false) });
                rulesDispatch({ type: 'SET_MANUAL_FEA_CODE', payload: isFeaOnly ? (feaFileData || '') : (projectToLoad.manualFeaCode ?? '') });
                const { projectId: loadedProjectId, savedAt, ...loadedState } = projectToLoad;
                setLastSavedState(JSON.stringify(loadedState));
                setProjectName(projectToLoad.name || projectToLoad.settings.fontName);
                
                // Restore Edit Mode
                setIsEditMode(!!projectToLoad.isEditMode);
                if (projectToLoad.baseFontBinary) {
                    // Handle potential serialization formats (Array vs Uint8Array)
                    if (projectToLoad.baseFontBinary instanceof Uint8Array) {
                         setBaseFontBinary(projectToLoad.baseFontBinary);
                    } else {
                         // Assume it's an array or object from JSON
                         setBaseFontBinary(new Uint8Array(Object.values(projectToLoad.baseFontBinary)));
                    }
                } else {
                    setBaseFontBinary(undefined);
                }
            } else {
                const savedSettingsRaw = localStorage.getItem(`font-creator-settings-${currentScript.id}`);
                const savedSettings = savedSettingsRaw ? JSON.parse(savedSettingsRaw) : {};
                const newSettings: AppSettings = { 
                    ...FONT_META_DEFAULTS, 
                    ...baseSettings, 
                    showUnicodeValues: false, 
                    gridGhostSize: currentScript.grid.characterNameSize,
                    isBackgroundAutoKerningEnabled: baseSettings.isBackgroundAutoKerningEnabled ?? false,
                    ...savedSettings 
                };
                newSettings.testPage = { ...currentScript.testPage, ...(savedSettings.testPage || {}), fontSize: { ...currentScript.testPage.fontSize, ...(savedSettings.testPage?.fontSize || {}) }, lineHeight: { ...currentScript.testPage.lineHeight, ...(savedSettings.testPage?.lineHeight || {}) } };
                newSettings.customSampleText = sampleText;

                settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings });
                settingsDispatch({ type: 'SET_METRICS', payload: currentScript.metrics });
                rulesDispatch({ type: 'SET_FEA_EDIT_MODE', payload: isFeaOnly });
                rulesDispatch({ type: 'SET_MANUAL_FEA_CODE', payload: isFeaOnly ? feaFileData || '' : '' });
                setLastSavedState(null);
                setProjectName(baseSettings.fontName);
                
                setIsEditMode(false);
                setBaseFontBinary(undefined);
            }

        } catch (err) {
            setScriptDataError(err instanceof Error ? err.message : 'An unknown error occurred loading script data');
        } finally {
            setIsScriptDataLoading(false);
        }
    }, [allScripts, characterDispatch, rulesDispatch, settingsDispatch, glyphDataDispatch, kerningDispatch, positioningDispatch, t, setProjectId, setLastSavedState, setMarkAttachmentRules, setMarkAttachmentClasses, setBaseAttachmentClasses, setPositioningRules, setRecommendedKerning, dependencyMap, setProjectName, setGuideFont, setPositioningGroupNames]);

    const handleLoadProject = () => fileInputRef.current?.click();

    const processFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const projectData: ProjectData = JSON.parse(event.target?.result as string);
                const currentScript = scriptRef.current;
                
                if (projectData.scriptId && projectData.scriptId !== currentScript?.id && !projectData.characterSets) {
                    const loadedScript = allScripts.find(s => s.id === projectData.scriptId);
                    const loadedScriptName = loadedScript ? t(loadedScript.nameKey) : `'${projectData.scriptId}'`;
                    const currentScriptName = currentScript ? t(currentScript.nameKey) : 'unknown';
                    layout.showNotification(t('mismatchedScriptError', { loadedScript: loadedScriptName, currentScript: currentScriptName }), 'error');
                    return;
                }
                initializeProjectState(projectData);
                layout.showNotification(projectData.scriptId ? t('projectLoaded') : t('oldProjectLoaded'), 'info');
            } catch (err) {
                layout.showNotification(t('errorLoadingProject', { error: err instanceof Error ? err.message : 'Unknown' }), 'error');
            } finally {
                layout.closeModal();
            }
        };
        reader.readAsText(file);
    }, [initializeProjectState, layout, t, allScripts]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, hasUnsavedChanges: boolean, handleSaveToDB: () => void) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (hasUnsavedChanges) {
            layout.openModal('confirmLoadProject', {
                onConfirm: () => processFile(file),
                onSaveAndConfirm: () => { handleSaveToDB(); processFile(file); },
                confirmActionText: t('loadWithoutSaving'),
                saveAndConfirmActionText: t('saveAndLoad')
            });
        } else {
            processFile(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [layout, processFile, t]);

    return {
        isScriptDataLoading,
        scriptDataError,
        fileInputRef,
        isFeaOnlyMode,
        initializeProjectState,
        handleFileChange,
        handleLoadProject
    };
};