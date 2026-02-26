
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ScriptConfig, ProjectData, Character, GlyphData } from './types';
import UnifiedEditorModal from './components/UnifiedEditorModal';
import SettingsPage from './components/SettingsPage';
import ComparisonView from './components/ComparisonView';
import ConfirmationModal from './components/ConfirmationModal';
import IncompleteFontWarningModal from './components/IncompleteFontWarningModal';
import FontTestPage from './components/FontTestPage';
import Footer from './components/Footer';
import DonateNotice from './components/DonateNotice';
import AddGlyphModal from './components/AddGlyphModal';
import UnicodeBlockSelectorModal from './components/UnicodeBlockSelectorModal';
import PositioningUpdateWarningModal from './components/PositioningUpdateWarningModal';
import FeaErrorModal from './components/FeaErrorModal';
import UnsavedRulesModal from './components/UnsavedRulesModal';
import AppHeader from './components/AppHeader';
import DrawingWorkspace from './components/DrawingWorkspace';
import PositioningWorkspace from './components/PositioningWorkspace';
import KerningWorkspace from './components/KerningWorkspace';
import RulesWorkspace from './components/RulesWorkspace';
import TestCasePage from './components/TestCasePage';
import ExportAnimation from './components/ExportAnimation';
import ImportGlyphsModal from './components/ImportGlyphsModal';
import ImportFontModal from './components/ImportFontModal';
import SnapshotRestoreModal from './components/SnapshotRestoreModal';
import SaveAsModal from './components/SaveAsModal';
import CreatorPage from './components/CreatorPage';
import MobileNavDrawer from './components/MobileNavDrawer';
import TutorialManager from './components/TutorialManager';
import CelebrationManager from './components/CelebrationManager'; // Added
import { useLocale } from './contexts/LocaleContext';
import { useLayout } from './contexts/LayoutContext';
import { useGlyphData } from './contexts/GlyphDataContext';
import { useKerning } from './contexts/KerningContext';
import { useSettings } from './contexts/SettingsContext';
import { useClipboard } from './contexts/ClipboardContext';
import { usePositioning } from './contexts/PositioningContext';
import { useRules } from './contexts/RulesContext';
import { useProject } from './contexts/ProjectContext';
import { useProgressCalculators } from './hooks/useProgressCalculators';
import { useAppActions } from './hooks/useAppActions';
import { TOOL_RANGES, LeftArrowIcon, RightArrowIcon, GridViewIcon, SplitViewIcon, EditorViewIcon } from './constants';
import { useMediaQuery } from './hooks/useMediaQuery';
import PositioningRulesModal from './components/PositioningRulesModal';

const GUIDE_FONT_STYLE_ID = 'guide-font-face-style';

interface AppProps {
  allScripts: ScriptConfig[];
  onBackToSelection: () => void;
  onShowAbout: () => void;
  onShowHelp: () => void;
  onShowTestCases: () => void;
  projectDataToRestore: ProjectData | null;
}

