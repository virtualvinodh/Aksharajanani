
import React, { useRef, useEffect, useState } from 'react';
import { Character, GlyphData } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, DRAWING_CANVAS_SIZE, CheckCircleIcon, LinkIcon } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { isGlyphDrawn } from '../utils/glyphUtils';

interface CharacterCardProps {
  character: Character;
  glyphData: GlyphData | undefined;
  onSelect: (character: Character, rect: DOMRect) => void;
  // New props for selection mode
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (character: Character) => void;
  variant?: 'default' | 'compact';
}

declare var unicodeName: any;
declare var UnicodeProperties: any;

const CharacterCard: React.FC<CharacterCardProps> = ({ 
    character, glyphData, onSelect, 
    isSelectionMode = false, isSelected = false, onToggleSelect,
    variant = 'default'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { settings } = useSettings();
  
  const [tooltip, setTooltip] = useState<{ visible: boolean; name: string }>({ visible: false, name: '' });
  const longPressTimeout = useRef<number | null>(null);

  const showTooltip = () => {
    if (typeof unicodeName !== 'function' || character.unicode === undefined || character.isCustom || character.isPuaAssigned) {
      return;
    }
    try {
      const charStr = String.fromCodePoint(character.unicode);
      const name = unicodeName(charStr);
      if (name) {
        const titleCaseName = name.toLowerCase().split(' ').map((s: string) => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');
        setTooltip({ visible: true, name: titleCaseName });
      }
    } catch (e) { }
  };

  const hideTooltip = () => {
    setTooltip({ visible: false, name: '' });
  };

  const handleClick = (e: React.MouseEvent) => {
      // If we are in selection mode, OR if a modifier key is held, toggle selection.
      if (isSelectionMode || e.ctrlKey || e.metaKey || e.shiftKey) {
          e.stopPropagation();
          onToggleSelect?.(character);
      } else {
          // Normal navigation
          if (cardRef.current) {
              onSelect(character, cardRef.current.getBoundingClientRect());
          }
      }
  };

  const handleTouchStart = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    
    longPressTimeout.current = window.setTimeout(() => {
        // Long press action
        if (isSelectionMode) {
             // If already in selection mode, long press just shows tooltip as usual helper
             showTooltip();
        } else {
             // If NOT in selection mode, long press enters selection mode
             if (navigator.vibrate) navigator.vibrate(50);
             onToggleSelect?.(character);
        }
        longPressTimeout.current = null;
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    hideTooltip();
  };

  // Check if drawn
  const isDrawn = isGlyphDrawn(glyphData);

  useEffect(() => {
    // Only attempt to draw if the canvas exists (which it won't if isDrawn is false)
    const canvas = canvasRef.current;
    if (!canvas || !settings) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);

    if (isDrawn) {
        // Auto-fit logic to ensure wide glyphs (like 'au') don't spill or clip awkwardly
        const bbox = getAccurateGlyphBBox(glyphData!.paths, settings.strokeThickness);
        
        let scale = PREVIEW_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
        let tx = 0;
        let ty = 0;

        if (bbox) {
            const PADDING = 10;
            const availableWidth = PREVIEW_CANVAS_SIZE - (PADDING * 2);
            const availableHeight = PREVIEW_CANVAS_SIZE - (PADDING * 2);
            
            // Only adjust scale if the content is actually valid
            if (bbox.width > 0 && bbox.height > 0) {
                const fitScaleX = availableWidth / bbox.width;
                const fitScaleY = availableHeight / bbox.height;
                
                // Use the smaller scale to fit entirely, but don't blow up tiny glyphs too much
                const fitScale = Math.min(fitScaleX, fitScaleY);
                
                // If the glyph is huge, we shrink it (fitScale < standardScale).
                // If it's small, we keep standard scale to avoid inconsistent sizes in the grid.
                if (fitScale < scale) {
                    scale = fitScale;
                }
            }

            // Horizontal Centering: Always center content to prevent spillover
            const contentCenterX = bbox.x + bbox.width / 2;
            const canvasCenter = PREVIEW_CANVAS_SIZE / 2;
            tx = canvasCenter - (contentCenterX * scale);

            // Vertical Centering Logic:
            // We want to center most characters (bases, ligatures) to fill the card nicely.
            // HOWEVER, we must NOT center marks, modifiers, or punctuation, as their 
            // relative vertical position (high/low) is semantic (e.g. dot vs period).
            let shouldVerticallyCenter = true;

            if (character.glyphClass === 'mark') {
                shouldVerticallyCenter = false;
            } 
            else if (character.unicode && typeof UnicodeProperties !== 'undefined') {
                try {
                    const cat = UnicodeProperties.getCategory(character.unicode);
                    // Lm: Modifier Letter (e.g. ʰ, ʲ)
                    // Sk: Modifier Symbol (e.g. ˔)
                    // P*: Punctuation (e.g. . , - _)
                    if (cat === 'Lm' || cat === 'Sk' || cat.startsWith('P')) {
                        shouldVerticallyCenter = false;
                    }
                } catch (e) { }
            }

            if (shouldVerticallyCenter) {
                // Center the content bounding box (visually balanced)
                const contentCenterY = bbox.y + bbox.height / 2;
                ty = canvasCenter - (contentCenterY * scale);
            } else {
                // Center the drawing frame (preserve relative Y position)
                ty = (PREVIEW_CANVAS_SIZE - (DRAWING_CANVAS_SIZE * scale)) / 2;
            }
        }

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(scale, scale);
        renderPaths(ctx, glyphData!.paths, {
            strokeThickness: settings.strokeThickness,
            contrast: settings.contrast,
            color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
        });
        ctx.restore();
    }
  }, [glyphData, settings, theme, isDrawn]);

  if (!settings) return null;

  const isCompact = variant === 'compact';
  const paddingClass = isCompact ? 'p-2' : 'p-2 sm:p-4';
  // Added overflow-hidden to prevent spillover of wide characters
  const baseContainerClasses = `relative rounded-lg ${paddingClass} flex flex-col items-center justify-between cursor-pointer transition-all duration-200 aspect-square h-full group select-none overflow-hidden`;
  
  // Mark Identification for Styling
  const isNonSpacingMark = character.glyphClass === 'mark' && (character.advWidth === 0 || character.advWidth === '0');
  const isSpacingMark = character.glyphClass === 'mark' && !isNonSpacingMark;

  // Determine Type-Based Border Color (applied to both drawn and undrawn)
  let typeBorderClass = "border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400"; // Default Base/Ligature
  
  if (isNonSpacingMark) {
      // Muted Amber (Gold)
      typeBorderClass = "border-amber-300 dark:border-amber-700 hover:border-amber-500 dark:hover:border-amber-500";
  } else if (isSpacingMark) {
      // Muted Sky Blue
      typeBorderClass = "border-sky-300 dark:border-sky-700 hover:border-sky-500 dark:hover:border-sky-500";
  }

  let stateClasses = "";
  if (isSelected) {
      stateClasses = "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 border-transparent";
  } else if (character.hidden) {
      stateClasses = `bg-gray-50 dark:bg-gray-900/40 border-2 border-dashed ${typeBorderClass} opacity-70`;
  } else if (!isDrawn) {
      // Style for undrawn/empty glyphs - Dashed Border with Type Color
      stateClasses = `bg-white dark:bg-gray-800 border-2 border-dashed ${typeBorderClass} opacity-90`;
  } else {
      // Style for drawn glyphs - Solid Border with Type Color
      stateClasses = `bg-white dark:bg-gray-800 border-2 ${typeBorderClass}`;
  }

  // Show name logic: Default false (hidden), show only if setting is explicitly true.
  // Note: settings.showGlyphNames might be undefined for older projects.
  const showName = !!settings.showGlyphNames;
  const shouldShowNameBlock = !isDrawn || showName || settings.showUnicodeValues;

  // Dynamic font size for ghost text
  const nameLength = character.name.length;
  let ghostFontSizeClass = "text-4xl sm:text-6xl";
  if (nameLength > 2) ghostFontSizeClass = "text-xl sm:text-3xl";
  else if (nameLength > 1) ghostFontSizeClass = "text-3xl sm:text-5xl";

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`${baseContainerClasses} ${stateClasses}`}
    >
      {tooltip.visible && (
        <div className="absolute top-full mb-2 w-max max-w-xs bg-black text-white text-xs rounded py-1 px-2 z-50 pointer-events-none transform -translate-x-1/2 left-1/2 opacity-90 dark:bg-gray-700">
          {tooltip.name}
        </div>
      )}
      
      {/* Linked Glyph Badge */}
      {character.link && (
          <div className="absolute top-1 left-1 p-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full shadow-sm z-10" title="Linked Glyph">
             <LinkIcon className="w-3 h-3" />
          </div>
      )}

      {/* Selection Indicator Overlay */}
      {isSelectionMode && (
          <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10 ${isSelected ? 'bg-indigo-600 border-indigo-600 scale-110' : 'bg-white/80 dark:bg-gray-800/80 border-gray-400'}`}>
              {isSelected && <CheckCircleIcon className="w-4 h-4 text-white" />}
          </div>
      )}

      {character.hidden && (
          <span className={`absolute top-1 ${character.link ? 'left-8' : 'left-1'} text-[10px] font-bold text-gray-400 border border-gray-300 rounded px-1 bg-white dark:bg-gray-800`}>HIDDEN</span>
      )}

      {isDrawn ? (
        <>
          <div className="w-full flex-1 min-h-0 flex items-center justify-center">
            <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE} className={`transition-transform duration-200 max-w-full max-h-full object-contain ${!isSelectionMode ? 'group-hover:scale-110' : ''}`}></canvas>
          </div>
          {shouldShowNameBlock && (
              <div className="text-center mt-1 sm:mt-2 flex-shrink-0">
                {showName && (
                    <p 
                    className={`${isCompact ? 'text-sm' : 'text-lg sm:text-2xl'} font-bold text-gray-900 dark:text-white`}
                    style={{
                        fontFamily: 'var(--guide-font-family)',
                        fontFeatureSettings: 'var(--guide-font-feature-settings)'
                    }}
                    >
                    {character.name}
                    </p>
                )}
                {settings.showUnicodeValues && character.unicode !== undefined && (
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</p>
                )}
              </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center flex-col">
            <span 
                className={`${ghostFontSizeClass} text-gray-200 dark:text-gray-700 font-bold select-none transition-colors group-hover:text-gray-300 dark:group-hover:text-gray-600`}
                style={{
                  fontFamily: 'var(--guide-font-family)',
                  fontFeatureSettings: 'var(--guide-font-feature-settings)'
                }}
            >
                {character.name}
            </span>
             {settings.showUnicodeValues && character.unicode !== undefined && (
                <span className="absolute bottom-2 text-[10px] text-gray-300 dark:text-gray-600">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</span>
            )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CharacterCard);
