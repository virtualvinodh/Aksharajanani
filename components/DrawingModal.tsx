
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { Character, GlyphData, Path, FontMetrics, Tool, AppSettings, CharacterSet, ImageTransform, Point, MarkAttachmentRules, TransformState, ComponentTransform } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DrawingEditorHeader from './drawing/DrawingEditorHeader';
import DrawingEditorWorkspace from './drawing/DrawingEditorWorkspace';
import DrawingConfirmationStack from './drawing/DrawingConfirmationStack';
import ImageControlPanel from './ImageControlPanel';
import { useClipboard } from '../contexts/ClipboardContext';
import { useLayout } from '../contexts/LayoutContext';
import { useGlyphEditSession } from '../hooks/drawing/useGlyphEditSession';
import { useDrawingShortcuts } from '../hooks/drawing/useDrawingShortcuts';
import { useImportLogic } from '../hooks/drawing/useImportLogic';
import { useCanvasOperations } from '../hooks/drawing/useCanvasOperations';
import { useGlyphConstruction } from '../hooks/drawing/useGlyphConstruction';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData as useGlyphDataContext } from '../contexts/GlyphDataContext';
import { useRules } from '../contexts/RulesContext';

const DrawingModal: React.FC<any> = ({ character, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules, onUnlockGlyph, onRelinkGlyph, onUpdateDependencies, onEditorModeChange }) => {
  const { t } = useLocale();
  const { showNotification, modalOriginRect, checkAndSetFlag } = useLayout();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  const { dispatch: characterDispatch, allCharsByName } = useProject();
  const { dispatch: glyphDataDispatch } = useGlyphDataContext();
  const { state: rulesState } = useRules();
  const groups = rulesState.fontRules?.groups || {};

  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [animationClass, setAnimationClass] = useState('');
  const [calligraphyAngle, setCalligraphyAngle] = useState<45 | 30 | 15>(45);
  
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(0.5);
  const [imageTransform, setImageTransform] = useState<ImageTransform | null>(null);
  const [previewTransform, setPreviewTransform] = useState<TransformState | null>(null);
  const [isTracerModalOpen, setIsTracerModalOpen] = useState(false);
  const [tracerImageSrc, setTracerImageSrc] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
  const [isRelinkConfirmOpen, setIsRelinkConfirmOpen] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  
  const visibleCharactersForNav = useMemo(() => characterSet.characters.filter((c: any) => !c.hidden), [characterSet]);
  const currentIndex = visibleCharactersForNav.findIndex((c: any) => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? visibleCharactersForNav[currentIndex - 1] : null;
  const nextCharacter = currentIndex < visibleCharactersForNav.length - 1 ? visibleCharactersForNav[currentIndex + 1] : null;

  const triggerClose = useCallback((postAnimationCallback: () => void) => {
    if (modalOriginRect) {
        setAnimationClass('animate-modal-exit');
        animationTimeoutRef.current = window.setTimeout(() => { setAnimationClass(''); postAnimationCallback(); }, 300);
    } else {
        postAnimationCallback();
    }
  }, [modalOriginRect]);

  const {
    currentPaths, handlePathsChange, undo, redo, canUndo, canRedo,
    lsb, setLsb, rsb, setRsb, 
    glyphClass, setGlyphClass, advWidth, setAdvWidth,
    isTransitioning,
    handleSave, handleRefresh, handleNavigationAttempt,
    wasEmptyOnLoad,
    isUnsavedModalOpen, closeUnsavedModal, confirmSave, confirmDiscard
  } = useGlyphEditSession({
      character, glyphData, allGlyphData, allCharacterSets, settings, metrics, markAttachmentRules,
      onSave, onNavigate, onClose: () => triggerClose(onClose)
  });

  const {
      imageImportRef, svgImportRef, imageTraceRef,
      handleImageImport, handleSvgImport, handleImageTraceFileChange, handleInsertTracedSVG
  } = useImportLogic({
      setBackgroundImage, setImageTransform, setTracerImageSrc, setIsTracerModalOpen,
      handlePathsChange, setCurrentTool, setSelectedPathIds, currentPaths, metrics, showNotification, t
  });

  const {
      handleCopy, handleCut, handlePaste, handleDeleteSelection, moveSelection,
      handleApplyTransform,
      handleGroup, handleUngroup, canGroup, canUngroup
  } = useCanvasOperations({
      currentPaths, handlePathsChange, selectedPathIds, setSelectedPathIds,
      clipboard, clipboardDispatch, showNotification, t,
      strokeThickness: settings.strokeThickness, setPreviewTransform
  });

  const {
      isLocked, isComposite, executeConstructionUpdate, handleSaveConstruction,
      isConstructionWarningOpen, setIsConstructionWarningOpen, pendingConstruction, dependentsCount
  } = useGlyphConstruction({
      character, currentPaths, allCharsByName, allGlyphData, allCharacterSets, settings, metrics, 
      markAttachmentRules, groups, characterDispatch, glyphDataDispatch, onUpdateDependencies, 
      handlePathsChange, showNotification, t
  });

  const sourceGlyphs = useMemo(() => {
      const componentNames = character.link; 
      if (!componentNames) return [];
      return componentNames.map((name: any) => allCharsByName.get(name)).filter((c: any): c is Character => !!c);
  }, [character, allCharsByName]);

  const dependentGlyphs = useMemo(() => {
      return allCharacterSets.flatMap(set => set.characters)
          .filter(c => {
              if (c.hidden || c.unicode === undefined) return false;
              if (!c.link?.includes(character.name)) return false;
              return isGlyphDrawn(allGlyphData.get(c.unicode));
          });
  }, [character, allCharacterSets, allGlyphData]);

  useDrawingShortcuts({
      onUndo: undo, onRedo: redo, onCopy: handleCopy, onCut: handleCut, onPaste: handlePaste,
      onDelete: handleDeleteSelection, onMoveSelection: moveSelection,
      onNavigatePrev: () => handleNavigationAttempt(prevCharacter),
      onNavigateNext: () => handleNavigationAttempt(nextCharacter),
      canUndo, canRedo, hasSelection: selectedPathIds.size > 0, hasClipboard: !!clipboard,
      canNavigatePrev: !!prevCharacter, canNavigateNext: !!nextCharacter
  });

  useLayoutEffect(() => {
    if (modalOriginRect && modalRef.current) {
        const modalEl = modalRef.current;
        modalEl.style.setProperty('--modal-origin-x', `${modalOriginRect.left + modalOriginRect.width / 2}px`);
        modalEl.style.setProperty('--modal-origin-y', `${modalOriginRect.top + modalOriginRect.height / 2}px`);
        modalEl.style.setProperty('--modal-scale-x', (modalOriginRect.width / window.innerWidth).toFixed(5));
        modalEl.style.setProperty('--modal-scale-y', (modalOriginRect.height / window.innerHeight).toFixed(5));
        setAnimationClass('animate-modal-enter');
        animationTimeoutRef.current = window.setTimeout(() => setAnimationClass(''), 300);
    }
    return () => { if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current); };
  }, [modalOriginRect]);

  const handleConfirmUnlock = () => { onUnlockGlyph(character.unicode!); setIsUnlockConfirmOpen(false); showNotification(t('glyphUnlockedSuccess'), 'success'); };
  const handleConfirmRelink = () => { onRelinkGlyph(character.unicode!); handleRefresh(); setIsRelinkConfirmOpen(false); showNotification(t('glyphRelinkedSuccess'), 'success'); };

  useEffect(() => {
      setZoom(1); setViewOffset({ x: 0, y: 0 }); setIsImageSelected(false); setBackgroundImage(null); setImageTransform(null);
      const initiallyDrawn = !!glyphData && glyphData.paths.length > 0;
      if (!initiallyDrawn && currentPaths.length > 0) {
          const components = character.composite || character.link || [];
          if (components.length > 1) {
              const targetGroupId = `component-${components.length - 1}`;
              const idsToSelect = new Set<string>();
              currentPaths.forEach(p => { if (p.groupId === targetGroupId) idsToSelect.add(p.id); });
              setSelectedPathIds(idsToSelect); setCurrentTool('select');
          } else { setSelectedPathIds(new Set()); setCurrentTool(character.link ? 'select' : 'pen'); }
      } else { setSelectedPathIds(new Set()); setCurrentTool(character.link ? 'select' : 'pen'); }
  }, []);

  return (
    <div ref={modalRef} className={`fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col ${animationClass}`}>
      <input type="file" ref={imageImportRef} onChange={handleImageImport} className="hidden" accept="image/*" />
      <input type="file" ref={svgImportRef} onChange={handleSvgImport} className="hidden" accept="image/svg+xml" />
      <input type="file" ref={imageTraceRef} onChange={handleImageTraceFileChange} className="hidden" accept="image/*" />

      <DrawingEditorHeader
        character={character} glyphData={glyphData} prevCharacter={prevCharacter} nextCharacter={nextCharacter}
        onBackClick={() => handleNavigationAttempt(null)} onNavigate={handleNavigationAttempt}
        settings={settings} metrics={metrics} lsb={lsb} setLsb={setLsb} rsb={rsb} setRsb={setRsb}
        onDeleteClick={() => setIsDeleteConfirmOpen(true)} onClear={() => handlePathsChange([])} onSave={handleSave} 
        isLocked={isLocked} isComposite={isComposite} onRefresh={handleRefresh}
        allCharacterSets={allCharacterSets} onSaveConstruction={handleSaveConstruction}
        onUnlock={() => setIsUnlockConfirmOpen(true)} onRelink={() => setIsRelinkConfirmOpen(true)}
        glyphClass={glyphClass} setGlyphClass={setGlyphClass} advWidth={advWidth} setAdvWidth={setAdvWidth}
      />

      <DrawingEditorWorkspace 
        character={character} currentPaths={currentPaths} onPathsChange={handlePathsChange} metrics={metrics}
        currentTool={currentTool} setCurrentTool={setCurrentTool} zoom={zoom} setZoom={setZoom}
        viewOffset={viewOffset} setViewOffset={setViewOffset} settings={settings}
        allGlyphData={allGlyphData} allCharacterSets={allCharacterSets} allCharsByName={allCharsByName}
        lsb={lsb} rsb={rsb} onMetricsChange={(l, r) => { setLsb(l); setRsb(r); }}
        isLargeScreen={isLargeScreen} isTransitioning={isTransitioning} wasEmptyOnLoad={wasEmptyOnLoad}
        isLocked={isLocked} calligraphyAngle={calligraphyAngle} setCalligraphyAngle={setCalligraphyAngle}
        selectedPathIds={selectedPathIds} setSelectedPathIds={setSelectedPathIds}
        isImageSelected={isImageSelected} setIsImageSelected={setIsImageSelected}
        backgroundImage={backgroundImage} backgroundImageOpacity={backgroundImageOpacity}
        imageTransform={imageTransform} setImageTransform={setImageTransform}
        previewTransform={previewTransform} setPreviewTransform={setPreviewTransform}
        onApplyTransform={handleApplyTransform} onImageImportClick={() => imageImportRef.current?.click()}
        onSvgImportClick={() => svgImportRef.current?.click()} onImageTraceClick={() => imageTraceRef.current?.click()}
        undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} handleCut={handleCut}
        handleCopy={handleCopy} handlePaste={handlePaste} clipboard={clipboard}
        handleGroup={handleGroup} handleUngroup={handleUngroup} canGroup={canGroup} canUngroup={canUngroup}
        sourceGlyphs={sourceGlyphs} dependentGlyphs={dependentGlyphs} groups={groups}
        handleNavigationAttempt={handleNavigationAttempt}
        markAttachmentRules={markAttachmentRules}
        gridConfig={gridConfig}
      />

      <ImageControlPanel backgroundImage={backgroundImage} backgroundImageOpacity={backgroundImageOpacity} setBackgroundImageOpacity={setBackgroundImageOpacity} onClearImage={() => { setBackgroundImage(null); setImageTransform(null); }} />
      
      <DrawingConfirmationStack 
        isUnsavedModalOpen={isUnsavedModalOpen} closeUnsavedModal={closeUnsavedModal} confirmSave={confirmSave} confirmDiscard={confirmDiscard}
        isDeleteConfirmOpen={isDeleteConfirmOpen} setIsDeleteConfirmOpen={setIsDeleteConfirmOpen} onDelete={onDelete} character={character} dependentsCount={dependentsCount}
        isUnlockConfirmOpen={isUnlockConfirmOpen} setIsUnlockConfirmOpen={setIsUnlockConfirmOpen} onUnlock={handleConfirmUnlock}
        isRelinkConfirmOpen={isRelinkConfirmOpen} setIsRelinkConfirmOpen={setIsRelinkConfirmOpen} onRelink={handleConfirmRelink}
        isConstructionWarningOpen={isConstructionWarningOpen} setIsConstructionWarningOpen={setIsConstructionWarningOpen} pendingConstruction={pendingConstruction} executeConstructionUpdate={executeConstructionUpdate}
        isTracerModalOpen={isTracerModalOpen} setIsTracerModalOpen={setIsTracerModalOpen} tracerImageSrc={tracerImageSrc} handleInsertTracedSVG={handleInsertTracedSVG} metrics={metrics}
      />
    </div>
  );
};

export default React.memo(DrawingModal);
