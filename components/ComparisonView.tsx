
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Character, CharacterSet, GlyphData, FontMetrics, UnifiedRenderContext, Path } from '../types';
import { BackIcon, ZoomInIcon, ZoomOutIcon, LeftArrowIcon, RightArrowIcon, DRAWING_CANVAS_SIZE, COMPARISON_CELL_HEIGHT, COMPARISON_CELL_WIDTH, ClearIcon } from '../constants';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import Footer from './Footer';
import { renderPaths, getUnifiedPaths } from '../services/glyphRenderService';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { isGlyphRenderable } from '../utils/glyphUtils';
import { usePositioning } from '../contexts/PositioningContext';
import { useKerning } from '../contexts/KerningContext';
import { useRules } from '../contexts/RulesContext';

interface ComparisonViewProps {
  onClose: () => void;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useLocale();
  const { theme } = useTheme();
  const { characterSets, allCharsByName, markAttachmentRules, positioningRules } = useProject();
  const { glyphDataMap, version: glyphVersion } = useGlyphData();
  const { settings, metrics } = useSettings();
  const { comparisonCharacters, setComparisonCharacters } = useLayout();
  const { markPositioningMap } = usePositioning();
  const { kerningMap } = useKerning();
  const { state: rulesState } = useRules();
  const groups = rulesState.fontRules?.groups || {};
  
  const [isFolded, setIsFolded] = useState(true);
  const [zoom, setZoom] = useState(1);
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');

  const { visibility: showHorizontalArrows, handleScroll: handleHorizontalScroll, scrollRef: horizontalScrollRef } = useHorizontalScroll();
  const { visibility: showCategoryArrows, handleScroll: handleCategoryScroll, scrollRef: categoryScrollRef } = useHorizontalScroll();

  // View Mode: 'all' means implicit show all (dynamic). 'custom' means respect comparisonCharacters array explicitly.
  // We initialize to 'custom' if there is already a selection, otherwise 'all'.
  const [viewMode, setViewMode] = useState<'all' | 'custom'>(
      comparisonCharacters.length > 0 ? 'custom' : 'all'
  );

  // 1. Calculate all currently valid/renderable glyphs derived from the project state
  const allRenderableChars = useMemo(() => {
      if (!characterSets) return [];
      return characterSets
        .flatMap(set => set.characters)
        .filter(char => {
            if (char.hidden) return false;
            // Only include glyphs that are visually renderable (have content or valid dependencies)
            return isGlyphRenderable(char, glyphDataMap, allCharsByName);
        })
        .sort((a,b) => (a.unicode || 0) - (b.unicode || 0));
  }, [characterSets, glyphDataMap, allCharsByName, glyphVersion]);

