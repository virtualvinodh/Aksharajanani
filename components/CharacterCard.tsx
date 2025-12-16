
import React, { useRef, useEffect, useState } from 'react';
import { Character, GlyphData } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
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
        const scale = PREVIEW_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
        ctx.save();
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
  const baseContainerClasses = `relative rounded-lg ${paddingClass} flex flex-col items-center justify-between cursor-pointer transition-all duration-200 aspect-square h-full group select-none`;
  
  let stateClasses = "";
  if (isSelected) {
      stateClasses = "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 border-transparent";
  } else if (character.hidden) {
      stateClasses = "bg-gray-50 dark:bg-gray-900/40 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-500 opacity-70";
  } else if (!isDrawn) {
      // Style for undrawn/empty glyphs
      stateClasses = "bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-indigo-500 hover:border-solid opacity-90";
  } else {
      // Style for drawn glyphs
      stateClasses = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500";
  }

  // Show name logic: Default false (hidden), show only if setting is explicitly true.
  // Note: settings.showGlyphNames might be undefined for older projects.
  const showName = !!settings.showGlyphNames;
  const shouldShowNameBlock = !isDrawn || showName || settings.showUnicodeValues;

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
                className="text-4xl sm:text-6xl text-gray-200 dark:text-gray-700 font-bold select-none transition-colors group-hover:text-gray-300 dark:group-hover:text-gray-600"
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
