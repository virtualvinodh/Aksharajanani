
import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, ScriptConfig, PositioningRules, KerningMap, Character, RecommendedKerning } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout, Workspace } from '../contexts/LayoutContext';
import { useSettings } from '../contexts/SettingsContext';
import { useProject } from '../contexts/ProjectContext';
import { SaveIcon, ExportIcon, SettingsIcon, CompareIcon, AboutIcon, TestIcon, EditIcon, KerningIcon, PositioningIcon, RulesIcon, SparklesIcon, HelpIcon, TestCaseIcon, CheckCircleIcon, SpinnerIcon, CodeBracketsIcon, CopyIcon, WrenchIcon, ImportIcon, SearchIcon, BatchIcon, CameraIcon, HistoryIcon, AddIcon, CreatorIcon, MoreIcon, TrashIcon } from '../constants';
import CommandPalette from './CommandPalette';
import { ExportingType } from '../hooks/actions/useExportActions';
import { FilterMenu } from './FilterMenu';

interface Progress {
    completed: number;
    total: number;
}

interface AppHeaderProps {
    script: ScriptConfig;
    settings: AppSettings;
    exportingType: ExportingType;
    onSaveProject: () => void;
    onSaveToDB: () => void;
    onLoadProject: () => void;
    onImportGlyphsClick: () => void;
    onAddGlyphClick: (options?: { prefillName?: string; targetSet?: string }) => void;
    onAddBlock: () => void;
    onExportClick: () => void;
    onTestClick: () => void;
    onCreatorClick: () => void;
    onCompareClick: () => void;
    onSettingsClick: () => void;
    onChangeScriptClick: () => void;
    onShowAbout: () => void;
    onShowHelp: () => void;
    onShowTestCases: () => void;
    onEditorModeChange: (mode: 'simple' | 'advanced') => void;
    onWorkspaceChange: (workspace: Workspace) => void;
    activeWorkspace: Workspace;
    hasUnsavedChanges: boolean;
    hasUnsavedRules: boolean;
    hasPositioning: boolean;
    hasKerning: boolean;
    drawingProgress: Progress;
    positioningProgress: Progress;
    kerningProgress: Progress;
    rulesProgress: Progress;
    positioningRules: PositioningRules[] | null;
    kerningMap?: KerningMap;
    allCharsByUnicode?: Map<number, Character>;
    recommendedKerning?: RecommendedKerning[] | null;
    onTakeSnapshot: () => void;
    onRestoreSnapshot: () => void;
    hasSnapshot: boolean;
    onSaveAs: () => void;
    onExportTemplate: () => void;
    onQuickAddGlyph: (input: string, targetSet?: string) => void;
}

