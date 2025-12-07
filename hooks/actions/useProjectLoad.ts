
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useKerning } from '../../contexts/KerningContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useRules } from '../../contexts/RulesContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { ScriptConfig, ProjectData, Character, CharacterSet, CharacterDefinition, AttachmentClass, RecommendedKerning, MarkAttachmentRules, PositioningRules } from '../../types';
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
    // MIGRATION: Replaced useCharacter with useProject
    const { script, dispatchCharacterAction: characterDispatch } = useProject();
    const { dispatch: glyphDataDispatch } = useGlyphData();
    const { dispatch: kerningDispatch } = useKerning();
    const { dispatch: settingsDispatch } = useSettings();
    const { dispatch: positioningDispatch } = usePositioning();
    const { dispatch: rulesDispatch } = useRules();
    
    // Context setters from ProjectContext
    const { 
        setProjectName,
        setPositioningRules,
        setMarkAttachmentRules,
        setMarkAttachmentClasses,
        setBaseAttachmentClasses,
        setRecommendedKerning,
        setCharacterSets,
        setGuideFont
    } = useProject();

    const [isScriptDataLoading, setIsScriptDataLoading] = useState(true);
    const [scriptDataError, setScriptDataError] = useState<string | null>(null);
    const [isFeaOnlyMode, setIsFeaOnlyMode] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Use a ref to hold the current script to avoid dependency cycles in initializeProjectState
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

            // 1. Resolve Character and Positioning Definitions (From Project or Static)
            // If the project has them embedded, use them. Otherwise fall back to script config/files.
            
            // Character Definitions
            if (projectToLoad?.characterSets) {
                // If project has character sets, treat them as the definition
                 characterDefinitions = projectToLoad.characterSets;
            } else if (currentScript.characterSetData) {
                characterDefinitions = currentScript.characterSetData.filter(d => 'characters' in d);
            } else {
                const charactersPath = `/data/characters_${currentScript.id}.json`;
                const charResponse = await fetch(charactersPath);
                if (!charResponse.ok) throw new Error(`Failed to load character set from ${charactersPath}`);
                characterDefinitions = await charResponse.json();
            }

            // Positioning Definitions
            // We collect these to process logic, but we'll prioritize ProjectData fields if present.
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
            
            // 2. Resolve Rules Data
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

            // Data Migration for Ordered Feature Children (Legacy support)
            const scriptTagForMigration = Object.keys(rulesData).find(key => key !== 'groups' && key !== 'lookups');
            if (scriptTagForMigration && rulesData[scriptTagForMigration]) {
                for (const featureTag in rulesData[scriptTagForMigration]) {
                    const feature = rulesData[scriptTagForMigration][featureTag];
                    if (feature && feature.children === undefined) {
                        const hasInlineRules = ['liga', 'context', 'single', 'multiple', 'dist'].some(key => feature[key] && Object.keys(feature[key]).length > 0);
                        const lookupRefs = Array.isArray(feature.lookups) ? feature.lookups.map((name: string) => ({ type: 'lookup', name })) : [];
                        if (hasInlineRules) {
                            feature.children = [{ type: 'inline' }, ...lookupRefs];
                        } else {
                            feature.children = lookupRefs;
                        }
                        delete feature.lookups;
                    }
                }
            }
            
            setIsFeaOnlyMode(isFeaOnly);
            
            const defaultCharSets = charDefinition.filter(i => 'characters' in i) as CharacterSet[];
            
            // PUA Assignment Logic
            // We need to calculate this based on the final set of characters we are about to use.
            let puaCounter = 0xE000 - 1;
            // If project has characterSets, use them. Otherwise use defaults.
            const finalCharacterSets = projectToLoad?.characterSets || defaultCharSets;
            
            const allCharacterLists = finalCharacterSets.flatMap(set => set.characters);
            allCharacterLists.forEach(char => {
                const codepoint = char.unicode ?? (([...char.name].length === 1 ? char.name.codePointAt(0) : undefined));
                if (codepoint !== undefined && codepoint >= 0xE000 && codepoint <= 0xF8FF) {
                    puaCounter = Math.max(puaCounter, codepoint);
                }
            });

            // Only need to assign PUAs if we are using defaults (new project) or migrating.
            // If loading a project, unicodes should be stable.
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
            
            // Rebuild local lookups needed for expansion
            const allCharSetsByName = new Map<string, CharacterSet>();
            processedCharSets.forEach(set => allCharSetsByName.set(set.nameKey, set));
            const allCharacters = processedCharSets.flatMap(set => set.characters);
            const allCharsByNameLocal = new Map(allCharacters.map(c => [c.name, c]));

            // Groups Expansion
            // If project has groups in rules, use them. Otherwise merge defaults.
            const positioningGroups = (positioningDefinitions.find(i => 'groups' in i) as { groups: Record<string, string[]> } | undefined)?.groups || {};
            const rulesGroups = rulesData.groups || {};
            // Prioritize project's groups if they exist within rulesData (which is set to project.fontRules above)
            const customGroups = {...positioningGroups, ...rulesGroups};
            
            const expandedCustomGroups = new Map<string, string[]>();

            const resolveCustomGroup = (groupName: string, visited: Set<string> = new Set(), depth: number = 0): string[] => {
                if (depth > 50) {
                    console.warn(`Group expansion depth limit reached for ${groupName}`);
                    return [];
                }
                if (expandedCustomGroups.has(groupName)) return expandedCustomGroups.get(groupName)!;
                if (visited.has(groupName)) return [];
                visited.add(groupName);
                const members = customGroups[groupName];
                if (!members) return [];
                const expandedMembers = new Set<string>();
                members.forEach(memberName => {
                    if (memberName.startsWith('$')) {
                        const subGroupName = memberName.substring(1);
                        if (customGroups[subGroupName]) { resolveCustomGroup(subGroupName, new Set(visited), depth + 1).forEach(m => expandedMembers.add(m)); }
                        else if (allCharSetsByName.has(subGroupName)) { allCharSetsByName.get(subGroupName)!.characters.forEach(char => expandedMembers.add(char.name)); }
                    } else { expandedMembers.add(memberName); }
                });
                const result = Array.from(expandedMembers);
                expandedCustomGroups.set(groupName, result);
                return result;
            };

            for (const groupName in customGroups) {
                if (!expandedCustomGroups.has(groupName)) { resolveCustomGroup(groupName); }
            }
            
            const expandGroup = (nameOrGroup: string): string[] => {
                if (nameOrGroup.startsWith('$')) {
                    const groupName = nameOrGroup.substring(1);
                    if (expandedCustomGroups.has(groupName)) return expandedCustomGroups.get(groupName)!;
                    if (allCharSetsByName.has(groupName)) return allCharSetsByName.get(groupName)!.characters.map(c => c.name);
                    return [];
                }
                return [nameOrGroup];
            };

            const finalRulesData = { ...rulesData, groups: Object.fromEntries(expandedCustomGroups) };
            rulesDispatch({ type: 'SET_FONT_RULES', payload: finalRulesData });

            // --- Hydrate Positioning & Attachment Rules ---
            
            // 1. Recommended Kerning
            if (projectToLoad?.recommendedKerning) {
                 setRecommendedKerning(projectToLoad.recommendedKerning);
            } else {
                const rawRecommendedKerning = (charDefinition.find(i => 'recommendedKerning' in i) as any)?.recommendedKerning || [];
                const expandedKerning: RecommendedKerning[] = [];
                const uniquePairs = new Set<string>();
                rawRecommendedKerning.forEach(([left, right]: [string, string]) => {
                    expandGroup(left).forEach(leftChar => expandGroup(right).forEach(rightChar => {
                        const pairKey = `${leftChar}|${rightChar}`;
                        if (!uniquePairs.has(pairKey)) {
                            expandedKerning.push([leftChar, rightChar]);
                            uniquePairs.add(pairKey);
                        }
                    }));
                });
                setRecommendedKerning(expandedKerning);
            }

            // 2. Expand Rules
            const expandMarkAttachmentRules = (rules: MarkAttachmentRules | null): MarkAttachmentRules | null => {
                if (!rules) return null;
                const expandedRules: MarkAttachmentRules = {};
                for (const baseOrGroup in rules) {
                    const baseNames = expandGroup(baseOrGroup);
                    const marks = rules[baseOrGroup];
                    for (const markOrGroup in marks) {
                        const markNames = expandGroup(markOrGroup);
                        const ruleValue = marks[markOrGroup];
                        baseNames.forEach(baseName => {
                            if (!expandedRules[baseName]) expandedRules[baseName] = {};
                            markNames.forEach(markName => { expandedRules[baseName][markName] = ruleValue; });
                        });
                    }
                }
                return expandedRules;
            };

            const expandAttachmentClass = (classes: AttachmentClass[] | null): AttachmentClass[] | null => {
                if (!classes) return null;
                return classes.map(c => {
                    const expanded: AttachmentClass = { members: c.members.flatMap(expandGroup) };
                    if (c.exceptions) expanded.exceptions = c.exceptions.flatMap(expandGroup);
                    if (c.applies) expanded.applies = c.applies.flatMap(expandGroup);
                    return expanded;
                });
            };

            // 3. Process Positioning Rules
            const rawPositioningRules = (charDefinition.filter(i => 'positioning' in i) as any[])?.flatMap(i => i.positioning) || null;
            if (rawPositioningRules && !projectToLoad?.positioningRules) {
                rawPositioningRules.forEach(rule => {
                    if (rule.base) rule.base = rule.base.flatMap(expandGroup);
                    if (rule.mark) rule.mark = rule.mark.flatMap(expandGroup);
                    if (rule.ligatureMap) {
                         const expandedLigatureMap: { [base: string]: { [mark: string]: string } } = {};
                        for (const baseOrGroup in rule.ligatureMap) {
                            const baseNames = expandGroup(baseOrGroup);
                            const marksMap = rule.ligatureMap[baseOrGroup];
                            for (const markOrGroup in marksMap) {
                                const markNames = expandGroup(markOrGroup);
                                const ligatureValue = marksMap[markOrGroup];
                                if (typeof ligatureValue === 'string' && ligatureValue.startsWith('$')) {
                                    const ligatureNames = expandGroup(ligatureValue);
                                    if (baseNames.length === ligatureNames.length) {
                                        baseNames.forEach((baseName, index) => {
                                            const ligatureName = ligatureNames[index];
                                            if (!expandedLigatureMap[baseName]) { expandedLigatureMap[baseName] = {}; }
                                            markNames.forEach(markName => { expandedLigatureMap[baseName][markName] = ligatureName; });
                                        });
                                    }
                                } else {
                                    const singleLigatureName = ligatureValue as string;
                                    baseNames.forEach(baseName => {
                                        if (!expandedLigatureMap[baseName]) { expandedLigatureMap[baseName] = {}; }
                                        markNames.forEach(markName => { expandedLigatureMap[baseName][markName] = singleLigatureName; });
                                    });
                                }
                            }
                        }
                        rule.ligatureMap = expandedLigatureMap;
                    }
                });
            }
            
            // Create Dynamic Ligatures (if using default/static rules, or if project rules need expansion)
            
            const activePositioningRules = projectToLoad?.positioningRules || rawPositioningRules;
            const activeMarkAttachmentRules = projectToLoad?.markAttachmentRules || expandMarkAttachmentRules((charDefinition.find(i => 'markAttachment' in i) as any)?.markAttachment);

            setMarkAttachmentRules(activeMarkAttachmentRules);
            setMarkAttachmentClasses(projectToLoad?.markAttachmentClasses || expandAttachmentClass((charDefinition.find(i => 'markAttachmentClass' in i) as any)?.markAttachmentClass));
            setBaseAttachmentClasses(projectToLoad?.baseAttachmentClasses || expandAttachmentClass((charDefinition.find(i => 'baseAttachmentClass' in i) as any)?.baseAttachmentClass));
            setPositioningRules(activePositioningRules);

            if (!projectToLoad?.characterSets) {
                // Dynamic Ligature Creation - Only needed for new projects or when not loading from full save
                 const scriptTag = Object.keys(rulesData).find(key => key !== 'groups' && key !== 'lookups');
                if (scriptTag && activePositioningRules) {
                    activePositioningRules.forEach(rule => {
                        if (rule.gsub) {
                            if (!rulesData[scriptTag][rule.gsub]) rulesData[scriptTag][rule.gsub] = {};
                            if (!rulesData[scriptTag][rule.gsub].liga) rulesData[scriptTag][rule.gsub].liga = {};
                            rule.base?.forEach((baseName: string) => rule.mark?.forEach((markName: string) => {
                                const ligatureName = rule.ligatureMap?.[baseName]?.[markName] || (baseName + markName);
                                const componentNames = [baseName, markName];
                                if (!rulesData[scriptTag][rule.gsub].liga[ligatureName]) {
                                    rulesData[scriptTag][rule.gsub].liga[ligatureName] = componentNames;
                                }
                                if (!allCharsByNameLocal.has(ligatureName)) {
                                    puaCounter++;
                                    const newLigatureChar: Character = {
                                        name: ligatureName, unicode: puaCounter, glyphClass: 'ligature',
                                        composite: componentNames, isCustom: true,
                                    };
                                    const dynamicSetNameKey = 'dynamicLigatures';
                                    let dynamicSet = processedCharSets.find(s => s.nameKey === dynamicSetNameKey);
                                    if (!dynamicSet) {
                                        dynamicSet = { nameKey: dynamicSetNameKey, characters: [] };
                                        processedCharSets.push(dynamicSet);
                                    }
                                    dynamicSet.characters.push(newLigatureChar);
                                    allCharsByNameLocal.set(ligatureName, newLigatureChar);
                                }
                            }));
                        }
                    });
                }
            }
            
            // Update script config with the fully resolved character sets
            // This ensures that later, if we look at script.characterSets, it's correct.
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
            
            // Set Guide Font in ProjectContext
            setGuideFont(projectToLoad?.guideFont || currentScript.guideFont || null);

            // Build Dependency Map
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
            
            // Sample Text Logic
            let sampleText = currentScript.sampleText;
            try {
                const sampleTextResponse = await fetch(`/data/sample_${currentScript.id}.txt`);
                if (sampleTextResponse.ok) sampleText = await sampleTextResponse.text();
            } catch (e) { /* Ignore */ }

            if (!sampleText && processedCharSets) {
                // Fallback generation logic if sample text missing
                const allChars = processedCharSets.flatMap(cs => cs.characters);
                const basesAndLigs = allChars.filter(c => c.unicode !== undefined && (c.glyphClass === 'base' || c.glyphClass === 'ligature')).filter(c => c.name !== '◌');
                
                const withSpaces = basesAndLigs.map(c => c.name).join(' ');
                const withoutSpaces = basesAndLigs.map(c => c.name).join('');
                sampleText = `${withSpaces}\n\n${withoutSpaces}`;
            }
            
            if (sampleText && sampleText !== currentScript.sampleText) {
                characterDispatch({ type: 'SET_SCRIPT', payload: { ...updatedScriptConfig, sampleText } });
            }

            // Final Settings Hydration
            const baseSettings = { ...currentScript.defaults };
            if (projectToLoad) {
                const newSettings = { ...FONT_META_DEFAULTS, ...baseSettings, ...projectToLoad.settings };
                newSettings.testPage = { ...currentScript.testPage, ...(newSettings.testPage || {}), fontSize: { ...currentScript.testPage.fontSize, ...(newSettings.testPage?.fontSize || {}) }, lineHeight: { ...currentScript.testPage.lineHeight, ...(newSettings.testPage?.lineHeight || {}) } };
                
                if (!newSettings.customSampleText) {
                    newSettings.customSampleText = sampleText;
                }
                
                if (!newSettings.description) newSettings.description = `${newSettings.fontName} - ${t(currentScript.nameKey)}`;
                settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings });
                settingsDispatch({ type: 'SET_METRICS', payload: { ...currentScript.metrics, ...projectToLoad.metrics } });
                glyphDataDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.glyphs) });
                if (projectToLoad.kerning) kerningDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.kerning) });
                if (projectToLoad.markPositioning) positioningDispatch({ type: 'SET_MAP', payload: new Map(projectToLoad.markPositioning) });
                rulesDispatch({ type: 'SET_FEA_EDIT_MODE', payload: isFeaOnly ? true : (projectToLoad.isFeaEditMode ?? false) });
                rulesDispatch({ type: 'SET_MANUAL_FEA_CODE', payload: isFeaOnly ? (feaFileData || '') : (projectToLoad.manualFeaCode ?? '') });
                const { projectId: loadedProjectId, savedAt, ...loadedState } = projectToLoad;
                setLastSavedState(JSON.stringify(loadedState));
                
                // Set project name (distinct from font family)
                setProjectName(projectToLoad.name || projectToLoad.settings.fontName);
            } else {
                const savedSettingsRaw = localStorage.getItem(`font-creator-settings-${currentScript.id}`);
                const savedSettings = savedSettingsRaw ? JSON.parse(savedSettingsRaw) : {};
                const newSettings = { ...FONT_META_DEFAULTS, ...baseSettings, ...savedSettings };
                newSettings.testPage = { ...currentScript.testPage, ...(savedSettings.testPage || {}), fontSize: { ...currentScript.testPage.fontSize, ...(savedSettings.testPage?.fontSize || {}) }, lineHeight: { ...currentScript.testPage.lineHeight, ...(savedSettings.testPage?.lineHeight || {}) } };
                
                // Set initial sample text for new project
                newSettings.customSampleText = sampleText;

                settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings });
                settingsDispatch({ type: 'SET_METRICS', payload: currentScript.metrics });
                rulesDispatch({ type: 'SET_FEA_EDIT_MODE', payload: isFeaOnly });
                rulesDispatch({ type: 'SET_MANUAL_FEA_CODE', payload: isFeaOnly ? feaFileData || '' : '' });
                setLastSavedState(null);
                
                // Set default project name for new project
                setProjectName(baseSettings.fontName);
            }

        } catch (err) {
            setScriptDataError(err instanceof Error ? err.message : 'An unknown error occurred loading script data');
        } finally {
            setIsScriptDataLoading(false);
        }
    }, [allScripts, characterDispatch, rulesDispatch, settingsDispatch, glyphDataDispatch, kerningDispatch, positioningDispatch, t, setProjectId, setLastSavedState, setMarkAttachmentRules, setMarkAttachmentClasses, setBaseAttachmentClasses, setPositioningRules, setRecommendedKerning, dependencyMap, setProjectName, setCharacterSets, setGuideFont]);

    const handleLoadProject = () => fileInputRef.current?.click();

    const processFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const projectData: ProjectData = JSON.parse(event.target?.result as string);
                const currentScript = scriptRef.current; // Use ref for current script check
                
                // Bypass script check if the project contains character sets (self-contained)
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