const App: React.FC<AppProps> = ({ allScripts, onBackToSelection, onShowAbout, onShowHelp, onShowTestCases, projectDataToRestore }) => {
  const { t } = useLocale();

  const layout = useLayout();
  const { script, characterSets, allCharsByUnicode, allCharsByName, projectName, guideFont } = useProject();
  const { glyphDataMap, version: glyphVersion } = useGlyphData();
  const { kerningMap } = useKerning();
  const { settings, metrics, dispatch: settingsDispatch } = useSettings();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  const { markPositioningMap } = usePositioning();
  const { state: rulesState } = useRules();
  
  const { fontRules, isFeaEditMode, manualFeaCode, hasUnsavedRules } = rulesState;
  const { workspace, currentView, setCurrentView, selectedCharacter, selectCharacter, closeCharacterModal, panelLayout, setPanelLayout, isNavDrawerOpen, closeNavDrawer } = layout;

  const isLargeScreen = useMediaQuery('(min-width: 1024px)');

  const [isDonateNoticeVisible, setIsDonateNoticeVisible] = useState(false);
  const [isAnimatingExport, setIsAnimatingExport] = useState(false);
  const downloadTriggerRef = useRef<(() => void) | null>(null);

  // State for mobile editor animation
  const [editorClosing, setEditorClosing] = useState(false);

  // State for mobile navigation drawer animation
  const [isNavDrawerVisible, setNavDrawerVisible] = useState(false);
  const [isNavDrawerAnimatingOut, setNavDrawerAnimatingOut] = useState(false);
  
  const characterForModal = useMemo(() => {
    if (!selectedCharacter?.unicode) return selectedCharacter;
    return allCharsByUnicode.get(selectedCharacter.unicode) || selectedCharacter;
  }, [selectedCharacter, allCharsByUnicode]);


  useEffect(() => {
    if (isNavDrawerOpen) {
      setNavDrawerVisible(true);
      setNavDrawerAnimatingOut(false);
    } else {
      setNavDrawerAnimatingOut(true);
      const timer = setTimeout(() => {
        setNavDrawerVisible(false);
      }, 300); // Animation duration
      return () => clearTimeout(timer);
    }
  }, [isNavDrawerOpen]);

  useEffect(() => {
    if (selectedCharacter) {
      setEditorClosing(false);
    }
  }, [selectedCharacter]);

  const closeEditorWithAnimation = useCallback(() => {
    if (!isLargeScreen) {
        setEditorClosing(true);
        setTimeout(() => {
            closeCharacterModal();
            setCurrentView('grid');
            setEditorClosing(false);
        }, 300); // Animation duration
    } else {
        closeCharacterModal();
        setCurrentView('grid');
    }
  }, [isLargeScreen, closeCharacterModal, setCurrentView]);
  
  const appActions = useAppActions({ 
      projectDataToRestore, onBackToSelection, allScripts, hasUnsavedRules,
      setIsAnimatingExport, downloadTriggerRef
  });
  const { 
      recommendedKerning, 
      positioningRules, 
      markAttachmentRules, 
      markAttachmentClasses, 
      baseAttachmentClasses, 
      isFeaOnlyMode,
      testText, 
      setTestText,
      exportingType,
      feaErrorState,
      fileInputRef,
      isScriptDataLoading,
      scriptDataError,
      hasUnsavedChanges,
      handleSaveProject,
      handleSaveTemplate, 
      handleLoadProject,
      handleFileChange,
      handleChangeScriptClick,
      handleWorkspaceChange,
      handleSaveGlyph,
      handleDeleteGlyph,
      handleUnlockGlyph,
      handleRelinkGlyph,
      handleUpdateDependencies,
      handleEditorModeChange,
      downloadFontBlob,
      handleAddGlyph,
      handleQuickAddGlyph,
      handleCheckGlyphExists,
      handleCheckNameExists,
      handleAddBlock,
      handleImportGlyphs,
      handleSaveToDB,
      handleTestClick,
      creatorFont,
      handleTakeSnapshot,
      handleRestoreSnapshot,
      hasSnapshot,
      openSaveAsModal,
      handleCreatorClick,
      startExportProcess,
      handleLoadProjectData
  } = appActions;
  
  const mainContainerRef = useRef<HTMLElement>(null);
  const [gridPanelWidth, setGridPanelWidth] = useState<number>(() => {
    const savedWidth = localStorage.getItem('gridPanelWidth');
    return savedWidth ? parseInt(savedWidth, 10) : Math.max(200, window.innerWidth * 0.15);
  });

  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = gridPanelWidth;
      const mainContainer = mainContainerRef.current;
      if (!mainContainer) return;

      const doDrag = (moveEvent: MouseEvent) => {
          const newWidth = startWidth + (moveEvent.clientX - startX);
          const minWidth = 200; 
          const maxWidth = mainContainer.clientWidth * 0.75; 
          setGridPanelWidth(Math.max(minWidth, Math.min(newWidth, maxWidth)));
      };

      const stopDrag = () => {
          document.documentElement.removeEventListener('mousemove', doDrag);
          document.documentElement.removeEventListener('mouseup', stopDrag);
      };

      document.documentElement.addEventListener('mousemove', doDrag);
      document.documentElement.addEventListener('mouseup', stopDrag);
  }, [gridPanelWidth]);

  const handleTouchStartResize = useCallback((e: React.TouchEvent) => {
      const startX = e.touches[0].clientX;
      const startWidth = gridPanelWidth;
      const mainContainer = mainContainerRef.current;
      if (!mainContainer) return;

      const doDrag = (moveEvent: TouchEvent) => {
          const newWidth = startWidth + (moveEvent.touches[0].clientX - startX);
          const minWidth = 220; 
          const maxWidth = mainContainer.clientWidth * 0.75; 
          setGridPanelWidth(Math.max(minWidth, Math.min(newWidth, maxWidth)));
      };

      const stopDrag = () => {
          document.documentElement.removeEventListener('touchmove', doDrag);
          document.documentElement.removeEventListener('touchend', stopDrag);
          document.documentElement.removeEventListener('touchcancel', stopDrag);
      };

      document.documentElement.addEventListener('touchmove', doDrag);
      document.documentElement.addEventListener('touchend', stopDrag);
      document.documentElement.addEventListener('touchcancel', stopDrag);
  }, [gridPanelWidth]);
  
  useEffect(() => {
    localStorage.setItem('gridPanelWidth', String(gridPanelWidth));
  }, [gridPanelWidth]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!localStorage.getItem('donateNoticeDismissed')) {
        setIsDonateNoticeVisible(true);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (settings?.isAutosaveEnabled) {
          handleSaveProject();
        } else {
          handleSaveToDB();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSaveProject, handleSaveToDB, settings?.isAutosaveEnabled]);

  const {
      drawingProgress,
      positioningProgress,
      kerningProgress,
      rulesProgress,
      hasKerning,
  } = useProgressCalculators({
      characterSets,
      glyphDataMap,
      markPositioningMap,
      recommendedKerning,
      allCharsByName,
      fontRules,
      kerningMap,
      positioningRules,
      glyphVersion
  });
  
  useEffect(() => {
    const activeGuideFont = guideFont || script?.guideFont;
    
    const existingStyle = document.getElementById(GUIDE_FONT_STYLE_ID); 
    if (existingStyle) existingStyle.remove();

    if (activeGuideFont && activeGuideFont.fontName && activeGuideFont.fontUrl) {
        const styleEl = document.createElement('style'); 
        styleEl.id = GUIDE_FONT_STYLE_ID;
        styleEl.innerHTML = `@font-face { font-family: "${activeGuideFont.fontName}"; src: url('${activeGuideFont.fontUrl}') format('truetype'); font-display: swap; }`;
        document.head.appendChild(styleEl);
        document.documentElement.style.setProperty('--guide-font-family', `"${activeGuideFont.fontName}", sans-serif`);
        document.documentElement.style.setProperty('--guide-font-feature-settings', activeGuideFont.stylisticSet || 'normal');
    } else { 
        document.documentElement.style.removeProperty('--guide-font-family'); 
        document.documentElement.style.removeProperty('--guide-font-feature-settings'); 
    }
    
    return () => { 
        document.documentElement.style.removeProperty('--guide-font-family'); 
        document.documentElement.style.removeProperty('--guide-font-feature-settings'); 
        const el = document.getElementById(GUIDE_FONT_STYLE_ID); 
        if (el) el.remove(); 
    };
  }, [script, guideFont]);
  
  const handleCompareClick = () => {
    if (layout.isMetricsSelectionMode && layout.metricsSelection.size > 0) {
        layout.setComparisonCharacters(
            characterSets?.flatMap(s => s.characters).filter(c => 
                c.unicode !== undefined && layout.metricsSelection.has(c.unicode)
            ) || []
        );
        layout.setIsMetricsSelectionMode(false);
        layout.setMetricsSelection(new Set());
    }
    setCurrentView('comparison');
  };

  if (scriptDataError) {
    return (
        <div className="h-screen bg-white dark:bg-gray-900 text-red-500 dark:text-red-400 flex flex-col items-center justify-center p-4">
            <h1 className="text-2xl font-bold mb-4">Error Loading Script Data</h1>
            <p className="text-center bg-gray-100 dark:bg-gray-800 p-4 rounded-md">{scriptDataError}</p>
            <button onClick={onBackToSelection} className="mt-6 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
                {t('back')} to Script Selection
            </button>
        </div>
    );
  }

  if (isScriptDataLoading || !script || !settings || !metrics || !characterSets) {
    return <div className="h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex items-center justify-center p-4"><h1 className="text-2xl font-semibold animate-pulse">{t('loadingScript')}...</h1></div>;
  }

  const hasPositioning = positioningProgress.total > 0;
  
  const showEditorPanel = isLargeScreen && characterForModal && workspace === 'drawing' && (panelLayout === 'split' || panelLayout === 'editor');
  const RESIZER_WIDTH = isLargeScreen ? 8 : 16; 

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col">
       <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
       
       <TutorialManager />
       <CelebrationManager />

       {currentView === 'creator' ? (
           <CreatorPage 
                fontBlob={creatorFont?.blob ?? null}
           />
       ) : currentView === 'settings' ? (
           <SettingsPage toolRanges={TOOL_RANGES} />
       ) : currentView === 'comparison' ? (
           <ComparisonView />
       ) : currentView === 'rules' ? (
           <RulesWorkspace 
                
                positioningRules={positioningRules}
                isFeaOnlyMode={isFeaOnlyMode}
                rulesProgress={rulesProgress}
            />
       ) : (
           <>
               <AppHeader
                script={script}
                settings={settings}
                exportingType={exportingType}
                onSaveProject={handleSaveProject}
                onSaveToDB={handleSaveToDB}
                onLoadProject={handleLoadProject}
                onImportGlyphsClick={() => layout.openModal('importGlyphs')}
                onAddGlyphClick={(options) => layout.openModal('addGlyph', options)}
                onAddBlock={() => layout.openModal('addBlock')}
                onExportClick={startExportProcess}
                onTestClick={handleTestClick}
                onCreatorClick={handleCreatorClick}
                onCompareClick={handleCompareClick}
                onSettingsClick={() => setCurrentView('settings')}
                onChangeScriptClick={handleChangeScriptClick}
                onShowAbout={onShowAbout}
                onShowHelp={onShowHelp}
                onShowTestCases={onShowTestCases}
                onEditorModeChange={handleEditorModeChange}
                onWorkspaceChange={handleWorkspaceChange}
                activeWorkspace={workspace}
                hasUnsavedChanges={hasUnsavedChanges}
                hasUnsavedRules={hasUnsavedRules}
                hasPositioning={hasPositioning}
                hasKerning={hasKerning}
                drawingProgress={drawingProgress}
                positioningProgress={positioningProgress}
                kerningProgress={kerningProgress}
                rulesProgress={rulesProgress}
                positioningRules={positioningRules}
                kerningMap={kerningMap}
                allCharsByUnicode={allCharsByUnicode}
                recommendedKerning={recommendedKerning}
                onTakeSnapshot={handleTakeSnapshot}
                onRestoreSnapshot={handleRestoreSnapshot}
                hasSnapshot={hasSnapshot}
                onSaveAs={openSaveAsModal}
                onExportTemplate={handleSaveTemplate}
                onQuickAddGlyph={handleQuickAddGlyph}
               />

              <main ref={mainContainerRef} className="flex-1 flex overflow-hidden relative">
                <div 
                    className="flex-shrink-0 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900/50 transition-all duration-300"
                    style={{ 
                      width: isLargeScreen && panelLayout === 'split' && workspace === 'drawing' ? `${gridPanelWidth}px` : (panelLayout === 'grid' || !isLargeScreen || workspace !== 'drawing' ? '100%' : '0px'),
                      display: isLargeScreen && panelLayout === 'editor' && workspace === 'drawing' ? 'none' : 'flex'
                    }}
                >
                  {workspace === 'drawing' && (
                      <DrawingWorkspace
                        characterSets={characterSets}
                        onSelectCharacter={selectCharacter}
                        onAddGlyph={(targetSet) => layout.openModal('addGlyph', { targetSet })}
                        onAddBlock={() => layout.openModal('addBlock')}
                        drawingProgress={drawingProgress}
                        isCompactView={panelLayout === 'split'}
                      />
                  )}
                  {workspace === 'positioning' && positioningRules && (
                    <PositioningWorkspace 
                      positioningRules={positioningRules}
                      markAttachmentRules={markAttachmentRules}
                      markAttachmentClasses={markAttachmentClasses}
                      baseAttachmentClasses={baseAttachmentClasses}
                      positioningProgress={positioningProgress}
                    />
                  )}
                  {workspace === 'kerning' && (
                      <KerningWorkspace 
                        recommendedKerning={recommendedKerning ?? []}
                        kerningProgress={kerningProgress}
                      />
                  )}
                </div>

                {showEditorPanel && characterForModal && (
                    <>
                        <div 
                            data-tour="split-view-resizer"
                            onMouseDown={panelLayout === 'split' ? handleMouseDownResize : undefined}
                            onTouchStart={panelLayout === 'split' ? handleTouchStartResize : undefined}
                            className="resizer"
                            style={{ width: `${RESIZER_WIDTH}px` }}
                        />
                        <aside 
                            className="flex-shrink-0 bg-white dark:bg-gray-900 shadow-xl z-20 transition-all duration-300"
                            style={{ 
                                width: panelLayout === 'editor' ? '100%' : `calc(100% - ${gridPanelWidth}px - ${RESIZER_WIDTH}px)`,
                            }}
                        >
                            <UnifiedEditorModal
                                key={characterForModal.unicode || "unified-editor-panel"}
                                mode="panel"
                                character={characterForModal}
                                characterSet={characterSets.find(cs => cs.characters.some(c => c.unicode === characterForModal.unicode)) || characterSets[layout.activeTab]}
                                glyphData={glyphDataMap.get(characterForModal.unicode)}
                                onSave={handleSaveGlyph}
                                onDelete={handleDeleteGlyph}
                                onUnlockGlyph={handleUnlockGlyph}
                                onRelinkGlyph={handleRelinkGlyph}
                                onUpdateDependencies={handleUpdateDependencies}
                                onNavigate={selectCharacter}
                                settings={settings}
                                metrics={metrics}
                                allGlyphData={glyphDataMap}
                                allCharacterSets={characterSets}
                                gridConfig={script.grid}
                                clipboard={clipboard}
                                setClipboard={(paths) => clipboardDispatch({ type: 'SET_CLIPBOARD', payload: paths })}
                                onClose={closeEditorWithAnimation}
                                markAttachmentRules={markAttachmentRules}
                                onEditorModeChange={handleEditorModeChange}
                            />
                        </aside>
                    </>
                )}
                 {isLargeScreen && characterForModal && workspace === 'drawing' && (
                    <>
                        {panelLayout === 'split' && (
                             <div 
                                className="absolute top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 p-1 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm"
                                style={{ left: `${gridPanelWidth}px`, transform: 'translateX(-50%)' }}
                            >
                                <button onClick={() => setPanelLayout('grid')} title="Maximize editor" className="p-1.5 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-gray-700 dark:hover:text-indigo-400 rounded-full transition-colors">
                                    <RightArrowIcon className="w-4 h-4" />
                                </button>
                                <button onClick={() => setPanelLayout('editor')} title="Maximize grid" className="p-1.5 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-gray-700 dark:hover:text-indigo-400 rounded-full transition-colors">
                                    <LeftArrowIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        
                        {panelLayout === 'grid' && (
                             <button
                                onClick={() => setPanelLayout('split')}
                                title="Show Split View"
                                className="absolute top-1/2 -translate-y-1/2 z-30 w-6 h-24 bg-white dark:bg-gray-800 border-t border-b border-l border-r-0 border-gray-300 dark:border-gray-600 shadow-lg flex items-center justify-center transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-700 right-0 rounded-l-lg"
                            >
                                <LeftArrowIcon />
                            </button>
                        )}

                        {panelLayout === 'editor' && (
                             <button
                                onClick={() => setPanelLayout('split')}
                                title="Show Split View"
                                className="absolute top-1/2 -translate-y-1/2 z-30 w-6 h-24 bg-white dark:bg-gray-800 border-t border-b border-l-0 border-r border-gray-300 dark:border-gray-600 shadow-lg flex items-center justify-center transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-700 left-0 rounded-r-lg"
                            >
                                <RightArrowIcon />
                            </button>
                        )}
                    </>
                )}
              </main>
              
              <Footer hideOnMobile={true} />
           </>
       )}
       
       {!isLargeScreen && characterForModal && currentView === 'editor' && (
            <UnifiedEditorModal
                key={characterForModal.unicode || "unified-editor-modal"}
                mode="modal"
                isClosing={editorClosing}
                character={characterForModal}
                characterSet={characterSets.find(cs => cs.characters.some(c => c.unicode === characterForModal.unicode)) || characterSets[layout.activeTab]}
                glyphData={glyphDataMap.get(characterForModal.unicode)}
                onSave={handleSaveGlyph}
                onDelete={handleDeleteGlyph}
                onUnlockGlyph={handleUnlockGlyph}
                onRelinkGlyph={handleRelinkGlyph}
                onUpdateDependencies={handleUpdateDependencies}
                onNavigate={selectCharacter}
                settings={settings}
                metrics={metrics}
                allGlyphData={glyphDataMap}
                allCharacterSets={characterSets}
                gridConfig={script.grid}
                clipboard={clipboard}
                setClipboard={(paths) => clipboardDispatch({ type: 'SET_CLIPBOARD', payload: paths })}
                onClose={closeEditorWithAnimation}
                markAttachmentRules={markAttachmentRules}
                onEditorModeChange={handleEditorModeChange}
            />
       )}
       
       {!isLargeScreen && isNavDrawerVisible && (
            <MobileNavDrawer
                isAnimatingOut={isNavDrawerAnimatingOut}
                onClose={closeNavDrawer}
                characterSets={characterSets}
                onSelectCharacter={selectCharacter}
                onAddGlyph={(targetSet) => layout.openModal('addGlyph', { targetSet })}
                onAddBlock={() => layout.openModal('addBlock')}
                drawingProgress={drawingProgress}
                onExportClick={startExportProcess}
                onCreatorClick={handleCreatorClick}
                onTestClick={handleTestClick}
                onSettingsClick={() => setCurrentView('settings')}
                onCompareClick={handleCompareClick}
                toggleSelectionMode={() => layout.setIsMetricsSelectionMode(!layout.isMetricsSelectionMode)}
                isMetricsSelectionMode={layout.isMetricsSelectionMode}
                setIsPaletteOpen={layout.openPalette}
                exportingType={exportingType}
            />
        )}
      
      {isDonateNoticeVisible && (
          <DonateNotice onClose={() => {
              setIsDonateNoticeVisible(false);
              localStorage.setItem('donateNoticeDismissed', 'true');
          }} />
      )}

      {isAnimatingExport && settings && (
        <ExportAnimation
          isOpen={isAnimatingExport}
          onComplete={() => {
            setIsAnimatingExport(false);
            if (downloadTriggerRef.current) {
              downloadTriggerRef.current();
              downloadTriggerRef.current = null;
            }
          }}
          glyphDataMap={glyphDataMap}
          settings={settings}
          glyphVersion={glyphVersion}
        />
      )}

      {layout.activeModal?.name === 'addGlyph' && (
          <AddGlyphModal 
            isOpen={true} 
            onClose={layout.closeModal} 
            onAdd={(data) => handleAddGlyph(data, layout.activeModal?.props?.targetSet)}
            onCheckExists={handleCheckGlyphExists} 
            onCheckNameExists={handleCheckNameExists} 
            initialName={layout.activeModal?.props?.prefillName}
        />
      )}
      {layout.activeModal?.name === 'addBlock' && <UnicodeBlockSelectorModal isOpen={true} onClose={layout.closeModal} onAddBlock={handleAddBlock} onCheckExists={handleCheckGlyphExists} mode="addBlocks" />}
      {layout.activeModal?.name === 'importGlyphs' && <ImportGlyphsModal isOpen={true} onClose={layout.closeModal} onImport={handleImportGlyphs} allScripts={allScripts} />}
      {layout.activeModal?.name === 'importFont' && (
          <ImportFontModal 
            isOpen={true} 
            onClose={layout.closeModal} 
            onImport={(data) => {
                handleLoadProjectData(data);
                layout.closeModal();
            }} 
        />
      )}
      {layout.activeModal?.name === 'confirmChangeScript' && <ConfirmationModal isOpen={true} onClose={layout.closeModal} title={t('confirmChangeScriptTitle')} message={t('confirmChangeScriptMessage')} {...layout.activeModal.props} />}
      {layout.activeModal?.name === 'confirmLoadProject' && <ConfirmationModal isOpen={true} onClose={layout.closeModal} title={t('confirmLoadProjectTitle')} message={t('confirmLoadProjectMessage')} {...layout.activeModal.props} />}
      {layout.activeModal?.name === 'incompleteWarning' && <IncompleteFontWarningModal isOpen={true} onClose={layout.closeModal} {...layout.activeModal.props} />}
      {layout.activeModal?.name === 'testPage' && (
         <FontTestPage 
            onClose={layout.closeModal} 
            fontBlob={appActions.testPageFont.blob} 
            feaError={appActions.testPageFont.feaError} 
            settings={settings} 
            onSettingsChange={(newSettings) => settingsDispatch({ type: 'SET_SETTINGS', payload: newSettings })}
            testText={testText} 
            onTestTextChange={setTestText} 
            testPageConfig={script.testPage} 
            defaults={{
                fontSize: script.testPage.fontSize.default,
                lineHeight: script.testPage.lineHeight.default,
                sampleText: script.sampleText
            }}
         />
      )}
      
      {layout.activeModal?.name === 'positioningUpdateWarning' && <PositioningUpdateWarningModal isOpen={true} onClose={() => layout.closeModal()} {...layout.activeModal.props} />}
      {layout.activeModal?.name === 'feaError' && feaErrorState && <FeaErrorModal isOpen={true} onClose={() => { layout.closeModal(); }} onConfirm={() => { downloadFontBlob(feaErrorState.blob, projectName); layout.closeModal(); }} errorMessage={feaErrorState.error} />}
      {layout.activeModal?.name === 'unsavedRules' && ( <UnsavedRulesModal isOpen={true} onClose={layout.closeModal} onDiscard={() => { layout.setWorkspace(layout.activeModal?.props.pendingWorkspace); layout.closeModal(); }} onSave={() => { handleSaveToDB(); layout.setWorkspace(layout.activeModal?.props.pendingWorkspace); layout.closeModal(); }} /> )}
      {layout.activeModal?.name === 'testCases' && <TestCasePage onClose={layout.closeModal} />}
      {layout.activeModal?.name === 'snapshotRestore' && (
        <SnapshotRestoreModal 
            isOpen={true} 
            onClose={layout.closeModal} 
            {...layout.activeModal.props}
        />
      )}
      {layout.activeModal?.name === 'confirmSnapshotRestore' && (
        <ConfirmationModal 
            isOpen={true} 
            onClose={layout.closeModal} 
            title={t('confirmSnapshotRestore')} 
            message={t('snapshotRestoreMessage', { time: new Date(layout.activeModal.props.timestamp).toLocaleString() })}
            confirmActionText={t('restore')}
            onConfirm={layout.activeModal.props.onConfirm}
            closeOnBackdropClick={false}
        />
      )}
      {layout.activeModal?.name === 'positioningRulesManager' && (
        <PositioningRulesModal 
            isOpen={true} 
            onClose={layout.closeModal} 
        />
      )}
      {layout.activeModal?.name === 'saveAs' && (
        <SaveAsModal 
            isOpen={true} 
            onClose={layout.closeModal} 
            {...layout.activeModal.props}
        />
      )}
    </div>
  );
};

export default App;