const WorkspaceTab: React.FC<{
    workspaceId: Workspace;
    label: string;
    icon: React.ReactNode;
    showUnsavedIndicator?: boolean;
    onWorkspaceChange: (workspace: Workspace) => void;
    activeWorkspace: Workspace;
    progress: Progress;
}> = React.memo(({ workspaceId, label, icon, showUnsavedIndicator = false, onWorkspaceChange, activeWorkspace, progress }) => {
    const isActive = activeWorkspace === workspaceId;
    const isComplete = progress.total > 0 && progress.completed >= progress.total;
    const showCompletion = workspaceId !== 'metrics' && isComplete;

    return (
      <button
        onClick={() => onWorkspaceChange(workspaceId)}
        title={label}
        className={`flex-shrink-0 flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors relative ${
          isActive
            ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        {showCompletion && !showUnsavedIndicator && <CheckCircleIcon className="h-4 w-4 text-green-500" />}
        {showUnsavedIndicator && <div className="ml-2 w-2 h-2 bg-yellow-400 rounded-full" title="Unsaved changes"></div>}
      </button>
    );
  });


const AppHeader: React.FC<AppHeaderProps> = ({
    script, settings, exportingType, onSaveProject, onSaveToDB, onLoadProject, onImportGlyphsClick, onAddGlyphClick, onExportClick,
    onTestClick, onCompareClick, onSettingsClick, onChangeScriptClick, onShowAbout,
    onShowHelp, onShowTestCases, onEditorModeChange, onWorkspaceChange, activeWorkspace, hasUnsavedChanges, hasUnsavedRules,
    hasPositioning, hasKerning, drawingProgress, positioningProgress, kerningProgress, rulesProgress, positioningRules,
    kerningMap, allCharsByUnicode, recommendedKerning, onTakeSnapshot, onRestoreSnapshot, hasSnapshot, onSaveAs, onExportTemplate,
    onQuickAddGlyph, onCreatorClick
}) => {
    const { t } = useLocale();
    const { projectName, setProjectName } = useProject();
    const [isEditingFontName, setIsEditingFontName] = useState(false);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    
    const { 
        selectCharacter, setWorkspace, setCurrentView, 
        isMetricsSelectionMode, setIsMetricsSelectionMode, setMetricsSelection, 
        setComparisonCharacters,
        openModal
    } = useLayout();
    
    const kerningLabel = (settings.editorMode === 'advanced' || settings.preferKerningTerm) ? t('workspaceKerning') : t('workspaceSpacing');
    
    const visibleTabCount = 1 + (hasPositioning ? 1 : 0) + (hasKerning ? 1 : 0);
    let tabIndex = 1;

    const handleCommandAction = (action: string, data?: any) => {
        if (action === 'save') onSaveToDB();
        if (action === 'save-as') onSaveAs();
        if (action === 'export-json') onSaveProject();
        if (action === 'export-template') onExportTemplate();
        if (action === 'load-json') onLoadProject();
        if (action === 'export') onExportClick();
        if (action === 'test') onTestClick();
        if (action === 'creator') onCreatorClick();
        if (action === 'compare') onCompareClick();
        if (action === 'settings') onSettingsClick();
        if (action === 'add-glyph') onAddGlyphClick(data);
        if (action === 'quick-add-glyph') {
            onQuickAddGlyph(data?.prefillName, data?.targetSet);
        }
    };

    const toggleSelectionMode = () => {
        if (isMetricsSelectionMode) {
             setIsMetricsSelectionMode(false);
             setMetricsSelection(new Set());
        } else {
             setIsMetricsSelectionMode(true);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
                setIsMoreMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isAnyExporting = exportingType !== null;

    return (
        <>
        <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-2 sm:p-4 flex flex-col shadow-md w-full flex-shrink-0 z-50 gap-2 sm:gap-4">
            
            <div className="w-full flex flex-wrap items-center justify-between md:justify-center gap-y-2 md:gap-x-8 md:gap-y-4">
                <div className="order-1 flex flex-1 md:flex-none items-center justify-center md:justify-center gap-3">
                    <button onClick={onChangeScriptClick} title={t('changeScript')} className="flex items-center justify-center gap-2 sm:gap-3 group">
                        <div className="w-10 h-10 rounded-full border-2 border-indigo-500 dark:border-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors">
                            <span className="logo-emboss text-3xl text-indigo-600 dark:text-indigo-400" style={{ fontFamily: 'Purnavarman_1' }} aria-hidden="true">ꦄ</span>
                        </div>
                        <h1 className="hidden sm:block text-2xl font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{t('appTitle')}</h1>
                    </button>
                    <div className="hidden md:block h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
                </div>

                <div className="order-2 flex items-center justify-end md:justify-center gap-3 sm:gap-2 flex-shrink-0">
                    <div className="md:hidden h-8 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
                     {!settings.isAutosaveEnabled && (
                        <button onClick={onSaveToDB} title={t('save')} className="relative flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base">
                            <SaveIcon />
                            <span className="hidden md:inline">{t('save')}</span>
                            {hasUnsavedChanges && <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-white dark:ring-gray-800" title="Unsaved changes"></span>}
                        </button>
                    )}
                    
                    <button onClick={onExportClick} disabled={isAnyExporting} className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400 disabled:cursor-wait text-sm sm:text-base">
                        {exportingType === 'export' ? <SpinnerIcon /> : <ExportIcon />}
                        <span className="hidden md:inline">{exportingType === 'export' ? t('exporting') : t('exportOtf')}</span>
                    </button>
                    
                    <button 
                        onClick={onCreatorClick} 
                        disabled={isAnyExporting} 
                        title="Creator Studio" 
                        className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base disabled:bg-purple-400 disabled:cursor-wait"
                    >
                        {exportingType === 'create' ? <SpinnerIcon /> : <CreatorIcon />}
                        <span className="hidden md:inline">Create</span>
                    </button>
                    
                    <button onClick={onTestClick} disabled={isAnyExporting} title={t('testFont')} className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base disabled:opacity-50 disabled:cursor-wait">
                        {exportingType === 'test' ? <SpinnerIcon /> : <TestIcon />}
                        <span className="hidden md:inline">{t('testFont')}</span>
                    </button>
                    
                    <button onClick={onSettingsClick} title={t('settings')} className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"><SettingsIcon /><span className="hidden md:inline">{t('settings')}</span></button>
                    
                    <div className="relative" ref={moreMenuRef}>
                        <button onClick={() => setIsMoreMenuOpen(prev => !prev)} className="p-2 sm:p-2.5 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"><MoreIcon /></button>
                        {isMoreMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-30 max-h-[80vh] overflow-y-auto">
                                <button onClick={() => { onSaveProject(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><CodeBracketsIcon /> {t('exportJson')}</button>
                                <button onClick={() => { onExportTemplate(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><ExportIcon /> {t('exportTemplate')}</button>
                                <button onClick={() => { onSaveAs(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><CopyIcon /> Save Copy...</button>
                                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                                <button onClick={() => { onImportGlyphsClick(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><ImportIcon /> {t('importFromProject')}</button>
                                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                                <button onClick={() => { onTakeSnapshot(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><CameraIcon /> Take Snapshot</button>
                                <button onClick={() => { onRestoreSnapshot(); setIsMoreMenuOpen(false); }} disabled={!hasSnapshot} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"><HistoryIcon /> Restore Snapshot</button>
                                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                                <button onClick={() => { setCurrentView('rules'); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <RulesIcon /> {t('workspaceRules')}
                                    {hasUnsavedRules && <span className="ml-auto w-2 h-2 bg-yellow-400 rounded-full" title="Unsaved changes"></span>}
                                </button>
                                <button onClick={() => { openModal('positioningRulesManager'); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <WrenchIcon /> {t('managePositioningRules')}
                                </button>
                                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                                <button onClick={() => { onShowAbout(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><AboutIcon /> {t('about')}</button>
                                <button onClick={() => { onShowHelp(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><HelpIcon /> {t('help')}</button>
                                <button onClick={() => { onShowTestCases(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><TestCaseIcon /> {t('testCases')}</button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="order-3 w-full flex items-center justify-center p-1 border-t border-gray-200 dark:border-gray-700 relative">
                    <div className="flex items-center justify-center gap-4">
                        <div className="text-center flex-grow md:flex-grow-0">
                             {isEditingFontName ? (
                                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} onBlur={() => setIsEditingFontName(false)} onKeyDown={(e) => e.key === 'Enter' && setIsEditingFontName(false)} className="text-lg sm:text-xl font-bold text-center bg-transparent border-b-2 border-indigo-500 focus:outline-none w-full md:w-auto" autoFocus />
                            ) : (
                                <div className="flex items-center justify-center gap-2">
                                    <h1 className="text-lg sm:text-xl font-bold truncate max-w-[200px] sm:max-w-xs">{projectName}{hasUnsavedChanges && !settings.isAutosaveEnabled && <span className="text-yellow-400 ml-1" title="Unsaved changes">•</span>}</h1>
                                    <button onClick={() => setIsEditingFontName(true)} title="Rename Project" className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0 text-gray-500 dark:text-gray-400"><EditIcon /></button>
                                </div>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px] sm:max-w-xs mx-auto">{t(script.nameKey)}</p>
                        </div>
                        
                        {!isEditingFontName && (
                            <>
                            <button
                                onClick={() => setIsPaletteOpen(true)}
                                title="Command Palette (Ctrl+K)"
                                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
                            >
                                <SearchIcon className="w-5 h-5" />
                                <span className="hidden md:inline">Command</span>
                            </button>
                            
                            <FilterMenu />

                            <button
                                onClick={onCompareClick}
                                title={t('compare')}
                                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
                            >
                                <CompareIcon className="w-5 h-5" />
                                <span className="hidden sm:inline">{t('compare')}</span>
                            </button>

                             {activeWorkspace === 'drawing' && (
                                 <button
                                     onClick={toggleSelectionMode}
                                     className={`flex items-center gap-1 px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base font-semibold transition-colors ${isMetricsSelectionMode ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                                     title="Toggle Batch Selection"
                                 >
                                     <BatchIcon className="w-5 h-5" />
                                     <span className="hidden sm:inline">{t('select')}</span>
                                 </button>
                             )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="w-full flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <nav className="flex justify-center space-x-2 px-2 sm:px-4 overflow-x-auto no-scrollbar">
                    <WorkspaceTab workspaceId="drawing" label={t('workspaceDrawing')} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<EditIcon /></>} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={drawingProgress} />
                    {hasPositioning && <WorkspaceTab workspaceId="positioning" label={t('workspacePositioning')} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<PositioningIcon /></>} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={positioningProgress} />}
                    {hasKerning && <WorkspaceTab workspaceId="kerning" label={kerningLabel} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<KerningIcon /></>} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={kerningProgress} />}
                </nav>
            </div>
        </header>
        <CommandPalette 
            isOpen={isPaletteOpen} 
            onClose={() => setIsPaletteOpen(false)} 
            onSelectGlyph={selectCharacter}
            onSetWorkspace={setWorkspace}
            onAction={handleCommandAction}
            positioningRules={positioningRules}
            script={script}
            hasKerning={hasKerning}
            kerningMap={kerningMap}
            allCharsByUnicode={allCharsByUnicode}
            recommendedKerning={recommendedKerning}
        />
        </>
    );
};

export default React.memo(AppHeader);
