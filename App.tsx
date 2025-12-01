
import React, { useState, useEffect, useRef } from 'react';
import { ScriptConfig, ProjectData, Character } from './types';
import DrawingModal from './components/DrawingModal';
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
import BulkEditWorkspace from './components/BulkEditWorkspace';
import TestCasePage from './components/TestCasePage';
import ExportAnimation from './components/ExportAnimation';
import ImportGlyphsModal from './components/ImportGlyphsModal';
import SnapshotRestoreModal from './components/SnapshotRestoreModal';
import SaveAsModal from './components/SaveAsModal';
import { useLocale } from './contexts/LocaleContext';
import { useLayout } from './contexts/LayoutContext';
import { useCharacter } from './contexts/CharacterContext';
import { useGlyphData } from './contexts/GlyphDataContext';
import { useKerning } from './contexts/KerningContext';
import { useSettings } from './contexts/SettingsContext';
import { useClipboard } from './contexts/ClipboardContext';
import { usePositioning } from './contexts/PositioningContext';
import { useRules } from './contexts/RulesContext';
import { useProject } from './contexts/ProjectContext';
import { useProgressCalculators } from './hooks/useProgressCalculators';
import { useAppActions } from './hooks/useAppActions';
import { TOOL_RANGES } from './constants';

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

  // CONTEXT HOOKS
  const layout = useLayout();
  const { script, characterSets, allCharsByUnicode, allCharsByName } = useCharacter();
  const { glyphDataMap } = useGlyphData();
  const { kerningMap } = useKerning();
  const { settings, metrics, dispatch: settingsDispatch } = useSettings();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  const { markPositioningMap } = usePositioning();
  const { state: rulesState } = useRules();
  const { projectName } = useProject();
  const { fontRules, isFeaEditMode, manualFeaCode, hasUnsavedRules } = rulesState;
  const { workspace, currentView, setCurrentView, selectedCharacter, selectCharacter, closeCharacterModal } = layout;

  // LOCAL STATE
  const [isDonateNoticeVisible, setIsDonateNoticeVisible] = useState(false);
  const [isAnimatingExport, setIsAnimatingExport] = useState(false);
  const downloadTriggerRef = useRef<(() => void) | null>(null);
  
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
      isExporting,
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
      handleCheckGlyphExists,
      handleCheckNameExists,
      handleAddBlock,
      handleImportGlyphs,
      startExportProcess,
      handleSaveToDB,
      handleTestClick,
      testPageFont,
      handleTakeSnapshot,
      handleRestoreSnapshot,
      hasSnapshot,
      openSaveAsModal
  } = appActions;


  useEffect(() => {
    const timer = setTimeout(() => {
      if (!localStorage.getItem('donateNoticeDismissed')) {
        setIsDonateNoticeVisible(true);
      }
    }, 15000); // 15 seconds
    return () => clearTimeout(timer);
  }, []);
  
  // --- GLOBAL KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        // Differentiate between save and export
        if (settings?.isAutosaveEnabled) {
          handleSaveProject(); // Ctrl+S triggers export when autosave is on
        } else {
          handleSaveToDB(); // Ctrl+S triggers save-only when autosave is off
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSaveProject, handleSaveToDB, settings?.isAutosaveEnabled]);

  // --- DERIVED STATE & COMPLEX LOGIC ---
  const {
      drawingProgress,
      positioningProgress,
      kerningProgress,
      rulesProgress,
  } = useProgressCalculators({
      characterSets,
      glyphDataMap,
      markPositioningMap,
      recommendedKerning,
      allCharsByName,
      fontRules,
      kerningMap,
      positioningRules,
  });
  
  // --- UI & OTHER EFFECTS ---
  
  useEffect(() => {
    if (!script) return;
    const { guideFont } = script;
    const existingStyle = document.getElementById(GUIDE_FONT_STYLE_ID); if (existingStyle) existingStyle.remove();
    if (guideFont && guideFont.fontName && guideFont.fontUrl) {
        const styleEl = document.createElement('style'); styleEl.id = GUIDE_FONT_STYLE_ID;
        styleEl.innerHTML = `@font-face { font-family: "${guideFont.fontName}"; src: url('${guideFont.fontUrl}') format('truetype'); font-display: swap; }`;
        document.head.appendChild(styleEl);
        document.documentElement.style.setProperty('--guide-font-family', `"${guideFont.fontName}", sans-serif`);
        document.documentElement.style.setProperty('--guide-font-feature-settings', guideFont.stylisticSet || 'normal');
    } else { document.documentElement.style.removeProperty('--guide-font-family'); document.documentElement.style.removeProperty('--guide-font-feature-settings'); }
    return () => { document.documentElement.style.removeProperty('--guide-font-family'); document.documentElement.style.removeProperty('--guide-font-feature-settings'); const el = document.getElementById(GUIDE_FONT_STYLE_ID); if (el) el.remove(); };
  }, [script]);
  
  if (scriptDataError) {
    return (
        <div className="h-screen bg-white dark:bg-gray-900 text-red-500 dark:text-red-400 flex flex-col items-center justify-center p-4">
            <h1 className="text-2xl font-bold mb-4">Error Loading Script Data</h1>
            <p className="text-center bg-gray-100 dark:bg-gray-800 p-4 rounded-md">{scriptDataError}</p>
            <button
                onClick={onBackToSelection}
                className="mt-6 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
                {t('back')} to Script Selection
            </button>
        </div>
    );
  }

  if (isScriptDataLoading || !script || !settings || !metrics || !characterSets) {
    return <div className="h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex items-center justify-center p-4"><h1 className="text-2xl font-semibold animate-pulse">{t('loadingScript')}...</h1></div>;
  }

  const hasPositioning = positioningRules && positioningRules.length > 0;
  const hasKerning = recommendedKerning !== null;
  
  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col">
       <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
       <AppHeader
        script={script}
        settings={settings}
        isExporting={isExporting}
        onSaveProject={handleSaveProject}
        onSaveToDB={handleSaveToDB}
        onLoadProject={handleLoadProject}
        onImportGlyphsClick={() => layout.openModal('importGlyphs')}
        onExportClick={startExportProcess}
        onTestClick={handleTestClick}
        onCompareClick={() => setCurrentView('comparison')}
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
       />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900/50">
          {workspace === 'drawing' && (
              <DrawingWorkspace
                characterSets={characterSets}
                onSelectCharacter={selectCharacter}
                onAddGlyph={() => layout.openModal('addGlyph')}
                onAddBlock={() => layout.openModal('addBlock')}
                drawingProgress={drawingProgress}
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
          {workspace === 'kerning' && (settings.editorMode === 'advanced' || script.kerning === 'true') && (
              <KerningWorkspace 
                recommendedKerning={recommendedKerning ?? []}
                kerningProgress={kerningProgress}
              />
          )}
          {workspace === 'rules' && settings.editorMode === 'advanced' && (
              <RulesWorkspace 
                positioningRules={positioningRules}
                isFeaOnlyMode={isFeaOnlyMode}
                rulesProgress={rulesProgress}
              />
          )}
          {workspace === 'metrics' && settings.editorMode === 'advanced' && (
              <BulkEditWorkspace />
          )}
        </div>
      </main>
      
      <Footer />
      
      {selectedCharacter && characterSets && (
        <DrawingModal
          key={selectedCharacter.unicode} // CRITICAL: Forces clean remount on character change
          character={selectedCharacter}
          characterSet={characterSets.find(cs => cs.characters.some(c => c.unicode === selectedCharacter.unicode)) || characterSets[layout.activeTab]}
          glyphData={glyphDataMap.get(selectedCharacter.unicode)}
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
          onClose={closeCharacterModal}
          markAttachmentRules={markAttachmentRules}
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
        />
      )}

      {/* --- Global Modals --- */}
      {currentView === 'settings' && <SettingsPage onClose={() => setCurrentView('grid')} toolRanges={TOOL_RANGES} />}
      {currentView === 'comparison' && <ComparisonView onClose={() => setCurrentView('grid')} />}
      {layout.activeModal?.name === 'addGlyph' && <AddGlyphModal isOpen={true} onClose={layout.closeModal} onAdd={handleAddGlyph} onCheckExists={handleCheckGlyphExists} onCheckNameExists={handleCheckNameExists} />}
      {layout.activeModal?.name === 'addBlock' && <UnicodeBlockSelectorModal isOpen={true} onClose={layout.closeModal} onAddBlock={handleAddBlock} onCheckExists={handleCheckGlyphExists} mode="addBlocks" />}
      {layout.activeModal?.name === 'importGlyphs' && <ImportGlyphsModal isOpen={true} onClose={layout.closeModal} onImport={handleImportGlyphs} allScripts={allScripts} />}
      {layout.activeModal?.name === 'confirmChangeScript' && <ConfirmationModal isOpen={true} onClose={layout.closeModal} title={t('confirmChangeScriptTitle')} message={t('confirmChangeScriptMessage')} {...layout.activeModal.props} />}
      {layout.activeModal?.name === 'confirmLoadProject' && <ConfirmationModal isOpen={true} onClose={layout.closeModal} title={t('confirmLoadProjectTitle')} message={t('confirmLoadProjectMessage')} {...layout.activeModal.props} />}
      {layout.activeModal?.name === 'incompleteWarning' && <IncompleteFontWarningModal isOpen={true} onClose={layout.closeModal} {...layout.activeModal.props} />}
      {layout.activeModal?.name === 'testPage' && (
         <FontTestPage 
            onClose={layout.closeModal} 
            fontBlob={testPageFont.blob} 
            feaError={testPageFont.feaError} 
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