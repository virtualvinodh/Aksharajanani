
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { Character, GlyphData, Path, FontMetrics, Tool, AppSettings, CharacterSet, ImageTransform, Point, MarkAttachmentRules, Segment } from '../types';
import DrawingCanvas from './DrawingCanvas';
import { DRAWING_CANVAS_SIZE } from '../constants';
import { useLocale } from '../contexts/LocaleContext';
import UnsavedChangesModal from './UnsavedChangesModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DrawingModalHeader from './DrawingModalHeader';
import DrawingToolbar from './DrawingToolbar';
import ImageControlPanel from './ImageControlPanel';
import { useClipboard } from '../contexts/ClipboardContext';
import { useLayout } from '../contexts/LayoutContext';
import { isGlyphDrawn } from '../utils/glyphUtils';
import Modal from './Modal';
import ImageTracerModal from './modals/ImageTracerModal';
import { useGlyphEditSession } from '../hooks/drawing/useGlyphEditSession';
import { useDrawingShortcuts } from '../hooks/drawing/useDrawingShortcuts';
import { useImportLogic } from '../hooks/drawing/useImportLogic';
import { useCanvasOperations } from '../hooks/drawing/useCanvasOperations';

declare var paper: any;

interface DrawingModalProps {
  character: Character;
  characterSet: CharacterSet;
  glyphData: GlyphData | undefined;
  onSave: (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }, onSuccess: () => void, silent: boolean, skipCascade: boolean) => void;
  onClose: () => void;
  onDelete: (unicode: number) => void;
  onNavigate: (character: Character) => void;
  settings: AppSettings;
  metrics: FontMetrics;
  allGlyphData: Map<number, GlyphData>;
  allCharacterSets: CharacterSet[];
  gridConfig: { characterNameSize: number };
  clipboard: Path[] | null;
  setClipboard: (paths: Path[] | null) => void;
  markAttachmentRules: MarkAttachmentRules | null;
  onUnlockGlyph: (unicode: number) => void;
  onRelinkGlyph: (unicode: number) => void;
}

