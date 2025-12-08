


import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ScriptConfig, CharacterSet, CharacterDefinition, ProjectData, Character, GlyphData } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { AboutIcon, HelpIcon, LoadIcon, SwitchScriptIcon, SpinnerIcon, TrashIcon, DRAWING_CANVAS_SIZE, AddIcon } from '../constants';
import LanguageSelector from './LanguageSelector';
import Footer from './Footer';
import { useLayout } from '../contexts/LayoutContext';
// import ScriptCreator from './ScriptCreator'; // Deprecated for Phase 4 removal
import CustomScriptLoader from './CustomScriptLoader';
import ScriptVariantModal, { VariantGroup } from './ScriptVariantModal';
import UnicodeBlockSelectorModal from './UnicodeBlockSelectorModal';
import * as dbService from '../services/dbService';
import DeleteProjectConfirmationModal from './DeleteProjectConfirmationModal';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { isGlyphDrawn } from '../utils/glyphUtils';
import NewProjectModal, { NewProjectData } from './NewProjectModal';

interface ScriptSelectionProps {
    scripts: ScriptConfig[];
    onSelectScript: (script: ScriptConfig, projectToRestore?: ProjectData) => void;
    onShowAbout: () => void;
    onShowHelp: () => void;
}

const representativeChars: { [key: string]: string } = {
    tamil: 'க',
    tamil_simple_design: 'க',
    tamil_old: 'னா',
    malayalam: 'ക',
    telugu: 'క',
    devanagari: 'क',
    sinhala: 'ක',
    latin: 'A',
    spanish: 'ñ',
    french: 'é',
    portuguese: 'ã',
    german: 'ü',
    cyrillic: 'Д',
    greek: 'α',
    kannada: 'ಕ',
    hebrew: 'א',
    thai: 'ก',
    lao: 'ກ',
    punjabi: 'ਕ',    
};

const RecentProjectPreview: React.FC<{ project: ProjectData }> = ({ project }) => {
    const { theme } = useTheme();
    const canvasRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
    const PREVIEW_SIZE = 44;

    const previewChars = useMemo(() => {
        // Explicitly cast to [number, GlyphData][] to ensure Map is correctly typed
        const glyphEntries = project.glyphs as [number, GlyphData][];
        const glyphDataMap = new Map<number, GlyphData>(glyphEntries);
        if (!project.characterSets) return [];

        let drawnChars: Character[] = [];

        // Prioritize showing vowels if available
        const vowelsSet = project.characterSets.find(set => set.nameKey === 'vowels');
        if (vowelsSet) {
            const drawnVowels = vowelsSet.characters.filter(char => !char.hidden && char.unicode && isGlyphDrawn(glyphDataMap.get(char.unicode)));
            if (drawnVowels.length > 0) {
                return drawnVowels.slice(0, 3);
            }
        }
        
        // Fallback to the first set with drawn characters (excluding vowels)
        for (const set of project.characterSets) {
            if (set.nameKey === 'vowels') continue; // Already checked
            const charsInSet = set.characters.filter(char => !char.hidden && char.unicode && isGlyphDrawn(glyphDataMap.get(char.unicode)));
            if (charsInSet.length > 0) {
                drawnChars = charsInSet.slice(0, 3);
                break;
            }
        }
        
        // If still no characters found, fall back to any drawn glyph across all sets
        if (drawnChars.length === 0) {
             const allDrawn = project.characterSets
                .flatMap(set => set.characters)
                .filter(char => !char.hidden && char.unicode && isGlyphDrawn(glyphDataMap.get(char.unicode)));
            return allDrawn.slice(0, 3);
        }

        return drawnChars;
    }, [project]);

    useEffect(() => {
        const glyphEntries = project.glyphs as [number, GlyphData][];
        const glyphDataMap = new Map<number, GlyphData>(glyphEntries);

        previewChars.forEach((char, index) => {
            const canvas = canvasRefs[index].current;
            const ctx = canvas?.getContext('2d');
            if (!ctx || !canvas) return;

            ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
            const glyphData = glyphDataMap.get(char.unicode!);

            if (isGlyphDrawn(glyphData)) {
                const scale = PREVIEW_SIZE / DRAWING_CANVAS_SIZE;
                ctx.save();
                ctx.scale(scale, scale);
                renderPaths(ctx, glyphData!.paths, {
                    strokeThickness: project.settings.strokeThickness,
                    color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
                });
                ctx.restore();
            }
        });
    }, [project, previewChars, theme, canvasRefs]);

    if (previewChars.length === 0) {
        return <div className="h-8 my-2" />; // placeholder for consistent height
    }

    return (
        <div className="flex justify-center items-center gap-1 my-2 h-8">
            {previewChars.map((char, index) => (
                <canvas key={char.unicode} ref={canvasRefs[index]} width={PREVIEW_SIZE} height={PREVIEW_SIZE} title={char.name} />
            ))}
        </div>
    );
};