  // 2. Determine active characters based on View Mode
  const activeCharacters = useMemo(() => {
      if (viewMode === 'all') {
          return allRenderableChars;
      }
      
      const validUnicodes = new Set(allRenderableChars.map(c => c.unicode));
      return comparisonCharacters.filter(c => validUnicodes.has(c.unicode));
  }, [comparisonCharacters, allRenderableChars, viewMode]);

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.2, Math.min(5, prev * factor)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !container || !settings || !metrics || !characterSets) return;

    const { strokeThickness, showUnicodeValues } = settings;

    const draw = () => {
      const CELL_HEIGHT = COMPARISON_CELL_HEIGHT * zoom;
      const CELL_WIDTH = COMPARISON_CELL_WIDTH * zoom;
      const scale = CELL_HEIGHT / DRAWING_CANVAS_SIZE;

      const containerWidth = container.clientWidth;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (activeCharacters.length === 0) return;

      const TOP_LINE_Y = metrics.topLineY * scale;
      const BASE_LINE_Y = metrics.baseLineY * scale;
      const SUPER_TOP_LINE_Y = metrics.superTopLineY ? metrics.superTopLineY * scale : null;
      const SUB_BASE_LINE_Y = metrics.subBaseLineY ? metrics.subBaseLineY * scale : null;
      
      const guideColor = theme === 'dark' ? '#4A5568' : '#D1D5DB';
      const textColor = theme === 'dark' ? '#9CA3AF' : '#4B5563';
      const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
      const guideFontFamily = getComputedStyle(document.documentElement).getPropertyValue('--guide-font-family').trim() || 'sans-serif';
      
      const renderCtx: UnifiedRenderContext = {
          glyphDataMap,
          allCharsByName,
          markPositioningMap,
          kerningMap,
          characterSets,
          groups,
          metrics,
          markAttachmentRules,
          strokeThickness,
          positioningRules
      };

      // Pre-calculate paths and filter out empty items (e.g. space char) to prevent gaps in the grid
      const validItems = activeCharacters.map(char => ({
          char,
          paths: getUnifiedPaths(char, renderCtx)
      })).filter(item => item.paths.length > 0);

      const drawCell = (char: Character, paths: Path[], cellStartX: number, cellStartY: number) => {
        const glyphDrawOrigin = {
          x: cellStartX + (CELL_WIDTH - (DRAWING_CANVAS_SIZE * scale)) / 2,
          y: cellStartY + (CELL_HEIGHT - (DRAWING_CANVAS_SIZE * scale)) / 2
        };
        
        ctx.save();
        ctx.translate(glyphDrawOrigin.x, glyphDrawOrigin.y);
        ctx.scale(scale, scale);
        renderPaths(ctx, paths, { strokeThickness, color: glyphColor });
        ctx.restore();
        
        ctx.fillStyle = textColor;
        ctx.font = `${14 * zoom}px ${guideFontFamily}`;
        ctx.textAlign = 'center';
        const textX = cellStartX + CELL_WIDTH / 2;
        ctx.fillText(char.name, textX, cellStartY + CELL_HEIGHT - (22 * zoom));
        
        if (showUnicodeValues && char.unicode !== undefined && char.glyphClass !== 'virtual') {
          ctx.font = `${10 * zoom}px ${guideFontFamily}`;
          ctx.fillText(`U+${char.unicode.toString(16).toUpperCase().padStart(4, '0')}`, textX, cellStartY + CELL_HEIGHT - (8 * zoom));
        }
      };
      
      if (isFolded) {
          const cols = Math.max(1, Math.floor(containerWidth / CELL_WIDTH));
          const rows = Math.ceil(validItems.length / cols);
          
          canvas.width = containerWidth;
          canvas.height = rows * CELL_HEIGHT;

          ctx.strokeStyle = guideColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([8 / zoom, 6 / zoom]);
          for(let i=0; i<rows; i++) {
              const rowY = i * CELL_HEIGHT;
              ctx.beginPath();
              ctx.moveTo(0, rowY + TOP_LINE_Y);
              ctx.lineTo(canvas.width, rowY + TOP_LINE_Y);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(0, rowY + BASE_LINE_Y);
              ctx.lineTo(canvas.width, rowY + BASE_LINE_Y);
              ctx.stroke();
          }
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          if (SUPER_TOP_LINE_Y !== null) {
              for(let i=0; i<rows; i++) {
                  const rowY = i * CELL_HEIGHT;
                  ctx.beginPath(); ctx.moveTo(0, rowY + SUPER_TOP_LINE_Y); ctx.lineTo(canvas.width, rowY + SUPER_TOP_LINE_Y); ctx.stroke();
              }
          }
          if (SUB_BASE_LINE_Y !== null) {
              for(let i=0; i<rows; i++) {
                  const rowY = i * CELL_HEIGHT;
                  ctx.beginPath(); ctx.moveTo(0, rowY + SUB_BASE_LINE_Y); ctx.lineTo(canvas.width, rowY + SUB_BASE_LINE_Y); ctx.stroke();
              }
          }
          ctx.setLineDash([]);

          validItems.forEach(({char, paths}, index) => {
              const col = index % cols;
              const row = Math.floor(index / cols);
              drawCell(char, paths, col * CELL_WIDTH, row * CELL_HEIGHT);
          });
      } else {
          // UNFOLDED VIEW
          canvas.width = validItems.length * CELL_WIDTH;
          canvas.height = CELL_HEIGHT;
          
          ctx.strokeStyle = guideColor;
          ctx.lineWidth = 1;
          const drawLine = (y: number, dash?: number[]) => {
              ctx.setLineDash(dash || []);
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(canvas.width, y);
              ctx.stroke();
          };
          drawLine(TOP_LINE_Y, [8 / zoom, 6 / zoom]);
          drawLine(BASE_LINE_Y, [8 / zoom, 6 / zoom]);
          if (SUPER_TOP_LINE_Y !== null) drawLine(SUPER_TOP_LINE_Y, [4 / zoom, 4 / zoom]);
          if (SUB_BASE_LINE_Y !== null) drawLine(SUB_BASE_LINE_Y, [4 / zoom, 4 / zoom]);
          ctx.setLineDash([]);

          validItems.forEach(({char, paths}, index) => {
              drawCell(char, paths, index * CELL_WIDTH, 0);
          });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(draw);
    });
    resizeObserver.observe(container);

    draw();

    return () => {
        resizeObserver.disconnect();
    };
  }, [activeCharacters, glyphDataMap, settings, metrics, t, isFolded, theme, zoom, glyphVersion, markPositioningMap, kerningMap, allCharsByName, markAttachmentRules, positioningRules, characterSets, groups]);

  const handleToggleCharacter = (character: Character, isSelected: boolean) => {
    if (viewMode === 'all') {
        // If we are in "All" mode and user deselects something, we switch to custom mode
        // and populate the list with everything EXCEPT the deselected one.
        if (!isSelected) {
            const newSelection = allRenderableChars.filter(c => c.unicode !== character.unicode);
            setComparisonCharacters(newSelection);
            setViewMode('custom');
        }
    } else {
        // Standard toggle in custom mode
        if (isSelected) {
            setComparisonCharacters([...comparisonCharacters, character].sort((a,b) => (a.unicode||0) - (b.unicode||0)));
        } else {
            setComparisonCharacters(comparisonCharacters.filter(c => c.unicode !== character.unicode));
        }
    }
  };

  const handleToggleCategory = (categorySet: CharacterSet, shouldDeselect: boolean) => {
    const categoryUnicodes = new Set(categorySet.characters.map(c => c.unicode));
    
    if (viewMode === 'all') {
        if (shouldDeselect) {
             // Deselecting a category from "All" view -> Switch to Custom, select everything else
             const newSelection = allRenderableChars.filter(c => !categoryUnicodes.has(c.unicode));
             setComparisonCharacters(newSelection);
             setViewMode('custom');
        }
        return;
    }

    setComparisonCharacters(prev => {
        let newSelection;
        if (shouldDeselect) {
            // Deselect all from this category
            newSelection = prev.filter(c => !categoryUnicodes.has(c.unicode));
        } else {
            // Select all valid characters from this category, avoiding duplicates
            const charsToAdd = categorySet.characters.filter(c => 
                !c.hidden && 
                !prev.some(pc => pc.unicode === c.unicode) &&
                isGlyphRenderable(c, glyphDataMap, allCharsByName) // Only add valid glyphs
            );
            newSelection = [...prev, ...charsToAdd];
        }
        return newSelection.sort((a, b) => (a.unicode||0) - (b.unicode||0));
    });
  };

  const isCharacterSelected = (character: Character) => {
    if (viewMode === 'all') return true;
    return comparisonCharacters.some(c => c.unicode === character.unicode);
  };

  const handleSelectAll = () => {
    // Switch to Implicit All mode, clear specific selection list to keep it clean
    setViewMode('all');
    setComparisonCharacters([]);
  };

  const handleClear = () => {
    // Switch to Custom mode, clear selection list -> Screen becomes blank
    setViewMode('custom');
    setComparisonCharacters([]);
  };

  const CategoryCheckbox: React.FC<{ categorySet: CharacterSet; isChip?: boolean }> = ({ categorySet, isChip = false }) => {
    const checkboxRef = useRef<HTMLInputElement>(null);

    const selectionStatus = useMemo(() => {
        // Only consider characters that CAN be selected (are renderable)
        const visibleRenderableChars = categorySet.characters.filter(c => 
            !c.hidden && isGlyphRenderable(c, glyphDataMap, allCharsByName)
        );
        
        if (!visibleRenderableChars || visibleRenderableChars.length === 0) return 'none';
        
        // Use activeCharacters (the resolved list) to determine checked status
        const categoryUnicodes = new Set(visibleRenderableChars.map(c => c.unicode));
        const selectedInCategory = activeCharacters.filter(c => categoryUnicodes.has(c.unicode));

        if (selectedInCategory.length === 0) return 'none';
        if (selectedInCategory.length === visibleRenderableChars.length) return 'all';
        return 'some';
    }, [categorySet, activeCharacters]);

    useEffect(() => {
        if (checkboxRef.current) {
            checkboxRef.current.indeterminate = selectionStatus === 'some';
        }
    }, [selectionStatus]);

    const isChecked = selectionStatus === 'all';
    const shouldDeselect = selectionStatus !== 'none';
    
    // Check if category has ANY renderable items. If not, disable it.
    const hasAnyRenderable = categorySet.characters.some(c => !c.hidden && isGlyphRenderable(c, glyphDataMap, allCharsByName));
    const isDisabled = !hasAnyRenderable;

    const labelClasses = isChip
      ? `flex-shrink-0 flex items-center gap-2 p-2 rounded-md transition-colors whitespace-nowrap border ${isDisabled ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60' : (isChecked ? 'bg-indigo-600 border-indigo-600 text-white cursor-pointer' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer')}`
      : `flex items-center gap-3 p-2 rounded-md text-sm ${isDisabled ? 'text-gray-400 cursor-not-allowed opacity-60' : 'hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer'}`;
    
    return (
        <label className={labelClasses}>
            <input
                ref={checkboxRef}
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => !isDisabled && handleToggleCategory(categorySet, shouldDeselect)}
                className={`h-4 w-4 rounded border-gray-400 dark:border-gray-500 focus:ring-indigo-500 accent-indigo-500 ${isDisabled ? 'bg-gray-200' : 'bg-gray-300 dark:bg-gray-600'}`}
            />
            <span className={`font-semibold ${isChip ? 'text-sm' : ''}`}>{t(categorySet.nameKey)}</span>
        </label>
    );
  };

  if (!characterSets || !settings || !metrics) return null;

  const visibleCharacterSets = characterSets.map(set => ({
      ...set,
      characters: set.characters.filter(char => !char.hidden)
  })).filter(set => set.characters.length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex flex-col">
      <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0 z-20">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
        >
          <BackIcon />
          <span className="hidden sm:inline">{t('back')}</span>
        </button>
        <div className="text-center flex-grow">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('glyphComparison')}</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm hidden sm:block">{t('selectToCompare')}</p>
        </div>
        <div className="w-24 hidden sm:block"></div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {isLargeScreen && (
            <aside className="w-72 bg-gray-100 dark:bg-gray-800 flex-shrink-0 p-4 overflow-y-auto">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 sticky top-0 bg-gray-100 dark:bg-gray-800 py-2">{t('characters')}</h3>
                
                <div className="space-y-4 mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectAll}
                      className="w-full text-center px-3 py-1.5 text-sm bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors"
                    >
                      {t('selectAll')}
                    </button>
                    <button
                      onClick={handleClear}
                      className="w-full text-center px-3 py-1.5 text-sm bg-gray-200 text-gray-700 font-semibold rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-1"
                    >
                      <ClearIcon className="w-4 h-4"/>
                      {t('clear')}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleZoom(1.2)} title={t('zoomIn')} className="w-full flex justify-center items-center p-2 text-sm bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors"><ZoomInIcon /></button>
                    <button onClick={() => handleZoom(0.8)} title={t('zoomOut')} className="w-full flex justify-center items-center p-2 text-sm bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors"><ZoomOutIcon /></button>
                  </div>
                  <label className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
                    <span>{t('foldLines')}</span>
                    <div className="relative inline-flex items-center">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        id="wrap-lines-toggle-desktop"
                        checked={isFolded}
                        onChange={() => setIsFolded(prev => !prev)}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 mb-4"></div>

                <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2">Categories</h4>
                <div className="flex flex-col gap-1 mb-4">
                  {visibleCharacterSets.map(set => <CategoryCheckbox key={set.nameKey} categorySet={set} />)}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 mb-4"></div>

                {visibleCharacterSets.map(set => (
                    <div key={set.nameKey} className="mb-4">
                        <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2">{t(set.nameKey)}</h4>
                        <div className="flex flex-col gap-1">
                            {set.characters.map(char => {
                                const canRender = isGlyphRenderable(char, glyphDataMap, allCharsByName);
                                return (
                                    <label key={char.unicode} className={`flex items-center gap-3 p-2 rounded-md text-sm ${canRender ? 'hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer' : 'opacity-40 cursor-not-allowed grayscale'}`}>
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-indigo-600 dark:text-indigo-500 focus:ring-indigo-500 accent-indigo-500"
                                            checked={isCharacterSelected(char)}
                                            onChange={(e) => canRender && handleToggleCharacter(char, e.target.checked)}
                                            disabled={!canRender}
                                        />
                                        <span
                                            className="text-lg font-semibold text-gray-800 dark:text-gray-200"
                                            style={{
                                              fontFamily: 'var(--guide-font-family)',
                                              fontFeatureSettings: 'var(--guide-font-feature-settings)'
                                            }}
                                        >
                                          {char.name}
                                        </span>
                                        {char.unicode !== undefined && <span className="ml-auto text-gray-500 dark:text-gray-400 text-xs">U+{char.unicode.toString(16).toUpperCase().padStart(4, '0')}</span>}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </aside>
        )}

        <main className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
            {!isLargeScreen && (
                 <div className="p-4 border-b dark:border-gray-700 flex-shrink-0 space-y-4 bg-gray-100 dark:bg-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <div className="flex items-center gap-2">
                            <button onClick={handleSelectAll} className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors">{t('selectAll')}</button>
                            <button onClick={handleClear} className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 font-semibold rounded-md hover:bg-gray-300 transition-colors flex items-center gap-1">
                                <ClearIcon className="w-3 h-3"/>
                                {t('clear')}
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleZoom(1.2)} title={t('zoomIn')} className="p-2 text-sm bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors"><ZoomInIcon /></button>
                            <button onClick={() => handleZoom(0.8)} title={t('zoomOut')} className="p-2 text-sm bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors"><ZoomOutIcon /></button>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                            <span>{t('foldLines')}</span>
                            <div className="relative inline-flex items-center">
                                <input type="checkbox" className="sr-only peer" id="wrap-lines-toggle-mobile" checked={isFolded} onChange={() => setIsFolded(p => !p)} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </div>
                        </label>
                    </div>

                    <div className="relative">
                        {showCategoryArrows.left && (
                            <button onClick={() => handleCategoryScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-900/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-900">
                                <LeftArrowIcon className="h-5 w-5"/>
                            </button>
                        )}
                        <div ref={categoryScrollRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                            {visibleCharacterSets.map(set => <CategoryCheckbox key={set.nameKey} categorySet={set} isChip={true} />)}
                        </div>
                        {showCategoryArrows.right && (
                            <button onClick={() => handleCategoryScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-900/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-900">
                                <RightArrowIcon className="h-5 w-5"/>
                            </button>
                        )}
                    </div>

                    <div className="relative">
                        {showHorizontalArrows.left && (
                            <button onClick={() => handleHorizontalScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-900/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-900">
                                <LeftArrowIcon className="h-5 w-5"/>
                            </button>
                        )}
                        <div ref={horizontalScrollRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                           {visibleCharacterSets.flatMap(set => set.characters).map(char => {
                               const canRender = isGlyphRenderable(char, glyphDataMap, allCharsByName);
                               return (
                               <label key={char.unicode} className={`flex-shrink-0 flex items-center gap-2 p-2 rounded-md transition-colors whitespace-nowrap border ${canRender ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600' : 'opacity-50 cursor-not-allowed grayscale bg-gray-100 dark:bg-gray-700/50'} ${isCharacterSelected(char) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}>
                                    <input
                                        type="checkbox"
                                        checked={isCharacterSelected(char)}
                                        onChange={(e) => canRender && handleToggleCharacter(char, e.target.checked)}
                                        disabled={!canRender}
                                        className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500 accent-indigo-500"
                                    />
                                    <span className="text-sm" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                        {char.name}
                                    </span>
                                </label>
                               )
                           })}
                        </div>
                        {showHorizontalArrows.right && (
                            <button onClick={() => handleHorizontalScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-900/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-900">
                                <RightArrowIcon className="h-5 w-5"/>
                            </button>
                        )}
                    </div>
                 </div>
            )}
            {activeCharacters.length > 0 ? (
                <div ref={containerRef} className="flex-1 p-4 overflow-auto">
                    <canvas ref={canvasRef} style={{ width: isFolded ? '100%' : 'auto' }}/>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-center text-gray-500 dark:text-gray-500 p-4">
                    <p>{t('selectToCompare')}</p>
                </div>
            )}
        </main>
      </div>
      <Footer hideOnMobile={true} />
    </div>
  );
};

export default React.memo(ComparisonView);
