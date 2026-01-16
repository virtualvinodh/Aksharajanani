import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { Character, GlyphData, Path, FontMetrics, Tool, AppSettings, CharacterSet, ImageTransform, Point, MarkAttachmentRules, TransformState, ComponentTransform, PositioningRules, AttachmentClass } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useClipboard } from '../contexts/ClipboardContext';
import { useLayout } from '../contexts/LayoutContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData as useGlyphDataContext } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';

// Drawing Profile Components
import DrawingEditorHeader from './drawing/DrawingEditorHeader';
import DrawingEditorWorkspace from './drawing/DrawingEditorWorkspace';
import DrawingConfirmationStack from './drawing/DrawingConfirmationStack';
import ImageControlPanel from './ImageControlPanel';

// Positioning Profile Components
import PositioningEditorHeader from './positioning/PositioningEditorHeader';
import PositioningEditorWorkspace from './positioning/PositioningEditorWorkspace';

// Kerning Profile Components
import KerningEditorHeader from './kerning/KerningEditorHeader';
import KerningEditorWorkspace from './kerning/KerningEditorWorkspace';
import KerningCanvas from './KerningCanvas';

// Shared Hooks
import { useGlyphEditSession } from '../hooks/drawing/useGlyphEditSession';
import { useDrawingShortcuts } from '../hooks/drawing/useDrawingShortcuts';
import { useImportLogic } from '../hooks/drawing/useImportLogic';
import { useCanvasOperations } from '../hooks/drawing/useCanvasOperations';
import { useGlyphConstruction } from '../hooks/drawing/useGlyphConstruction';
import { usePositioningSession } from '../hooks/positioning/usePositioningSession';
import { useKerningSession } from '../hooks/kerning/useKerningSession';

import { isGlyphDrawn } from '../utils/glyphUtils';
import { DRAWING_CANVAS_SIZE } from '../constants';
import { VEC } from '../utils/vectorUtils';
import { expandMembers } from '../services/groupExpansionService';
import { deepClone } from '../utils/cloneUtils';

type EditorProfile = 'drawing' | 'positioning' | 'kerning';