const DrawingModal: React.FC<DrawingModalProps> = ({ character, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules, onUnlockGlyph, onRelinkGlyph }) => {
  const { t } = useLocale();
  const { showNotification, modalOriginRect } = useLayout();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [animationClass, setAnimationClass] = useState('');
  const [calligraphyAngle, setCalligraphyAngle] = useState<45 | 30 | 15>(45);
  
  // Image state
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(0.5);
  const [imageTransform, setImageTransform] = useState<ImageTransform | null>(null);
  
  // Trace Modal State
  const [isTracerModalOpen, setIsTracerModalOpen] = useState(false);
  const [tracerImageSrc, setTracerImageSrc] = useState<string | null>(null);

  // Confirmation Modals
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
  const [isRelinkConfirmOpen, setIsRelinkConfirmOpen] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  
  const isLocked = !!character.link;
  const isComposite = !!character.composite && character.composite.length > 0;
  const isInitiallyDrawn = useMemo(() => isGlyphDrawn(glyphData), [glyphData]);

  const visibleCharactersForNav = useMemo(() => characterSet.characters.filter(c => !c.hidden), [characterSet]);
  const currentIndex = visibleCharactersForNav.findIndex(c => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? visibleCharactersForNav[currentIndex - 1] : null;
  const nextCharacter = currentIndex < visibleCharactersForNav.length - 1 ? visibleCharactersForNav[currentIndex + 1] : null;

  // --- Hook: Session Management ---
  const {
    currentPaths, handlePathsChange, undo, redo, canUndo, canRedo,
    lsb, setLsb, rsb, setRsb, isTransitioning,
    handleSave, handleRefresh, handleNavigationAttempt,
    wasEmptyOnLoad,
    isUnsavedModalOpen, closeUnsavedModal, confirmSave, confirmDiscard
  } = useGlyphEditSession({
      character, glyphData, allGlyphData, allCharacterSets, settings, metrics, markAttachmentRules,
      onSave, onNavigate, onClose: () => triggerClose(onClose)
  });

  // --- Hook: Import Logic ---
  const {
      imageImportRef, svgImportRef, imageTraceRef,
      handleImageImport, handleSvgImport, handleImageTraceFileChange, handleInsertTracedSVG
  } = useImportLogic({
      setBackgroundImage, setImageTransform, setTracerImageSrc, setIsTracerModalOpen,
      handlePathsChange, setCurrentTool, setSelectedPathIds, currentPaths, metrics, showNotification, t
  });

  // --- Hook: Canvas Operations (Copy/Paste/Group) ---
  const {
      handleCopy, handleCut, handlePaste, handleDeleteSelection, moveSelection,
      handleGroup, handleUngroup, canGroup, canUngroup
  } = useCanvasOperations({
      currentPaths, handlePathsChange, selectedPathIds, setSelectedPathIds,
      clipboard, clipboardDispatch, showNotification, t
  });

  // --- Hook: Shortcuts ---
  useDrawingShortcuts({
      onUndo: undo, onRedo: redo, onCopy: handleCopy, onCut: handleCut, onPaste: handlePaste,
      onDelete: handleDeleteSelection, onMoveSelection: moveSelection,
      onNavigatePrev: () => handleNavigationAttempt(prevCharacter),
      onNavigateNext: () => handleNavigationAttempt(nextCharacter),
      canUndo, canRedo, hasSelection: selectedPathIds.size > 0, hasClipboard: !!clipboard,
      canNavigatePrev: !!prevCharacter, canNavigateNext: !!nextCharacter
  });

  // Animation handling
  useLayoutEffect(() => {
    if (modalOriginRect && modalRef.current) {
        const modalEl = modalRef.current;
        const originX = modalOriginRect.left + modalOriginRect.width / 2;
        const originY = modalOriginRect.top + modalOriginRect.height / 2;
        const scaleX = modalOriginRect.width / window.innerWidth;
        const scaleY = modalOriginRect.height / window.innerHeight;

        modalEl.style.setProperty('--modal-origin-x', `${originX}px`);
        modalEl.style.setProperty('--modal-origin-y', `${originY}px`);
        modalEl.style.setProperty('--modal-scale-x', scaleX.toFixed(5));
        modalEl.style.setProperty('--modal-scale-y', scaleY.toFixed(5));
        
        setAnimationClass('animate-modal-enter');
        animationTimeoutRef.current = window.setTimeout(() => setAnimationClass(''), 300);
    }
    return () => { if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current); };
  }, [modalOriginRect, character.unicode]);

  // Reset tool/view on char change
  useEffect(() => {
    if (character.link) setCurrentTool('select'); else setCurrentTool('pen');
    setZoom(1); setViewOffset({ x: 0, y: 0 }); setSelectedPathIds(new Set()); setIsImageSelected(false);
    setBackgroundImage(null); setImageTransform(null); setBackgroundImageOpacity(0.5);
    if (character.link) showNotification(t('linkedGlyphLocked', { components: character.link.join(' + ') }), 'info');
  }, [character, showNotification, t]);

  // Action Handlers
  const handleClear = () => handlePathsChange([]);
  const handleZoom = (factor: number) => {
      const newZoom = Math.max(0.1, Math.min(10, zoom * factor));
      const center = { x: DRAWING_CANVAS_SIZE / 2, y: DRAWING_CANVAS_SIZE / 2 };
      setZoom(newZoom);
      setViewOffset({
          x: center.x - (center.x - viewOffset.x) * (newZoom / zoom),
          y: center.y - (center.y - viewOffset.y) * (newZoom / zoom)
      });
  };

  const triggerClose = useCallback((postAnimationCallback: () => void) => {
    if (modalOriginRect) {
        setAnimationClass('animate-modal-exit');
        animationTimeoutRef.current = window.setTimeout(() => { setAnimationClass(''); postAnimationCallback(); }, 300);
    } else {
        postAnimationCallback();
    }
  }, [modalOriginRect]);

  const handleConfirmUnlock = () => { onUnlockGlyph(character.unicode!); setIsUnlockConfirmOpen(false); showNotification(t('glyphUnlockedSuccess'), 'success'); };
  const handleConfirmRelink = () => { onRelinkGlyph(character.unicode!); setIsRelinkConfirmOpen(false); showNotification(t('glyphRelinkedSuccess'), 'success'); };

  const canvasComponent = (
     <DrawingCanvas 
        width={DRAWING_CANVAS_SIZE} height={DRAWING_CANVAS_SIZE} 
        paths={currentPaths} onPathsChange={handlePathsChange} metrics={metrics}
        tool={currentTool} zoom={zoom} setZoom={setZoom} viewOffset={viewOffset} setViewOffset={setViewOffset}
        settings={settings} allGlyphData={allGlyphData} allCharacterSets={allCharacterSets} currentCharacter={character}
        gridConfig={gridConfig} backgroundImage={backgroundImage} backgroundImageOpacity={backgroundImageOpacity}
        imageTransform={imageTransform} onImageTransformChange={setImageTransform}
        selectedPathIds={selectedPathIds} onSelectionChange={setSelectedPathIds}
        isImageSelected={isImageSelected} onImageSelectionChange={setIsImageSelected}
        lsb={lsb} rsb={rsb} calligraphyAngle={calligraphyAngle} isInitiallyDrawn={!wasEmptyOnLoad}
        transformMode={isLocked ? 'move-only' : 'all'}
    />
  );
  
  const mainContentClasses = `flex-grow overflow-hidden bg-gray-100 dark:bg-black/20 transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`;

  return (
    <div ref={modalRef} className={`fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col ${animationClass}`}>
      <input type="file" ref={imageImportRef} onChange={handleImageImport} className="hidden" accept="image/png, image/jpeg, image/gif, image/bmp" />
      <input type="file" ref={svgImportRef} onChange={handleSvgImport} className="hidden" accept="image/svg+xml" />
      <input type="file" ref={imageTraceRef} onChange={handleImageTraceFileChange} className="hidden" accept="image/png, image/jpeg, image/gif, image/bmp" />

      <DrawingModalHeader
        character={character} prevCharacter={prevCharacter} nextCharacter={nextCharacter}
        onBackClick={() => handleNavigationAttempt(null)} onNavigate={handleNavigationAttempt}
        settings={settings} metrics={metrics} lsb={lsb} setLsb={setLsb} rsb={rsb} setRsb={setRsb}
        onDeleteClick={() => setIsDeleteConfirmOpen(true)} onClear={handleClear} 
        onSave={() => handleSave(currentPaths, false, false)} 
        isLocked={isLocked} isComposite={isComposite} onRefresh={handleRefresh}
      />

      <main className={isLargeScreen ? `${mainContentClasses} flex flex-row justify-center p-4 gap-4` : `${mainContentClasses} flex flex-col p-4 gap-4`}>
         <div className={isLargeScreen ? "flex flex-col justify-center" : ""}>
             <DrawingToolbar
                character={character} currentTool={currentTool} setCurrentTool={setCurrentTool} settings={settings} isLargeScreen={isLargeScreen}
                onUndo={undo} canUndo={canUndo} onRedo={redo} canRedo={canRedo}
                onCut={handleCut} selectedPathIds={selectedPathIds} onCopy={handleCopy} onPaste={handlePaste} clipboard={clipboard}
                onGroup={handleGroup} canGroup={canGroup} onUngroup={handleUngroup} canUngroup={canUngroup}
                onZoom={handleZoom} onImageImportClick={() => imageImportRef.current?.click()} onSvgImportClick={() => svgImportRef.current?.click()}
                onImageTraceClick={() => imageTraceRef.current?.click()} calligraphyAngle={calligraphyAngle} setCalligraphyAngle={setCalligraphyAngle}
                onUnlockClick={() => setIsUnlockConfirmOpen(true)} onRelinkClick={() => setIsRelinkConfirmOpen(true)}
             />
         </div>
        <div className="flex-1 min-w-0 min-h-0 flex justify-center items-center">
            <div className="rounded-md overflow-hidden shadow-lg aspect-square max-w-full max-h-full">
                {canvasComponent}
            </div>
        </div>
      </main>

      <ImageControlPanel backgroundImage={backgroundImage} backgroundImageOpacity={backgroundImageOpacity} setBackgroundImageOpacity={setBackgroundImageOpacity} onClearImage={() => { setBackgroundImage(null); setImageTransform(null); }} />
      <UnsavedChangesModal isOpen={isUnsavedModalOpen} onClose={closeUnsavedModal} onSave={confirmSave} onDiscard={confirmDiscard} />
      <DeleteConfirmationModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={() => { onDelete(character.unicode!); setIsDeleteConfirmOpen(false); }} character={character} isStandardGlyph={!character.isCustom} />
      <Modal isOpen={isUnlockConfirmOpen} onClose={() => setIsUnlockConfirmOpen(false)} title={t('unlockGlyphTitle')} titleClassName="text-yellow-600 dark:text-yellow-400" footer={<><button onClick={() => setIsUnlockConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button><button onClick={handleConfirmUnlock} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg">{t('unlock')}</button></>}><p>{t('unlockGlyphMessage')}</p></Modal>
      <Modal isOpen={isRelinkConfirmOpen} onClose={() => setIsRelinkConfirmOpen(false)} title={t('relinkGlyphTitle')} titleClassName="text-yellow-600 dark:text-yellow-400" footer={<><button onClick={() => setIsRelinkConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button><button onClick={handleConfirmRelink} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg">{t('relink')}</button></>}><p>{t('relinkGlyphMessage')}</p></Modal>
      <ImageTracerModal isOpen={isTracerModalOpen} onClose={() => setIsTracerModalOpen(false)} imageSrc={tracerImageSrc} onInsertSVG={handleInsertTracedSVG} drawingCanvasSize={DRAWING_CANVAS_SIZE} metrics={metrics} />
    </div>
  );
};

export default React.memo(DrawingModal);