const ScriptSelection: React.FC<ScriptSelectionProps> = ({ scripts, onSelectScript, onShowAbout, onShowHelp }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [isCreatingScript, setIsCreatingScript] = useState(false); // Keeping for now but unused in UI
    const [isUploadingScript, setIsUploadingScript] = useState(false);
    const [includeLatin, setIncludeLatin] = useState(false);
    const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
    const [pendingScript, setPendingScript] = useState<ScriptConfig | null>(null);
    const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
    const [recentProjects, setRecentProjects] = useState<ProjectData[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [projectToDelete, setProjectToDelete] = useState<ProjectData | null>(null);
    
    const [isBlockSelectorOpen, setIsBlockSelectorOpen] = useState(false);
    const customScriptTemplate = useMemo(() => scripts.find(s => s.id === 'latin'), [scripts]);

    const [longPressedProjectId, setLongPressedProjectId] = useState<number | null>(null);
    const longPressTimeout = useRef<number | null>(null);


    useEffect(() => {
        setIsLoadingProjects(true);
        dbService.getRecentProjects(6)
            .then(projects => {
                setRecentProjects(projects);
                setIsLoadingProjects(false);
            })
            .catch(err => {
                console.error("Failed to load recent projects:", err);
                setIsLoadingProjects(false);
            });
    }, []);

    useEffect(() => {
        const styleId = 'dynamic-guide-fonts';
        let styleElement = document.getElementById(styleId);
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }

        const fontFaces = scripts
            .map(script => {
                if (script.guideFont && script.guideFont.fontName && script.guideFont.fontUrl) {
                    return `@font-face { font-family: "${script.guideFont.fontName}"; src: url('${script.guideFont.fontUrl}'); font-display: swap; }`;
                }
                return null;
            })
            .filter(Boolean)
            .join('\n');
            
        styleElement.innerHTML = fontFaces;
    }, [scripts]);

    // This effect handles hiding the delete icon when the user interacts with anything else.
    useEffect(() => {
        const handleOutsideInteraction = () => {
            setLongPressedProjectId(null);
        };

        if (longPressedProjectId !== null) {
            // Use a timeout to ensure the event that triggered this state doesn't immediately close it.
            const timer = setTimeout(() => {
                document.addEventListener('click', handleOutsideInteraction, { once: true, capture: true });
                document.addEventListener('touchstart', handleOutsideInteraction, { once: true, capture: true });
            }, 10);

            return () => {
                clearTimeout(timer);
                document.removeEventListener('click', handleOutsideInteraction, { capture: true });
                document.removeEventListener('touchstart', handleOutsideInteraction, { capture: true });
            };
        }
    }, [longPressedProjectId]);
    
    const startProject = (script: ScriptConfig) => {
        onSelectScript(script);
    };

    const handleProjectClick = (project: ProjectData) => {
        let scriptToLoad = scripts.find(s => s.id === project.scriptId);

        if (!scriptToLoad && project.scriptId?.startsWith('custom_blocks_')) {
            if (!customScriptTemplate || !project.metrics || !project.characterSets) {
                showNotification('Could not load custom project: template or essential data missing.', 'error');
                return;
            }
            // Reconstruct the ScriptConfig for this custom project from the saved data
            scriptToLoad = {
                ...customScriptTemplate,
                id: project.scriptId,
                nameKey: "customBlockFont", // This is the key used during creation
                sampleText: "", // Dynamic text generation will handle this in useAppActions
                characterSetData: project.characterSets, // Most important part
                rulesData: project.fontRules || { 'dflt': {} },
                metrics: project.metrics,
                defaults: {
                    fontName: project.settings.fontName,
                    strokeThickness: project.settings.strokeThickness,
                    pathSimplification: project.settings.pathSimplification,
                    showGridOutlines: project.settings.showGridOutlines,
                    isAutosaveEnabled: project.settings.isAutosaveEnabled,
                    editorMode: project.settings.editorMode,
                    isPrefillEnabled: project.settings.isPrefillEnabled ?? true,
                    showUnicodeValues: project.settings.showUnicodeValues ?? false,
                },
                grid: customScriptTemplate.grid,
                guideFont: customScriptTemplate.guideFont,
                testPage: customScriptTemplate.testPage,
            };
        } else if (!scriptToLoad && project.scriptId?.startsWith('project_')) {
             // Handle "Empty Project" style custom scripts
             if (!customScriptTemplate) {
                  showNotification('Could not load project: base template missing.', 'error');
                  return;
             }
             scriptToLoad = {
                ...customScriptTemplate,
                id: project.scriptId,
                nameKey: "customProject",
                sampleText: "",
                characterSetData: project.characterSets || [],
                rulesData: project.fontRules || { 'dflt': {} },
                metrics: project.metrics || customScriptTemplate.metrics,
                defaults: { ...customScriptTemplate.defaults, ...project.settings },
                grid: customScriptTemplate.grid,
                guideFont: project.guideFont || customScriptTemplate.guideFont,
                testPage: customScriptTemplate.testPage,
             };
        }

        if (scriptToLoad) {
            onSelectScript(scriptToLoad, project);
        } else {
            showNotification(`Could not find script configuration for project with script ID: ${project.scriptId}`, 'error');
        }
    };

    const handleScriptSelection = async (script: ScriptConfig) => {
        try {
            const scriptWithAddons: ScriptConfig = JSON.parse(JSON.stringify(script));

            let originalCharDefs: CharacterDefinition[];
            let positioningDefs: CharacterDefinition[] = [];

            if (scriptWithAddons.characterSetData) {
                originalCharDefs = scriptWithAddons.characterSetData;
            } else {
                const charactersPath = `/data/characters_${script.id}.json`;
                const originalRes = await fetch(charactersPath);
                if (!originalRes.ok) throw new Error(`Could not fetch original characters for ${script.nameKey}`);
                originalCharDefs = await originalRes.json();

                const positioningPath = `/data/positioning_${script.id}.json`;
                try {
                    const positioningRes = await fetch(positioningPath);
                    if (positioningRes.ok) {
                        positioningDefs = await positioningRes.json();
                    } else {
                        console.warn(`Could not load positioning data from ${positioningPath}.`);
                    }
                } catch (error) {
                    console.warn(`Could not load positioning data from ${positioningPath}.`);

                }
            }
            
            const fetchPromises = [
                fetch('/data/characters_basic.json').then(res => {
                    if (!res.ok) throw new Error(`Failed to fetch character data from ${res.url}`);
                    return res.json();
                })
            ];
    
            if (includeLatin) {
                fetchPromises.push(
                    fetch('/data/characters_latin.json').then(res => {
                        if (!res.ok) throw new Error(`Failed to fetch character data from ${res.url}`);
                        return res.json();
                    })
                );
            }
    
            const additionalCharDefArrays = await Promise.all(fetchPromises);
            const additionalCharDefs = additionalCharDefArrays.flat();

            const combinedCharDefs: CharacterDefinition[] = [
                ...originalCharDefs,
                ...positioningDefs,
                ...additionalCharDefs,
            ];
            
            scriptWithAddons.characterSetData = combinedCharDefs;

            const allChars = (combinedCharDefs.filter(d => 'characters' in d) as CharacterSet[]).flatMap(cs => cs.characters);
            const variantsByOptionKey = new Map<string, Character[]>();

            allChars.forEach(char => {
                if (char.option && char.unicode !== undefined) {
                    if (!variantsByOptionKey.has(char.option)) {
                        variantsByOptionKey.set(char.option, []);
                    }
                    variantsByOptionKey.get(char.option)!.push(char);
                }
            });

            if (variantsByOptionKey.size > 0) {
                const groups: VariantGroup[] = Array.from(variantsByOptionKey.entries()).map(([key, variants]) => ({
                    optionKey: key,
                    variants: variants.sort((a,b) => a.unicode! - b.unicode!),
                    description: variants[0]?.desc?.split(':')[0] || key,
                }));
                
                setVariantGroups(groups);
                setPendingScript(scriptWithAddons);
                setIsVariantModalOpen(true);
            } else {
                startProject(scriptWithAddons);
            }

        } catch (error) {
            console.error("Error adding character sets to script:", error);
            onSelectScript(script); // Fallback to original script on any error
        }
    };
    
    const handleConfirmVariants = (selectedVariants: Map<string, number>) => {
        if (!pendingScript || !pendingScript.characterSetData) return;

        const filteredCharData = pendingScript.characterSetData.map(def => {
            if ('characters' in def) {
                const newChars = (def as CharacterSet).characters.filter(char => {
                    if (!char.option || char.unicode === undefined) {
                        return true;
                    }
                    return selectedVariants.get(char.option) === char.unicode;
                });
                return { ...def, characters: newChars };
            }
            return def;
        });

        // After filtering by variant, create a set of all selected character names.
        const selectedCharacterNames = new Set(
            (filteredCharData.filter(d => 'characters' in d) as CharacterSet[])
                .flatMap(cs => cs.characters)
                .map(char => char.name)
        );

        // Perform a second filtering pass to handle conditional characters ('if' property).
        const finalFilteredCharData = filteredCharData.map(def => {
            if ('characters' in def) {
                const conditionallyFilteredChars = (def as CharacterSet).characters.filter(char => {
                    // If the character has an 'if' condition, check if the required character name is present in our set of selected names.
                    if (char.if) {
                        return selectedCharacterNames.has(char.if);
                    }
                    // If there's no 'if' condition, keep the character.
                    return true;
                });
                return { ...def, characters: conditionallyFilteredChars };
            }
            return def;
        });

        const finalScript = { ...pendingScript, characterSetData: finalFilteredCharData };

        setIsVariantModalOpen(false);
        setPendingScript(null);
        startProject(finalScript);
    };
    
    const handleCreateEmptyProject = async (data: NewProjectData) => {
        const { projectName, fontFamily, upm, ascender, descender, includeLatin } = data;
        
        let charDefs: CharacterDefinition[] = [];
        
        // Always include basic characters (numbers etc) if available, or at least ensure an empty structure
        try {
             const res = await fetch('/data/characters_basic.json');
             if (res.ok) {
                 const basicData = await res.json();
                 charDefs = [...charDefs, ...basicData];
             }
        } catch(e) { console.error("Failed to fetch basic characters", e); }

        if (includeLatin) {
            try {
                const res = await fetch('/data/characters_latin.json');
                if (res.ok) {
                    const latinData = await res.json();
                    charDefs = [...charDefs, ...latinData];
                }
            } catch(e) { console.error("Failed to fetch Latin characters", e); }
        }
        
        // Construct a new ScriptConfig based on the Latin template but customized
        // We use the Latin template as a base for grid config, test page settings, etc.
        const baseTemplate = customScriptTemplate || scripts[0];
        
        const newScript: ScriptConfig = {
            ...baseTemplate,
            id: `project_${Date.now()}`,
            nameKey: 'customProject',
            metrics: {
                unitsPerEm: upm,
                ascender: ascender,
                descender: descender,
                defaultAdvanceWidth: 600,
                // Map standard font metrics to canvas visual guides (0-1000 range)
                // This is approximate for visual editor guidance
                topLineY: 300, 
                baseLineY: 700,
                styleName: 'Regular',
                spaceAdvanceWidth: upm / 4,
                defaultLSB: 50,
                defaultRSB: 50
            },
            defaults: {
                fontName: fontFamily,
                strokeThickness: 20,
                pathSimplification: 0.5,
                showGridOutlines: true,
                isAutosaveEnabled: true,
                editorMode: 'advanced',
                isPrefillEnabled: true,
                showUnicodeValues: false,
            },
            characterSetData: charDefs,
            rulesData: { 'DFLT': {} },
            sampleText: "", // Will be auto-generated if empty
        };
        
        // Set the project name (for dashboard) by passing it via a specialized call or relying on the fact
        // that useProjectLoad sets the project name from loaded data.
        // Since we are starting fresh, we need to inject this into the initial project state logic.
        // However, startProject takes a ScriptConfig.
        // We will modify the startProject flow in App.tsx or useProjectLoad to handle an initial project name if needed,
        // but for now, the user can rename it in the header.
        // Better: We can pass a "mock" project data to onSelectScript if we want to pre-fill metadata.
        
        const initialProjectData: ProjectData = {
             settings: { 
                 ...newScript.defaults, 
                 fontName: fontFamily,
                 contrast: newScript.defaults.contrast ?? 1.0,
                 showHiddenGlyphs: newScript.defaults.showHiddenGlyphs ?? false,
                 showUnicodeValues: newScript.defaults.showUnicodeValues ?? false,
             },
             name: projectName, // This sets the dashboard name
             glyphs: [],
             scriptId: newScript.id,
             characterSets: [], // Will be populated from script config by loader
             metrics: newScript.metrics
        };
        
        onSelectScript(newScript, initialProjectData);
        setIsNewProjectModalOpen(false);
    };

    const handleLoadProjectClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const projectData: ProjectData = JSON.parse(text);

                if (projectData.scriptId) {
                    const scriptToLoad = scripts.find(s => s.id === projectData.scriptId);
                    if (scriptToLoad) {
                        onSelectScript(scriptToLoad, projectData);
                    } else if (projectData.scriptId.startsWith('custom_') || projectData.scriptId.startsWith('project_')) {
                         // Handle custom scripts loaded from file
                         handleProjectClick(projectData);
                    } else {
                        showNotification(`Error: Project file is for a script ('${projectData.scriptId}') that is not available in this version of the app.`, 'error');
                    }
                } else {
                    showNotification('Error: Project file is missing a script identifier (scriptId). It may be an old or invalid format.', 'error');
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                showNotification(t('errorLoadingProject', { error: errorMessage }), 'error');
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleConfirmDelete = async () => {
        if (!projectToDelete || projectToDelete.projectId === undefined) return;
    
        try {
            await dbService.deleteProject(projectToDelete.projectId);
            setRecentProjects(prev => prev.filter(p => p.projectId !== projectToDelete.projectId));
            showNotification(`Project "${projectToDelete.name || projectToDelete.settings.fontName}" deleted.`, 'success');
        } catch (error) {
            console.error("Failed to delete project:", error);
            showNotification("Error deleting project.", 'error');
        } finally {
            setProjectToDelete(null);
        }
    };

    const handleTouchStart = (projectId: number) => {
        // Clear any existing timeout
        if (longPressTimeout.current) {
            clearTimeout(longPressTimeout.current);
        }
        longPressTimeout.current = window.setTimeout(() => {
            setLongPressedProjectId(projectId);
            if (navigator.vibrate) {
                navigator.vibrate(50); // Haptic feedback for discoverability
            }
            longPressTimeout.current = null; // Mark timeout as fired
        }, 500); // 500ms for long press
    };

    const handleTouchInteractionEnd = () => {
        if (longPressTimeout.current) {
            clearTimeout(longPressTimeout.current);
        }
    };
    
    /* 
    // Deprecated ScriptCreator logic
    if (isCreatingScript) {
        return (
            <ScriptCreator 
                availableScripts={scripts}
                onBack={() => setIsCreatingScript(false)}
                onSelectScript={handleScriptSelection}
            />
        );
    }
    */
    
    if (isUploadingScript) {
        return (
            <CustomScriptLoader
                onBack={() => setIsUploadingScript(false)}
                onSelectScript={handleScriptSelection}
            />
        );
    }

    return (
        <div className="relative min-h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json"/>
            
            <header className="absolute top-0 right-0 p-4 z-10">
                <div className="flex items-center gap-3">
                     <button onClick={onShowHelp} title={t('help')} className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                          <HelpIcon />
                          <span className="hidden sm:inline">{t('help')}</span>
                     </button>
                     <button onClick={onShowAbout} title={t('about')} className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                          <AboutIcon />
                          <span className="hidden sm:inline">{t('about')}</span>
                     </button>
                     <LanguageSelector />
                </div>
            </header>
            
            <main className="flex-grow flex flex-col items-center justify-center p-4 pt-24 sm:pt-4">
                <div className="text-center mb-10">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-indigo-600 dark:border-indigo-400 flex items-center justify-center mx-auto mb-4">
                        <span
                            className="logo-emboss text-6xl sm:text-7xl text-indigo-600 dark:text-indigo-400"
                            style={{ fontFamily: 'Purnavarman_1' }}
                            aria-hidden="true"
                        >
                            ꦄ
                        </span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-wide mb-2">{t('appTitle')}</h1>
                    <p  style={{ fontFamily: 'Purnavarman_1' }} className="text-xxl sm:text-2xl text-gray-700 dark:text-gray-300 mt-4 max-w-2xl mx-auto">ꦄꦏꦴꦫꦺꦴ ꦩꦸꦑꦃ ꦱꦫ꧀ꦮꦣꦫ꧀ꦩꦴꦟꦴꦩ꧀ </p>
                </div>
                
                {(isLoadingProjects || recentProjects.length > 0) && (
                    <div className="w-full max-w-5xl mb-12">
                         <h2 className="text-2xl font-semibold text-center mb-6 text-indigo-600 dark:text-indigo-400">{t('recentProjects')}</h2>
                         {isLoadingProjects ? (
                             <div className="flex justify-center items-center p-8"><SpinnerIcon/></div>
                         ) : (
                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                 {recentProjects.map(p => {
                                     const scriptForSubtitle = scripts.find(s => s.id === p.scriptId) || (p.scriptId?.startsWith('custom_blocks_') ? { nameKey: 'customBlockFont' } : (p.scriptId?.startsWith('project_') ? { nameKey: 'customProject' } : { nameKey: '' }));
                                     const isDeleteVisible = longPressedProjectId === p.projectId;
                                     // Use the new 'name' field if available, otherwise fallback to fontName for backward compatibility
                                     const displayName = p.name || p.settings.fontName;
                                     
                                     return (
                                        <div
                                            key={p.projectId}
                                            className="relative select-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center justify-between text-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500 cursor-pointer transition-all duration-200 group focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-gray-900 focus-within:ring-indigo-500"
                                            onTouchStart={() => p.projectId !== undefined && handleTouchStart(p.projectId)}
                                            onTouchEnd={handleTouchInteractionEnd}
                                            onTouchMove={handleTouchInteractionEnd}
                                            onContextMenu={(e) => e.preventDefault()}
                                        >
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setProjectToDelete(p);
                                                }}
                                                className={`absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-opacity z-10 ${isDeleteVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                                title={t('delete')}
                                            >
                                                <TrashIcon />
                                            </button>
                                            <div onClick={() => handleProjectClick(p)} className="w-full h-full flex flex-col items-center justify-between text-center">
                                                <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate w-full" title={displayName}>{displayName}</h3>
                                                <RecentProjectPreview project={p} />
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t(scriptForSubtitle.nameKey)}</p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{new Date(p.savedAt!).toLocaleString()}</p>
                                            </div>
                                        </div>
                                     )
                                 })}
                             </div>
                         )}
                    </div>
                )}


                {/* Primary Action Zone */}
                <div className="w-full max-w-5xl mb-12">
                    <h2 className="text-2xl font-semibold text-center mb-2 text-indigo-600 dark:text-indigo-400">{t('selectScriptTitle')}</h2>
                    <div className="flex justify-center items-center mb-8">
                        <label htmlFor="include-latin-toggle" className="flex items-center gap-3 cursor-pointer">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t('includeLatinLetters')}
                            </span>
                            <div className="relative inline-flex items-center">
                                <input
                                    type="checkbox"
                                    id="include-latin-toggle"
                                    className="sr-only peer"
                                    checked={includeLatin}
                                    onChange={(e) => setIncludeLatin(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </div>
                        </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {scripts.map(script => (
                            <button 
                                key={script.id} 
                                onClick={() => handleScriptSelection(script)}
                                type="button"
                                className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center justify-between text-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500 cursor-pointer transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus-within:ring-offset-gray-900 focus:ring-indigo-500"
                            >
                                <div
                                  className="script-card-char group-hover:scale-110 transition-transform duration-200"
                                  aria-hidden="true"
                                  style={{
                                    fontFamily: script.guideFont?.fontName ? `'${script.guideFont.fontName}', 'Noto Sans'` : "'Noto Sans'",
                                    fontFeatureSettings: script.guideFont?.stylisticSet || 'normal'
                                  }}
                                >
                                    {representativeChars[script.id] || script.nameKey[0]}
                                </div>
                                <div className="mt-2">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t(script.nameKey)}</h3>
                                    {script.support === 'partial' && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('partialSupport')}</p>
                                    )}
                                </div>
                            </button>
                        ))}
                        <button
                            key="custom-blocks"
                            onClick={() => setIsBlockSelectorOpen(true)}
                            type="button"
                            className="relative bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500 cursor-pointer transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus-within:ring-offset-gray-900 focus:ring-indigo-500 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                            <div className="script-card-char group-hover:scale-110 transition-transform duration-200" aria-hidden="true">
                                <SwitchScriptIcon />
                            </div>
                            <div className="mt-2">
                                <h3 className="text-lg font-bold">{t('createFromBlocks')}</h3>
                            </div>
                        </button>
                        {/* New Empty Project Button */}
                        <button
                            onClick={() => setIsNewProjectModalOpen(true)}
                            type="button"
                            className="relative bg-white dark:bg-gray-800 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-500 cursor-pointer transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus-within:ring-offset-gray-900 focus:ring-indigo-500 text-indigo-600 dark:text-indigo-400"
                        >
                             <div className="script-card-char group-hover:scale-110 transition-transform duration-200 mb-2" aria-hidden="true">
                                <AddIcon className="w-12 h-12" />
                            </div>
                            <div className="mt-2">
                                <h3 className="text-lg font-bold">{t('createScript')}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('newProjectDesc')}</p>
                            </div>
                        </button>                        
                    </div>
                </div>

                <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 items-start text-center border-t border-gray-200 dark:border-gray-700 pt-10">
                    {/* Secondary Action */}
                    <div className="space-y-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{t('returningUser')}</p>
                        <button
                            onClick={handleLoadProjectClick}
                            className="w-full max-w-xs mx-auto flex items-center justify-center gap-3 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md"
                        >
                            <LoadIcon />
                            <span>{t('load')} Project</span>
                        </button>
                    </div>

                    {/* Advanced Actions */}
                    <div className="space-y-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{t('advanced')}</p>
                        <button
                            onClick={() => setIsUploadingScript(true)}
                            className="w-full max-w-xs mx-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            {t('uploadCustomScript')}
                        </button>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('scriptSelectionUploadDescription')}</p>
                    </div>
                </div>
            </main>
            
            <Footer />

            {/* Modals */}
            <ScriptVariantModal
                isOpen={isVariantModalOpen}
                onClose={() => { setIsVariantModalOpen(false); setPendingScript(null); }}
                onConfirm={handleConfirmVariants}
                script={pendingScript || scripts[0]}
                variantGroups={variantGroups}
            />
            
            <UnicodeBlockSelectorModal 
                isOpen={isBlockSelectorOpen}
                onClose={() => setIsBlockSelectorOpen(false)}
                mode="createScript"
                onSelectScript={onSelectScript}
                customScriptTemplate={customScriptTemplate}
            />
            
            <NewProjectModal 
                isOpen={isNewProjectModalOpen}
                onClose={() => setIsNewProjectModalOpen(false)}
                onConfirm={handleCreateEmptyProject}
            />

             <DeleteProjectConfirmationModal
                isOpen={!!projectToDelete}
                onClose={() => setProjectToDelete(null)}
                onConfirm={handleConfirmDelete}
                projectName={projectToDelete?.name || projectToDelete?.settings.fontName || ''}
            />

        </div>
    );
};

export default ScriptSelection;