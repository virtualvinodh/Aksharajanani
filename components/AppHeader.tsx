
import React, { useState, useEffect } from 'react';
import { AppSettings, ScriptConfig, PositioningRules, KerningMap, Character, RecommendedKerning } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout, Workspace } from '../contexts/LayoutContext';
import { useSettings } from '../contexts/SettingsContext';
import { SaveIcon, LoadIcon, ExportIcon, SettingsIcon, CompareIcon, SwitchScriptIcon, AboutIcon, PenIcon, MoreIcon, TestIcon, EditIcon, KerningIcon, PositioningIcon, RulesIcon, SparklesIcon, PropertiesIcon, HelpIcon, TestCaseIcon, CheckCircleIcon, SpinnerIcon, CodeBracketsIcon, ImportIcon, SearchIcon } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import CommandPalette from './CommandPalette';

interface Progress {
    completed: number;
    total: number;
}

interface AppHeaderProps {
    script: ScriptConfig;
    settings: AppSettings;
    isExporting: boolean;
    onSaveProject: () => void;
    onSaveToDB: () => void;
    onLoadProject: () => void;
    onImportGlyphsClick: () => void;
    onExportClick: () => void;
    onTestClick: () => void;
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
    const isComplete = progress.total > 0 ? progress.completed >= progress.total : true;
    // Don't show completion for metrics, it's a utility
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
    script, settings, isExporting, onSaveProject, onSaveToDB, onLoadProject, onImportGlyphsClick, onExportClick,
    onTestClick, onCompareClick, onSettingsClick, onChangeScriptClick, onShowAbout,
    onShowHelp, onShowTestCases, onEditorModeChange, onWorkspaceChange, activeWorkspace, hasUnsavedChanges, hasUnsavedRules,
    hasPositioning, hasKerning, drawingProgress, positioningProgress, kerningProgress, rulesProgress, positioningRules,
    kerningMap, allCharsByUnicode, recommendedKerning
}) => {
    const { t } = useLocale();
    const { dispatch: settingsDispatch } = useSettings();
    const [isEditingFontName, setIsEditingFontName] = useState(false);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    
    const { selectCharacter, setWorkspace, setCurrentView } = useLayout();
    
    const kerningLabel = settings.editorMode === 'advanced' ? t('workspaceKerning') : t('workspaceSpacing');
    
    const visibleTabCount = 1 + // Drawing
        (hasPositioning ? 1 : 0) +
        ((settings.editorMode === 'advanced' || script.kerning === 'true') && hasKerning ? 1 : 0) +
        (settings.editorMode === 'advanced' ? 2 : 0); // Rules + Metrics

    let tabIndex = 1;

    const handleCommandAction = (action: string) => {
        if (action === 'save') onSaveToDB();
        if (action === 'export-json') onSaveProject();
        if (action === 'load-json') onLoadProject();
        if (action === 'export') onExportClick();
        if (action === 'test') onTestClick();
        if (action === 'compare') onCompareClick();
        if (action === 'settings') onSettingsClick();
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

    return (
        <>
        <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex flex-col justify-between items-center shadow-md w-full flex-shrink-0 z-20 gap-4">
            <div className="w-full flex flex-col md:flex-row justify-between items-center gap-y-4">
                {/* Right side buttons - order-1 on mobile, order-3 on desktop */}
                <div className="w-full md:flex-1 flex justify-center md:justify-end items-center gap-2 order-1 md:order-3 flex-wrap">
                    {!settings.isAutosaveEnabled && (
                        <button onClick={onSaveToDB} title={t('save')} className="relative flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                            <SaveIcon />
                            <span className="hidden md:inline">{t('save')}</span>
                            {hasUnsavedChanges && (
                                <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-white dark:ring-gray-800" title="Unsaved changes"></span>
                            )}
                        </button>
                    )}
                    
                    <button onClick={() => setIsPaletteOpen(true)} title="Search (Ctrl+K)" className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <SearchIcon />
                        <span className="hidden md:inline">Search</span>
                    </button>

                    <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1 self-center"></div>

                    <button onClick={onExportClick} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400 disabled:cursor-wait">
                        {isExporting ? <SpinnerIcon /> : <ExportIcon />}
                        <span className="hidden md:inline">{isExporting ? t('exporting') : t('exportOtf')}</span>
                    </button>
                    
                    <button onClick={onTestClick} title={t('testFont')} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"><TestIcon /><span className="hidden md:inline">{t('testFont')}</span></button>
                    
                    {settings.editorMode === 'advanced' && (
                        <button onClick={onCompareClick} title={t('compare')} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                            <CompareIcon />
                            <span className="hidden md:inline">{t('compare')}</span>
                        </button>
                    )}

                    <div className="relative">
                    <button onClick={() => setIsMoreMenuOpen(prev => !prev)} className="p-2.5 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"><MoreIcon /></button>
                    {isMoreMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-30 max-h-[80vh] overflow-y-auto">
                            <button onClick={() => { onSaveProject(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><CodeBracketsIcon /> {t('exportJson')}</button>
                            <button onClick={() => { onLoadProject(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><LoadIcon /> {t('load')}</button>
                            <button onClick={() => { onImportGlyphsClick(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><ImportIcon /> {t('importFromProject')}</button>
                            <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                            <button onClick={() => { onSettingsClick(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><SettingsIcon /> {t('settings')}</button>
                            <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                            
                            <button onClick={() => { onChangeScriptClick(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><SwitchScriptIcon /> {t('changeScript')}</button>
                            <button onClick={() => { onShowAbout(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><AboutIcon /> {t('about')}</button>
                            <button onClick={() => { onShowHelp(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><HelpIcon /> {t('help')}</button>
                            <button onClick={() => { onShowTestCases(); setIsMoreMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"><TestCaseIcon /> {t('testCases')}</button>
                        </div>
                    )}
                    </div>
                </div>

                {/* Left side: Logo & Title - order-2 on mobile, order-1 on desktop */}
                <div className="md:flex-1 flex justify-center md:justify-start items-center gap-4 order-2 md:order-1">
                    <button onClick={onChangeScriptClick} title={t('changeScript')} className="flex items-center justify-center gap-4 group">
                        <div className="w-10 h-10 rounded-full border-2 border-indigo-500 dark:border-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors">
                            <span
                                className="logo-emboss text-3xl text-indigo-600 dark:text-indigo-400"
                                style={{ fontFamily: 'Purnavarman_1' }}
                                aria-hidden="true"
                            >
                                ꦄ
                            </span>
                        </div>
                        {/* FIX: Hidden by default on small screens, shown on sm screens and up. */}
                        <h1 className="text-2xl font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap hidden sm:block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{t('appTitle')}</h1>
                    </button>
                    <div className="border-l h-6 border-gray-300 dark:border-gray-600"></div>
                    <div className="flex items-center rounded-lg bg-gray-200 dark:bg-gray-700 p-1">
                        <button
                            onClick={() => onEditorModeChange('simple')}
                            className={`p-2 md:px-3 md:py-1 text-sm font-semibold rounded-md transition-colors ${
                                settings.editorMode === 'simple'
                                    ? 'bg-white dark:bg-gray-800 shadow text-gray-800 dark:text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                            title={t('simpleMode')}
                        >
                            <span className="md:hidden"><SparklesIcon /></span>
                            <span className="hidden md:inline">{t('simpleMode')}</span>
                        </button>
                        <button
                            onClick={() => onEditorModeChange('advanced')}
                            className={`p-2 md:px-3 md:py-1 text-sm font-semibold rounded-md transition-colors ${
                                settings.editorMode === 'advanced'
                                    ? 'bg-white dark:bg-gray-800 shadow text-gray-800 dark:text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                            title={t('advancedMode')}
                        >
                            <span className="md:hidden"><PropertiesIcon /></span>
                            <span className="hidden md:inline">{t('advancedMode')}</span>
                        </button>
                    </div>
                </div>
                
                {/* Center: Font Name - order-3 on mobile, order-2 on desktop */}
                <div className="text-center flex-shrink-0 px-2 order-3 md:order-2">
                    <div className="text-center">
                        {isEditingFontName ? (
                            <input
                                type="text"
                                value={settings.fontName}
                                onChange={(e) => settingsDispatch({ type: 'UPDATE_SETTINGS', payload: s => s ? {...s, fontName: e.target.value} : null })}
                                onBlur={() => setIsEditingFontName(false)}
                                onKeyDown={(e) => e.key === 'Enter' && setIsEditingFontName(false)}
                                className="text-xl font-bold text-center bg-transparent border-b-2 border-indigo-500 focus:outline-none"
                                autoFocus
                            />
                        ) : (
                            <div className="flex items-center justify-center gap-2">
                                <h1 className="text-xl font-bold">{settings.fontName}{hasUnsavedChanges && !settings.isAutosaveEnabled && <span className="text-yellow-400 ml-1" title="Unsaved changes">•</span>}</h1>
                                <button onClick={() => setIsEditingFontName(true)} title={t('editFontName')} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><EditIcon /></button>
                            </div>
                        )}
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t(script.nameKey)}</p>
                    </div>
                </div>
            </div>
            <div className="w-full flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <nav className="flex justify-center space-x-2 px-2 sm:px-4 overflow-x-auto no-scrollbar">
                    <WorkspaceTab workspaceId="drawing" label={t('workspaceDrawing')} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<EditIcon /></>} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={drawingProgress} />
                    {hasPositioning && <WorkspaceTab workspaceId="positioning" label={t('workspacePositioning')} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<PositioningIcon /></>} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={positioningProgress} />}
                    {(settings.editorMode === 'advanced' || script.kerning === 'true') && hasKerning && <WorkspaceTab workspaceId="kerning" label={kerningLabel} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<KerningIcon /></>} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={kerningProgress} />}
                    {settings.editorMode === 'advanced' && <WorkspaceTab workspaceId="rules" label={t('workspaceRules')} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<RulesIcon /></>} showUnsavedIndicator={hasUnsavedRules} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={rulesProgress} />}
                    {settings.editorMode === 'advanced' && <WorkspaceTab workspaceId="metrics" label={t('metrics')} icon={<>{visibleTabCount > 1 && `${tabIndex++}. `}<SettingsIcon /></>} onWorkspaceChange={onWorkspaceChange} activeWorkspace={activeWorkspace} progress={{completed: 0, total: 0}} />}
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
