
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Character, CharacterSet, GlyphData, FontMetrics } from '../types';
import { BackIcon, ZoomInIcon, ZoomOutIcon, LeftArrowIcon, RightArrowIcon, DRAWING_CANVAS_SIZE, COMPARISON_CELL_HEIGHT, COMPARISON_CELL_WIDTH } from '../constants';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import Footer from './Footer';
import { renderPaths } from '../services/glyphRenderService';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { isGlyphDrawn } from '../utils/glyphUtils';

interface ComparisonViewProps {
  onClose: () => void;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useLocale();
  const { theme } = useTheme();
  const { characterSets } = useProject();
  const { glyphDataMap, version: glyphVersion } = useGlyphData();
  const { settings, metrics } = useSettings();
  const { comparisonCharacters, setComparisonCharacters } = useLayout();
  
  const [isFolded, setIsFolded] = useState(true);
  const [zoom, setZoom] = useState(1);
  const didRunAutoSelect = useRef(false);
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');

  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const { visibility: showHorizontalArrows, handleScroll: handleHorizontalScroll } = useHorizontalScroll(horizontalScrollRef);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const { visibility: showCategoryArrows, handleScroll: handleCategoryScroll } = useHorizontalScroll(categoryScrollRef);


  useEffect(() => {
    if (didRunAutoSelect.current || !characterSets) {
        return;
    }
    if (isLargeScreen) {
      const completedChars = characterSets
        .flatMap(set => set.characters)
        .filter(char => !char.hidden && isGlyphDrawn(glyphDataMap.get(char.unicode)));
      setComparisonCharacters(completedChars.sort((a,b) => a.unicode - b.unicode));
    } else {
      setComparisonCharacters([]);
    }
    didRunAutoSelect.current = true;
  }, [characterSets, glyphDataMap, setComparisonCharacters, isLargeScreen]);

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.2, Math.min(5, prev * factor)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !container || !settings || !metrics) return;

    const { strokeThickness, editorMode } = settings;

    const draw = () => {
      const CELL_HEIGHT = COMPARISON_CELL_HEIGHT * zoom;
      const CELL_WIDTH = COMPARISON_CELL_WIDTH * zoom;
      const scale = CELL_HEIGHT / DRAWING_CANVAS_SIZE;

      const containerWidth = container.clientWidth;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (comparisonCharacters.length === 0) return;

      const TOP_LINE_Y = metrics.topLineY * scale;
      const BASE_LINE_Y = metrics.baseLineY * scale;
      const SUPER_TOP_LINE_Y = metrics.superTopLineY ? metrics.superTopLineY * scale : null;
      const SUB_BASE_LINE_Y = metrics.subBaseLineY ? metrics.subBaseLineY * scale : null;
      
      const guideColor = theme === 'dark' ? '#4A5568' : '#D1D5DB';
      const textColor = theme === 'dark' ? '#9CA3AF' : '#4B5563';
      const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
      const guideFontFamily = getComputedStyle(document.documentElement).getPropertyValue('--guide-font-family').trim() || 'sans-serif';
      
      const drawCell = (char: Character, cellStartX: number, cellStartY: number) => {
        const glyphDrawOrigin = {
          x: cellStartX + (CELL_WIDTH - (DRAWING_CANVAS_SIZE * scale)) / 2,
          y: cellStartY + (CELL_HEIGHT - (DRAWING_CANVAS_SIZE * scale)) / 2
        };
        
        const glyph = glyphDataMap.get(char.unicode);
        if (isGlyphDrawn(glyph)) {
            ctx.save();
            ctx.translate(glyphDrawOrigin.x, glyphDrawOrigin.y);
            ctx.scale(scale, scale);
            renderPaths(ctx, glyph!.paths, { strokeThickness, color: glyphColor });
            ctx.restore();
        }
        
        ctx.fillStyle = textColor;
        ctx.font = `${14 * zoom}px ${guideFontFamily}`;
        ctx.textAlign = 'center';
        const textX = cellStartX + CELL_WIDTH / 2;
        ctx.fillText(char.name, textX, cellStartY + CELL_HEIGHT - (22 * zoom));
        if (editorMode === 'advanced') {
          ctx.font = `${10 * zoom}px ${guideFontFamily}`;
          ctx.fillText(`U+${char.unicode.toString(16).toUpperCase().padStart(4, '0')}`, textX, cellStartY + CELL_HEIGHT - (8 * zoom));
        }
      };
      
      if (isFolded) {
          const cols = Math.max(1, Math.floor(containerWidth / CELL_WIDTH));
          const rows = Math.ceil(comparisonCharacters.length / cols);
          
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

          comparisonCharacters.forEach((char, index) => {
              const col = index % cols;
              const row = Math.floor(index / cols);
              drawCell(char, col * CELL_WIDTH, row * CELL_HEIGHT);
          });
      } else {
          // UNFOLDED VIEW
          canvas.width = comparisonCharacters.length * CELL_WIDTH;
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

          comparisonCharacters.forEach((char, index) => {
              drawCell(char, index * CELL_WIDTH, 0);
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
  }, [comparisonCharacters, glyphDataMap, settings, metrics, t, isFolded, theme, zoom, glyphVersion]);

  const handleToggleCharacter = (character: Character, isSelected: boolean) => {
    if (isSelected) {
      setComparisonCharacters([...comparisonCharacters, character].sort((a,b) => a.unicode - b.unicode));
    } else {
      setComparisonCharacters(comparisonCharacters.filter(c => c.unicode !== character.unicode));
    }
  };

  const handleToggleCategory = (categorySet: CharacterSet, shouldDeselect: boolean) => {
    const categoryUnicodes = new Set(categorySet.characters.map(c => c.unicode));
    setComparisonCharacters(prev => {
        let newSelection;
        if (shouldDeselect) {
            // Deselect all from this category
            newSelection = prev.filter(c => !categoryUnicodes.has(c.unicode));
        } else {
            // Select all from this category, avoiding duplicates
            const charsToAdd = categorySet.characters.filter(c => !c.hidden && !prev.some(pc => pc.unicode === c.unicode));
            newSelection = [...prev, ...charsToAdd];
        }
        return newSelection.sort((a, b) => a.unicode - b.unicode);
    });
  };

  const isCharacterSelected = (character: Character) => {
    return comparisonCharacters.some(c => c.unicode === character.unicode);
  };

  const handleSelectAll = () => {
    if (!characterSets) return;
    const allChars = characterSets.flatMap(set => set.characters).filter(char => !char.hidden);
    setComparisonCharacters(allChars.sort((a,b) => a.unicode - b.unicode));
  };

  const handleSelectNone = () => {
    setComparisonCharacters([]);
  };

  const CategoryCheckbox: React.FC<{ categorySet: CharacterSet; isChip?: boolean }> = ({ categorySet, isChip = false }) => {
    const checkboxRef = useRef<HTMLInputElement>(null);

    const selectionStatus = useMemo(() => {
        const visibleChars = categorySet.characters.filter(c => !c.hidden);
        if (!visibleChars || visibleChars.length === 0) return 'none';
        
        const categoryUnicodes = new Set(visibleChars.map(c => c.unicode));
        const selectedInCategory = comparisonCharacters.filter(c => categoryUnicodes.has(c.unicode));

        if (selectedInCategory.length === 0) return 'none';
        if (selectedInCategory.length === visibleChars.length) return 'all';
        return 'some';
    }, [categorySet, comparisonCharacters]);

    useEffect(() => {
        if (checkboxRef.current) {
            checkboxRef.current.indeterminate = selectionStatus === 'some';
        }
    }, [selectionStatus]);

    const isChecked = selectionStatus === 'all';
    const shouldDeselect = selectionStatus !== 'none';
    
    const labelClasses = isChip
      ? `flex-shrink-0 flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors whitespace-nowrap border ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`
      : "flex items-center gap-3 p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-sm";
    
    return (
        <label className={labelClasses}>
            <input
                ref={checkboxRef}
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggleCategory(categorySet, shouldDeselect)}
                className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500 accent-indigo-500"
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
                      onClick={handleSelectNone}
                      className="w-full text-center px-3 py-1.5 text-sm bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors"
                    >
                      {t('selectNone')}
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
                            {set.characters.map(char => (
                                <label key={char.unicode} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-sm">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-indigo-600 dark:text-indigo-500 focus:ring-indigo-500 accent-indigo-500"
                                        checked={isCharacterSelected(char)}
                                        onChange={(e) => handleToggleCharacter(char, e.target.checked)}
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
                                    <span className="ml-auto text-gray-500 dark:text-gray-400 text-xs">U+{char.unicode.toString(16).toUpperCase().padStart(4, '0')}</span>
                                </label>
                            ))}
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
                            <button onClick={handleSelectNone} className="px-3 py-1.5 text-xs bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors">{t('selectNone')}</button>
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
                           {visibleCharacterSets.flatMap(set => set.characters).map(char => (
                               <label key={char.unicode} className={`flex-shrink-0 flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors whitespace-nowrap border ${isCharacterSelected(char) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
                                    <input
                                        type="checkbox"
                                        checked={isCharacterSelected(char)}
                                        onChange={(e) => handleToggleCharacter(char, e.target.checked)}
                                        className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500 accent-indigo-500"
                                    />
                                    <span className="text-sm" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                        {char.name}
                                    </span>
                                </label>
                           ))}
                        </div>
                        {showHorizontalArrows.right && (
                            <button onClick={() => handleHorizontalScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-900/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-900">
                                <RightArrowIcon className="h-5 w-5"/>
                            </button>
                        )}
                    </div>
                 </div>
            )}
            {comparisonCharacters.length > 0 ? (
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
      <Footer />
    </div>
  );
};

export default React.memo(ComparisonView);