const UnifiedEditorModal: React.FC<any> = ({ 
    character, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, 
    settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules, 
    onUnlockGlyph, onRelinkGlyph, onUpdateDependencies 
}) => {
  const { t } = useLocale();
  const { showNotification, modalOriginRect } = useLayout();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  const { 
    dispatch: characterDispatch, allCharsByName, positioningRules, 
    markAttachmentClasses, setMarkAttachmentClasses, 
    baseAttachmentClasses, setBaseAttachmentClasses,
    allCharsByUnicode 
  } = useProject();
  const { kerningMap, dispatch: kerningDispatch } = useKerning();
  const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
  const { dispatch: glyphDataDispatch, version: glyphVersion } = useGlyphDataContext();
  const { state: rulesState } = useRules();
  const groups = rulesState.fontRules?.groups || {};

  const modalRef = useRef<HTMLDivElement>(null);
  const kerningContainerRef = useRef<HTMLDivElement>(null); // Stable ref for size monitoring
  const [animationClass, setAnimationClass] = useState('');
  const animationTimeoutRef = useRef<number | null>(null);
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');

  // 1. Determine Profile
  const profile = useMemo<EditorProfile>(() => {
    if (character.position) return 'positioning';
    if (character.kern) return 'kerning';
    return 'drawing';
  }, [character]);

  // 2. Shared Navigation Context
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

  // Shared UI state
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(0.5);
  const [imageTransform, setImageTransform] = useState<ImageTransform | null>(null);
  const [previewTransform, setPreviewTransform] = useState<TransformState | null>(null);
  const [isTracerModalOpen, setIsTracerModalOpen] = useState(false);
  const [tracerImageSrc, setTracerImageSrc] = useState<string | null>(null);
  const [calligraphyAngle, setCalligraphyAngle] = useState<45 | 30 | 15>(45);

  // 3. Profile-Specific Sessions
  
  // --- DRAWING SESSION ---
  const drawingSession = useGlyphEditSession({
      character, glyphData, allGlyphData, allCharacterSets, settings, metrics, markAttachmentRules,
      onSave, onNavigate, onClose: () => triggerClose(onClose)
  });

  const drawingImport = useImportLogic({
      setBackgroundImage: (img) => setBackgroundImage(img), 
      setImageTransform: (t) => setImageTransform(t), 
      setTracerImageSrc: (s) => setTracerImageSrc(s), 
      setIsTracerModalOpen: (o) => setIsTracerModalOpen(o),
      handlePathsChange: drawingSession.handlePathsChange, 
      setCurrentTool: (t) => setCurrentTool(t), 
      setSelectedPathIds: (ids) => setSelectedPathIds(ids), 
      currentPaths: drawingSession.currentPaths, 
      metrics, showNotification, t
  });

  const drawingOps = useCanvasOperations({
      currentPaths: drawingSession.currentPaths, handlePathsChange: drawingSession.handlePathsChange, 
      selectedPathIds, setSelectedPathIds, clipboard, clipboardDispatch, showNotification, t,
      strokeThickness: settings.strokeThickness, setPreviewTransform
  });

  const drawingConstruction = useGlyphConstruction({
      character, currentPaths: drawingSession.currentPaths, allCharsByName, allGlyphData, allCharacterSets, settings, metrics, 
      markAttachmentRules, groups, characterDispatch, glyphDataDispatch, onUpdateDependencies, 
      handlePathsChange: drawingSession.handlePathsChange, showNotification, t
  });

  // TOOL LOCKING: Linked glyphs shouldn't allow writing
  useEffect(() => {
    if (profile === 'drawing' && character.link && currentTool !== 'select' && currentTool !== 'pan') {
      setCurrentTool('select');
    }
  }, [character, profile]);

  // Relationship Data for Drawing Mode
  const sourceGlyphs = useMemo(() => {
    const componentNames = character.link || character.composite;
    if (!componentNames) return [];
    return componentNames.map((name: any) => allCharsByName.get(name)).filter((c: any): c is Character => !!c);
  }, [character, allCharsByName]);

  const dependentGlyphs = useMemo(() => {
    return allCharacterSets.flatMap(set => set.characters)
        .filter(c => {
            if (c.hidden || c.unicode === undefined) return false;
            const components = c.link || c.composite;
            if (!components?.includes(character.name)) return false;
            return isGlyphDrawn(allGlyphData.get(c.unicode));
        });
  }, [character, allCharacterSets, allGlyphData, glyphVersion]);

  // --- POSITIONING SESSION ---
  const posBaseChar = useMemo(() => character.position ? allCharsByName.get(character.position[0]) : null, [character, allCharsByName]);
  const posMarkChar = useMemo(() => character.position ? allCharsByName.get(character.position[1]) : null, [character, allCharsByName]);
  
  const handlePositioningNavigate = useCallback((idx: number) => {
    if (idx >= 0 && idx < visibleCharactersForNav.length) {
        onNavigate(visibleCharactersForNav[idx]);
    }
  }, [onNavigate, visibleCharactersForNav]);

  const positioningSession = usePositioningSession({
      baseChar: posBaseChar || character,
      markChar: posMarkChar || character,
      targetLigature: character,
      glyphDataMap: allGlyphData,
      markPositioningMap,
      onSave: (targetLig, newGlyphData, newOffset, newBearings, isAutosave) => {
          onSave(targetLig.unicode, newGlyphData, newBearings, undefined, { isDraft: isAutosave });
          positioningDispatch({ type: 'SET_MAP', payload: new Map(markPositioningMap).set(`${posBaseChar?.unicode}-${posMarkChar?.unicode}`, newOffset) });
      },
      settings, metrics, markAttachmentRules, positioningRules, allChars: allCharsByName,
      markAttachmentClasses, baseAttachmentClasses, characterSets: allCharacterSets, groups,
      onClose: () => triggerClose(onClose),
      onNavigate: handlePositioningNavigate,
      currentIndex,
      allPairsCount: visibleCharactersForNav.length
  });

  const handlePositioningManualChange = useCallback((axis: 'x' | 'y', value: string) => {
    if (axis === 'x') positioningSession.setManualX(value);
    else positioningSession.setManualY(value);
  }, [positioningSession]);

  const [isStripExpanded, setIsStripExpanded] = useState(false);

  // Class Sibling logic for Positioning Strip
  const classSiblings = useMemo(() => {
    if (positioningSession.activeAttachmentClass && positioningSession.activeClassType) {
         const members = expandMembers(positioningSession.activeAttachmentClass.members, groups, allCharacterSets);
         const siblings: any[] = [];
         
         // Helper to find all ligatures for the current positioning rule
         const relevantRules = positioningRules?.filter(rule => 
            expandMembers(rule.base, groups, allCharacterSets).includes(posBaseChar?.name || character.name) ||
            expandMembers(rule.mark, groups, allCharacterSets).includes(posMarkChar?.name || character.name)
         );

         members.forEach(memberName => {
             let sBase = posBaseChar || character;
             let sMark = posMarkChar || character;
             if (positioningSession.activeClassType === 'mark') {
                const c = allCharsByName.get(memberName);
                if (c) sMark = c;
             } else {
                const c = allCharsByName.get(memberName);
                if (c) sBase = c;
             }
             
             if (sBase.unicode === undefined || sMark.unicode === undefined) return;
             
             // Find corresponding ligature character if it exists
             const pairName = sBase.name + sMark.name;
             const lig = allCharsByName.get(pairName) || { name: pairName, unicode: sBase.unicode + sMark.unicode + 1000000 };
             siblings.push({ base: sBase, mark: sMark, ligature: lig });
         });
         return siblings;
    }
    return [];
  }, [positioningSession.activeAttachmentClass, positioningSession.activeClassType, posBaseChar, posMarkChar, character, groups, allCharacterSets, allCharsByName, positioningRules]);

  const handleToggleLink = () => {
    const newIsLinked = !positioningSession.isLinked;
    positioningSession.setIsLinked(newIsLinked);
    const pairNameKey = `${(posBaseChar || character).name}-${(posMarkChar || character).name}`;
    
    const updateClassList = (classes: AttachmentClass[], setter: (c: AttachmentClass[]) => void) => {
         const newClasses = deepClone(classes);
         const cls = newClasses.find(c => expandMembers(c.members, groups, allCharacterSets).includes(positioningSession.activeClassType === 'mark' ? (posMarkChar || character).name : (posBaseChar || character).name));
         if (cls) {
             if (!cls.exceptPairs) cls.exceptPairs = [];
             if (newIsLinked) cls.exceptPairs = cls.exceptPairs.filter((p: string) => p !== pairNameKey);
             else if (!cls.exceptPairs.includes(pairNameKey)) cls.exceptPairs.push(pairNameKey);
             setter(newClasses);
         }
    };

    if (positioningSession.activeClassType === 'mark' && markAttachmentClasses) updateClassList(markAttachmentClasses, setMarkAttachmentClasses);
    if (positioningSession.activeClassType === 'base' && baseAttachmentClasses) updateClassList(baseAttachmentClasses, setBaseAttachmentClasses);
    if (newIsLinked) showNotification(t('glyphRelinkedSuccess'), "success");
  };

  // --- KERNING SESSION ---
  const kernLeftChar = useMemo(() => character.kern ? allCharsByName.get(character.kern[0]) : null, [character, allCharsByName]);
  const kernRightChar = useMemo(() => character.kern ? allCharsByName.get(character.kern[1]) : null, [character, allCharsByName]);
  const kerningInitialValue = useMemo(() => {
      if (!kernLeftChar || !kernRightChar) return 0;
      return kerningMap.get(`${kernLeftChar.unicode}-${kernRightChar.unicode}`) || 0;
  }, [kernLeftChar, kernRightChar, kerningMap]);

  const handleKerningNavigate = useCallback((direction: 'prev' | 'next') => {
      if (direction === 'next' && nextCharacter) onNavigate(nextCharacter);
      if (direction === 'prev' && prevCharacter) onNavigate(prevCharacter);
  }, [onNavigate, nextCharacter, prevCharacter]);

  const kerningSession = useKerningSession({
      pair: { left: kernLeftChar || character, right: kernRightChar || character },
      initialValue: kerningInitialValue,
      glyphDataMap: allGlyphData,
      strokeThickness: settings.strokeThickness,
      metrics, settings, recommendedKerning: [], 
      onSave: (val) => {
          const key = `${kernLeftChar?.unicode}-${kernRightChar?.unicode}`;
          kerningDispatch({ type: 'SET_MAP', payload: new Map(kerningMap).set(key, val) });
      },
      onClose: () => triggerClose(onClose),
      onNavigate: handleKerningNavigate
  });

  // SIZE MONITORING: Specifically for Kerning Profile to ensure canvas dimensions are populated
  useEffect(() => {
    if (profile !== 'kerning' || !kerningContainerRef.current) return;
    
    const container = kerningContainerRef.current;
    const updateSize = () => {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            kerningSession.setContainerSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        }
    };
    
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [profile, character.unicode, kerningSession.setContainerSize]);

  // 4. Global Shortcuts & UI State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
  const [isRelinkConfirmOpen, setIsRelinkConfirmOpen] = useState(false);

  useDrawingShortcuts({
      onUndo: profile === 'drawing' ? drawingSession.undo : () => {},
      onRedo: profile === 'drawing' ? drawingSession.redo : () => {},
      onCopy: profile === 'drawing' ? drawingOps.handleCopy : () => {},
      onCut: profile === 'drawing' ? drawingOps.handleCut : () => {},
      onPaste: profile === 'drawing' ? drawingOps.handlePaste : () => {},
      onDelete: profile === 'drawing' ? drawingOps.handleDeleteSelection : () => {},
      onMoveSelection: profile === 'drawing' ? drawingOps.moveSelection : (delta) => {
          if (profile === 'positioning') {
              const currentX = parseFloat(positioningSession.manualX) || 0;
              const currentY = parseFloat(positioningSession.manualY) || 0;
              positioningSession.setManualX(String(currentX + delta.x));
              positioningSession.setManualY(String(currentY + delta.y));
              positioningSession.handleManualCommit(String(currentX + delta.x), String(currentY + delta.y));
          }
      },
      onNavigatePrev: () => {
          if (profile === 'drawing') drawingSession.handleNavigationAttempt(prevCharacter);
          else if (profile === 'positioning') positioningSession.handleNavigationAttempt('prev');
          else handleKerningNavigate('prev');
      },
      onNavigateNext: () => {
          if (profile === 'drawing') drawingSession.handleNavigationAttempt(nextCharacter);
          else if (profile === 'positioning') positioningSession.handleNavigationAttempt('next');
          else handleKerningNavigate('next');
      },
      canUndo: profile === 'drawing' ? drawingSession.canUndo : false,
      canRedo: profile === 'drawing' ? drawingSession.canRedo : false,
      hasSelection: selectedPathIds.size > 0,
      hasClipboard: !!clipboard,
      canNavigatePrev: !!prevCharacter,
      canNavigateNext: !!nextCharacter
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
  }, [modalOriginRect]);

  const handleConfirmUnlock = () => { onUnlockGlyph(character.unicode!); setIsUnlockConfirmOpen(false); showNotification(t('glyphUnlockedSuccess'), 'success'); };
  const handleConfirmRelink = () => { onRelinkGlyph(character.unicode!); drawingSession.handleRefresh(); setIsRelinkConfirmOpen(false); showNotification(t('glyphRelinkedSuccess'), 'success'); };

  // 5. Morphic Render Logic
  const renderHeader = () => {
    switch(profile) {
        case 'positioning':
            return (
                <PositioningEditorHeader 
                    targetLigature={character} prevPair={prevCharacter} nextPair={nextCharacter}
                    onNavigate={(dir) => positioningSession.handleNavigationAttempt(dir as any)}
                    activeAttachmentClass={positioningSession.activeAttachmentClass}
                    isLinked={positioningSession.isLinked} isPivot={positioningSession.isPivot}
                    canEdit={positioningSession.canEdit} isPositioned={markPositioningMap.has(pairIdentifier)}
                    onResetRequest={() => setIsDeleteConfirmOpen(true)} isGsubPair={true}
                    isPropertiesPanelOpen={false} setIsPropertiesPanelOpen={() => {}}
                    lsb={positioningSession.lsb} setLsb={positioningSession.setLsb} rsb={positioningSession.rsb} setRsb={positioningSession.setRsb}
                    metrics={metrics} isAutosaveEnabled={settings.isAutosaveEnabled} onSaveRequest={() => positioningSession.handleSave()}
                    isLargeScreen={isLargeScreen} isStripExpanded={false}
                />
            );
        case 'kerning':
            return (
                <KerningEditorHeader 
                    pair={{ left: kernLeftChar!, right: kernRightChar! }}
                    onClose={() => triggerClose(onClose)}
                    onNavigate={handleKerningNavigate}
                    hasPrev={!!prevCharacter} hasNext={!!nextCharacter}
                    onAutoKern={kerningSession.handleAutoKern}
                    isAutoKerning={kerningSession.isAutoKerning}
                    onSave={kerningSession.handleSave}
                    onRemove={kerningSession.handleSave} 
                    isDirty={kerningSession.isDirty}
                    settings={settings}
                />
            );
        default:
            return (
                <DrawingEditorHeader
                    character={character} glyphData={glyphData} prevCharacter={prevCharacter} nextCharacter={nextCharacter}
                    onBackClick={() => drawingSession.handleNavigationAttempt(null)} onNavigate={drawingSession.handleNavigationAttempt}
                    settings={settings} metrics={metrics} lsb={drawingSession.lsb} setLsb={drawingSession.setLsb} rsb={drawingSession.rsb} setRsb={drawingSession.setRsb}
                    onDeleteClick={() => setIsDeleteConfirmOpen(true)} onClear={() => drawingSession.handlePathsChange([])} onSave={drawingSession.handleSave} 
                    isLocked={drawingConstruction.isLocked} isComposite={drawingConstruction.isComposite} onRefresh={drawingSession.handleRefresh}
                    allCharacterSets={allCharacterSets} onSaveConstruction={drawingConstruction.handleSaveConstruction}
                    onUnlock={() => setIsUnlockConfirmOpen(true)} onRelink={() => setIsRelinkConfirmOpen(true)}
                    glyphClass={drawingSession.glyphClass} setGlyphClass={drawingSession.setGlyphClass} advWidth={drawingSession.advWidth} setAdvWidth={drawingSession.setAdvWidth}
                />
            );
    }
  };

  const renderWorkspace = () => {
    switch(profile) {
        case 'positioning':
            return (
                <PositioningEditorWorkspace 
                    markPaths={positioningSession.markPaths} basePaths={positioningSession.basePaths} targetLigature={character}
                    onPathsChange={positioningSession.handlePathsChange}
                    pageTool="select" onToggleTool={() => {}} 
                    zoom={positioningSession.zoom} setZoom={positioningSession.setZoom}
                    viewOffset={positioningSession.viewOffset} setViewOffset={positioningSession.setViewOffset}
                    onZoom={(f) => {}} onReuseClick={() => {}}
                    canEdit={positioningSession.canEdit}
                    movementConstraint={positioningSession.movementConstraint as any}
                    settings={settings} metrics={metrics}
                    manualX={positioningSession.manualX} manualY={positioningSession.manualY}
                    onManualChange={handlePositioningManualChange} onManualCommit={positioningSession.handleManualCommit}
                    setIsInputFocused={positioningSession.setIsInputFocused}
                    selectedPathIds={positioningSession.selectedPathIds} onSelectionChange={positioningSession.setSelectedPathIds}
                    showStrip={!!positioningSession.activeAttachmentClass} classSiblings={classSiblings} activePair={{ base: posBaseChar || character, mark: posMarkChar || character, ligature: character }} 
                    pivotChar={positioningSession.isPivot ? (positioningSession.activeAttachmentClass?.name ? null : (posMarkChar || character)) : (positioningSession.pivotName ? allCharsByName.get(positioningSession.pivotName) : null)}
                    glyphDataMap={allGlyphData}
                    anchorDelta={VEC.sub(positioningSession.currentOffset, positioningSession.alignmentOffset)} isLinked={positioningSession.isLinked} onToggleLink={handleToggleLink}
                    handleSelectSibling={(p: any) => onNavigate(p.ligature)} markAttachmentRules={markAttachmentRules} positioningRules={positioningRules}
                    characterSets={allCharacterSets} groups={groups} isStripExpanded={isStripExpanded} setIsStripExpanded={setIsStripExpanded}
                    activeAttachmentClass={positioningSession.activeAttachmentClass} hasDualContext={positioningSession.hasDualContext} activeClassType={positioningSession.activeClassType} onToggleContext={positioningSession.setOverrideClassType}
                    isLargeScreen={isLargeScreen}
                />
            );
        case 'kerning':
            return (
                <KerningEditorWorkspace 
                    isLargeScreen={isLargeScreen}
                    containerRef={kerningContainerRef} // USE THE STABLE REF
                    onZoom={kerningSession.setZoom}
                    kernValue={kerningSession.kernValue}
                    onKernChange={(e) => kerningSession.setKernValue(e.target.value)}
                    onKernFocus={kerningSession.setIsKernFocused}
                    onKernHover={kerningSession.setIsKernHovered}
                    isKernDirty={kerningSession.isDirty}
                    xDistValue={kerningSession.xDistValue}
                    onXDistChange={(e) => kerningSession.setXDistValue(e.target.value)}
                    onXDistCommit={kerningSession.handleXDistCommit}
                    isXDistFocused={kerningSession.isXDistFocused}
                    isXDistHovered={kerningSession.isXDistHovered}
                    onXDistFocus={kerningSession.setIsXDistFocused}
                    onXDistHover={kerningSession.setIsXDistHovered}
                    xDistInputRef={useRef(null)}
                >
                     <div 
                        className="rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800"
                        style={{ 
                            width: kerningSession.canvasDisplaySize.width || 800, 
                            height: kerningSession.canvasDisplaySize.height || 533 
                        }}
                    >
                        <KerningCanvas
                            width={kerningSession.canvasDisplaySize.width || 800}
                            height={kerningSession.canvasDisplaySize.height || 533}
                            leftChar={kernLeftChar!}
                            rightChar={kernRightChar!}
                            glyphDataMap={allGlyphData}
                            kernValue={kerningSession.kernValue}
                            onKernChange={kerningSession.setKernValue}
                            metrics={metrics}
                            tool="select"
                            zoom={kerningSession.zoom}
                            setZoom={kerningSession.setZoom}
                            viewOffset={kerningSession.viewOffset}
                            setViewOffset={kerningSession.setViewOffset}
                            settings={settings}
                            baseScale={kerningSession.baseScale}
                            strokeThickness={settings.strokeThickness}
                            showMeasurement={kerningSession.showMeasurement}
                        />
                    </div>
                </KerningEditorWorkspace>
            );
        default:
            return (
                <DrawingEditorWorkspace 
                    character={character} currentPaths={drawingSession.currentPaths} onPathsChange={drawingSession.handlePathsChange} metrics={metrics}
                    currentTool={currentTool} setCurrentTool={setCurrentTool} zoom={zoom} setZoom={setZoom}
                    viewOffset={viewOffset} setViewOffset={setViewOffset} settings={settings}
                    allGlyphData={allGlyphData} allCharacterSets={allCharacterSets} allCharsByName={allCharsByName}
                    lsb={drawingSession.lsb} rsb={drawingSession.rsb} onMetricsChange={(l, r) => { drawingSession.setLsb(l); drawingSession.setRsb(r); }}
                    isLargeScreen={isLargeScreen} isTransitioning={drawingSession.isTransitioning} wasEmptyOnLoad={drawingSession.wasEmptyOnLoad}
                    isLocked={drawingConstruction.isLocked} calligraphyAngle={calligraphyAngle} setCalligraphyAngle={setCalligraphyAngle}
                    selectedPathIds={selectedPathIds} setSelectedPathIds={setSelectedPathIds}
                    isImageSelected={isImageSelected} setIsImageSelected={setIsImageSelected}
                    backgroundImage={backgroundImage} backgroundImageOpacity={backgroundImageOpacity}
                    imageTransform={imageTransform} setImageTransform={setImageTransform}
                    previewTransform={previewTransform} setPreviewTransform={setPreviewTransform}
                    onApplyTransform={drawingOps.handleApplyTransform} onImageImportClick={() => drawingImport.imageImportRef.current?.click()}
                    onSvgImportClick={() => drawingImport.svgImportRef.current?.click()} onImageTraceClick={() => drawingImport.imageTraceRef.current?.click()}
                    undo={drawingSession.undo} redo={drawingSession.redo} canUndo={drawingSession.canUndo} canRedo={drawingSession.canRedo} handleCut={drawingOps.handleCut}
                    handleCopy={drawingOps.handleCopy} handlePaste={drawingOps.handlePaste} clipboard={clipboard}
                    handleGroup={drawingOps.handleGroup} handleUngroup={drawingOps.handleUngroup} canGroup={drawingOps.canGroup} canUngroup={drawingOps.canUngroup}
                    sourceGlyphs={sourceGlyphs} dependentGlyphs={dependentGlyphs} groups={groups}
                    handleNavigationAttempt={drawingSession.handleNavigationAttempt}
                    markAttachmentRules={markAttachmentRules}
                    gridConfig={gridConfig}
                />
            );
    }
  };

  const posBaseUni = posBaseChar?.unicode;
  const posMarkUni = posMarkChar?.unicode;
  const pairIdentifier = character.position ? `${posBaseUni}-${posMarkUni}` : '';

  return (
    <div ref={modalRef} className={`fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col ${animationClass}`}>
      <input type="file" ref={drawingImport.imageImportRef} onChange={drawingImport.handleImageImport} className="hidden" accept="image/*" />
      <input type="file" ref={drawingImport.svgImportRef} onChange={drawingImport.handleSvgImport} className="hidden" accept="image/svg+xml" />
      <input type="file" ref={drawingImport.imageTraceRef} onChange={drawingImport.handleImageTraceFileChange} className="hidden" accept="image/*" />

      {renderHeader()}
      {renderWorkspace()}

      {profile === 'drawing' && (
        <>
          <ImageControlPanel backgroundImage={backgroundImage} backgroundImageOpacity={backgroundImageOpacity} setBackgroundImageOpacity={setBackgroundImageOpacity} onClearImage={() => { setBackgroundImage(null); setImageTransform(null); }} />
          <DrawingConfirmationStack 
            isUnsavedModalOpen={drawingSession.isUnsavedModalOpen} closeUnsavedModal={drawingSession.closeUnsavedModal} confirmSave={drawingSession.confirmSave} confirmDiscard={drawingSession.confirmDiscard}
            isDeleteConfirmOpen={isDeleteConfirmOpen} setIsDeleteConfirmOpen={setIsDeleteConfirmOpen} onDelete={onDelete} character={character} dependentsCount={drawingConstruction.dependentsCount}
            isUnlockConfirmOpen={isUnlockConfirmOpen} setIsUnlockConfirmOpen={setIsUnlockConfirmOpen} onUnlock={handleConfirmUnlock}
            isRelinkConfirmOpen={isRelinkConfirmOpen} setIsRelinkConfirmOpen={setIsRelinkConfirmOpen} onRelink={handleConfirmRelink}
            isConstructionWarningOpen={drawingConstruction.isConstructionWarningOpen} setIsConstructionWarningOpen={drawingConstruction.setIsConstructionWarningOpen} pendingConstruction={drawingConstruction.pendingConstruction} executeConstructionUpdate={drawingConstruction.executeConstructionUpdate}
            isTracerModalOpen={isTracerModalOpen} setIsTracerModalOpen={setIsTracerModalOpen} tracerImageSrc={tracerImageSrc} handleInsertTracedSVG={drawingImport.handleInsertTracedSVG} metrics={metrics}
          />
        </>
      )}
    </div>
  );
};

export default React.memo(UnifiedEditorModal);