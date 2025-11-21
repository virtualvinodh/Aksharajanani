
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ScriptConfig, CharacterSet, CharacterDefinition, ProjectData, Character } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { AboutIcon, HelpIcon, LoadIcon, SwitchScriptIcon, SpinnerIcon, TrashIcon, DRAWING_CANVAS_SIZE } from '../constants';
import LanguageSelector from './LanguageSelector';
import Footer from './Footer';
import { useLayout } from '../contexts/LayoutContext';
import ScriptCreator from './ScriptCreator';
import CustomScriptLoader from './CustomScriptLoader';
import ScriptVariantModal, { VariantGroup } from './ScriptVariantModal';
import UnicodeBlockSelectorModal from './UnicodeBlockSelectorModal';
import * as dbService from '../services/dbService';
import DeleteProjectConfirmationModal from './DeleteProjectConfirmationModal';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { isGlyphDrawn } from '../utils/glyphUtils';

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
        const glyphDataMap = new Map(project.glyphs);
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
        const glyphDataMap = new Map(project.glyphs);

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
    const [isCreatingScript, setIsCreatingScript] = useState(false);
    const [isUploadingScript, setIsUploadingScript] = useState(false);
    const [includeLatin, setIncludeLatin] = useState(false);
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
                },
                grid: customScriptTemplate.grid,
                guideFont: customScriptTemplate.guideFont,
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
            showNotification(`Project "${projectToDelete.settings.fontName}" deleted.`, 'success');
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
    
    if (isCreatingScript) {
        return (
            <ScriptCreator 
                availableScripts={scripts}
                onBack={() => setIsCreatingScript(false)}
                onSelectScript={handleScriptSelection}
            />
        );
    }
    
    if (isUploadingScript) {
        return (
            <CustomScriptLoader
                onBack={() => setIsUploadingScript(false)}
                onSelectScript={handleScriptSelection}
            />
        );
    }

    return (
        <div className="relative min-h-screen text-gray-800 dark:text-gray-200 flex flex-col">
            {/* Let the body background pattern show through, or apply it here if needed on route switch */}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json"/>
            
            <header className="absolute top-0 right-0 p-4 z-10">
                <div className="flex items-center gap-3">
                     <button onClick={onShowHelp} title={t('help')} className="flex items-center gap-2 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-sm backdrop-blur-sm">
                          <HelpIcon />
                          <span className="hidden sm:inline">{t('help')}</span>
                     </button>
                     <button onClick={onShowAbout} title={t('about')} className="flex items-center gap-2 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-sm backdrop-blur-sm">
                          <AboutIcon />
                          <span className="hidden sm:inline">{t('about')}</span>
                     </button>
                     <LanguageSelector />
                </div>
            </header>
            
            <main className="flex-grow flex flex-col items-center justify-center p-4 pt-24 sm:pt-4">
                <div className="text-center mb-10">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-1 shadow-xl mx-auto mb-6 flex items-center justify-center">
                        <div className="w-full h-full rounded-full bg-white dark:bg-gray-900 flex items-center justify-center">
                             <span
                                className="logo-emboss text-7xl sm:text-8xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"
                                style={{ fontFamily: 'Purnavarman_1' }}
                                aria-hidden="true"
                            >
                                ꦄ
                            </span>
                        </div>
                    </div>
                    <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">{t('appTitle')}</h1>
                    <p  style={{ fontFamily: 'Purnavarman_1' }} className="text-xl sm:text-2xl text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto opacity-90">ꦄꦏꦴꦫꦺꦴ ꦩꦸꦑꦃ ꦱꦫ꧀ꦮꦣꦫ꧀ꦩꦴꦟꦴꦩ꧀ </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2 font-medium tracking-wide uppercase">The Mother of Letters</p>
                </div>
                
                {(isLoadingProjects || recentProjects.length > 0) && (
                    <div className="w-full max-w-7xl mb-12 mx-auto px-4">
                         <h2 className="text-xl font-bold text-left mb-6 text-gray-800 dark:text-white border-b border-gray-200 dark:border-gray-800 pb-2 flex items-center gap-2">
                            <span className="bg-indigo-100 dark:bg-indigo-900/30 p-1.5 rounded-md text-indigo-600 dark:text-indigo-400"><LoadIcon/></span>
                            {t('recentProjects')}
                         </h2>
                         {isLoadingProjects ? (
                             <div className="flex justify-center items-center p-8"><SpinnerIcon/></div>
                         ) : (
                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                 {recentProjects.map(p => {
                                     const scriptForSubtitle = scripts.find(s => s.id === p.scriptId) || (p.scriptId?.startsWith('custom_blocks_') ? { nameKey: 'customBlockFont' } : { nameKey: '' });
                                     const isDeleteVisible = longPressedProjectId === p.projectId;
                                     return (
                                        <div
                                            key={p.projectId}
                                            className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-between text-center hover:-translate-y-1 hover:shadow-xl shadow-sm transition-all duration-300 ease-out group cursor-pointer"
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
                                                <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-3 text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                                                    {p.settings.fontName[0].toUpperCase()}
                                                </div>
                                                <h3 className="text-base font-bold text-gray-900 dark:text-white truncate w-full">{p.settings.fontName}</h3>
                                                <RecentProjectPreview project={p} />
                                                <div className="mt-auto w-full">
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">{t(scriptForSubtitle.nameKey)}</p>
                                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{new Date(p.savedAt!).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                     )
                                 })}
                             </div>
                         )}
                    </div>
                )}


                {/* Primary Action Zone */}
                <div className="w-full max-w-7xl mb-12 mx-auto px-4">
                    <h2 className="text-xl font-bold text-left mb-2 text-gray-800 dark:text-white border-b border-gray-200 dark:border-gray-800 pb-2 flex items-center gap-2">
                        <span className="bg-purple-100 dark:bg-purple-900/30 p-1.5 rounded-md text-purple-600 dark:text-purple-400"><SwitchScriptIcon/></span>
                        {t('selectScriptTitle')}
                    </h2>
                    <div className="flex justify-end items-center mb-4">
                        <label htmlFor="include-latin-toggle" className="flex items-center gap-3 cursor-pointer group">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {scripts.map(script => (
                            <button 
                                key={script.id} 
                                onClick={() => handleScriptSelection(script)}
                                type="button"
                                className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:-translate-y-1 hover:shadow-xl shadow-sm cursor-pointer transition-all duration-300 ease-out group min-h-[160px]"
                            >
                                <div
                                  className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300 text-indigo-600 dark:text-indigo-400 drop-shadow-sm"
                                  aria-hidden="true"
                                  style={{
                                    fontFamily: script.guideFont?.fontName ? `'${script.guideFont.fontName}', 'Noto Sans'` : "'Noto Sans'",
                                    fontFeatureSettings: script.guideFont?.stylisticSet || 'normal'
                                  }}
                                >
                                    {representativeChars[script.id] || script.nameKey[0]}
                                </div>
                                <div className="mt-auto w-full">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{t(script.nameKey)}</h3>
                                    {script.support === 'partial' && (
                                        <span className="inline-block mt-2 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-semibold rounded-full">{t('partialSupport')}</span>
                                    )}
                                </div>
                            </button>
                        ))}
                        <button
                            key="custom-blocks"
                            onClick={() => setIsBlockSelectorOpen(true)}
                            type="button"
                            className="relative bg-white/50 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-400 cursor-pointer transition-all duration-300 group min-h-[160px]"
                        >
                            <div className="text-4xl mb-4 text-gray-400 dark:text-gray-500 group-hover:scale-110 transition-transform duration-300 group-hover:text-indigo-500" aria-hidden="true">
                                <SwitchScriptIcon />
                            </div>
                            <div className="mt-auto">
                                <h3 className="text-lg font-bold text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{t('createFromBlocks')}</h3>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-3 gap-8 items-start text-center border-t border-gray-200 dark:border-gray-700 pt-10 mx-auto px-4">
                    {/* Secondary Action */}
                    <div className="space-y-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{t('returningUser')}</p>
                        <button
                            onClick={handleLoadProjectClick}
                            className="w-full max-w-xs mx-auto flex items-center justify-center gap-3 px-6 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-bold rounded-xl hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
                        >
                            <LoadIcon />
                            <span>{t('load')} Project</span>
                        </button>
                    </div>

                    {/* Advanced Actions */}
                    <div className="space-y-4">
                         <p className="font-semibold text-gray-700 dark:text-gray-300">{t('advanced')}</p>
                         <button
                            onClick={() => setIsCreatingScript(true)}
                            className="w-full max-w-xs mx-auto px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            {t('createScript')}
                        </button>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('scriptSelectionCreateDescription')}</p>
                    </div>

                    <div className="space-y-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">&nbsp;</p>
                        <button
                            onClick={() => setIsUploadingScript(true)}
                            className="w-full max-w-xs mx-auto px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            {t('loadCustomScript')}
                        </button>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('scriptSelectionUploadDescription')}</p>
                    </div>
                </div>
            </main>

            {isVariantModalOpen && pendingScript && (
                <ScriptVariantModal
                    isOpen={isVariantModalOpen}
                    onClose={() => {
                        setIsVariantModalOpen(false);
                        setPendingScript(null);
                    }}
                    onConfirm={handleConfirmVariants}
                    script={pendingScript}
                    variantGroups={variantGroups}
                />
            )}
            
            {isBlockSelectorOpen && customScriptTemplate && (
                <UnicodeBlockSelectorModal
                    isOpen={isBlockSelectorOpen}
                    onClose={() => setIsBlockSelectorOpen(false)}
                    onSelectScript={onSelectScript}
                    customScriptTemplate={customScriptTemplate}
                    mode="createScript"
                />
            )}
            
            {projectToDelete && (
                <DeleteProjectConfirmationModal
                    isOpen={!!projectToDelete}
                    onClose={() => setProjectToDelete(null)}
                    onConfirm={handleConfirmDelete}
                    projectName={projectToDelete.settings.fontName}
                />
            )}

            <Footer />
        </div>
    );
};

export default React.memo(ScriptSelection);
