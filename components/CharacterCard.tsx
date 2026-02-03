import React, { useRef, useEffect } from 'react';
import { Character, GlyphData } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, calculateUnifiedTransform } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, CheckCircleIcon, LinkIcon, PuzzleIcon, PositioningIcon, KerningIcon } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { isGlyphDrawn as isDrawnCheck } from '../utils/glyphUtils';
import { useLayout } from '../contexts/LayoutContext';

interface CharacterCardProps {
  character: Character;
  glyphData: GlyphData | undefined;
  isAvailable: boolean;
  isManuallySet: boolean;
  isConstructed: boolean;
  onSelect: (character: Character, rect: DOMRect) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (character: Character) => void;
  variant?: 'default' | 'compact' | 'overlay';
  disabledReason?: string;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ 
    character, glyphData, isAvailable, isManuallySet, isConstructed, onSelect, 
    isSelectionMode = false, isSelected = false, onToggleSelect,
    variant = 'default', disabledReason
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { settings, metrics } = useSettings();
  const { showNotification } = useLayout();
  
  const handleClick = (e: React.MouseEvent) => {
      if (!isAvailable) {
          if (disabledReason) {
              showNotification(disabledReason, 'info');
          }
          return;
      }
      if (isSelectionMode || e.ctrlKey || e.metaKey || e.shiftKey) {
          e.stopPropagation();
          onToggleSelect?.(character);
      } else {
          if (cardRef.current) {
              onSelect(character, cardRef.current.getBoundingClientRect());
          }
      }
  };

  const isDrawn = isDrawnCheck(glyphData) && isAvailable;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !settings || !metrics || !glyphData || !isDrawn) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);

    const { scale, tx, ty } = calculateUnifiedTransform(glyphData.paths, PREVIEW_CANVAS_SIZE, settings.strokeThickness, {
        character,
        metrics
    });

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    renderPaths(ctx, glyphData.paths, {
        strokeThickness: settings.strokeThickness,
        contrast: settings.contrast,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
  }, [glyphData, settings, theme, isDrawn, character, metrics]);

  if (!settings) return null;

  const isCompact = variant === 'compact' || variant === 'overlay';
  const paddingClass = isCompact ? 'p-2' : 'p-2 sm:p-4';
  const baseContainerClasses = `relative rounded-lg ${paddingClass} flex flex-col items-center justify-between transition-all duration-200 aspect-square h-full group select-none overflow-hidden`;
  
  const isNonSpacingMark = character.glyphClass === 'mark' && (character.advWidth === 0 || character.advWidth === '0');
  const isSpacingMark = character.glyphClass === 'mark' && !isNonSpacingMark;
  const isCompositeTemplate = character.composite && !character.link && !character.position && !character.kern;

  // This class is used for the empty/dashed state to hint at the glyph type
  let typeBorderClass = "border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400";
  if (isNonSpacingMark) typeBorderClass = "border-amber-300 dark:border-amber-700 hover:border-amber-500 dark:hover:border-amber-500";
  else if (isSpacingMark) typeBorderClass = "border-sky-300 dark:border-sky-700 hover:border-sky-500 dark:hover:border-sky-500";

  let stateClasses = "";
  if (!isAvailable) {
      stateClasses = "bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 opacity-40 grayscale cursor-not-allowed";
  } else if (isSelected && isSelectionMode) {
      stateClasses = "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 border-transparent cursor-pointer";
  } else if (character.hidden) {
      stateClasses = `bg-gray-50 dark:bg-gray-900/40 border-2 border-dashed ${typeBorderClass} opacity-70 cursor-pointer`;
  } else if (!isDrawn) {
      stateClasses = `bg-white dark:bg-gray-800 border-2 border-dashed ${typeBorderClass} opacity-90 cursor-pointer`;
  } else if (!isManuallySet) { // State 1: Pending Review (suggestion)
      stateClasses = "bg-white dark:bg-gray-800 border-2 border-dashed border-blue-400 dark:border-blue-500 hover:border-blue-600 cursor-pointer";
  } else { // State 3: Manually Drawn or Accepted
      if (isConstructed) {
          // Confirmed Auto-Generated: Solid BLUE
      stateClasses = "bg-white dark:bg-gray-800 border-2 border-blue-400 dark:border-blue-500 hover:border-blue-600 cursor-pointer";
      } else {
          // Hand-Drawn: Solid border, respecting mark colors
          let completedTypeBorderClass = "border-gray-400 dark:border-gray-500 hover:border-gray-500 dark:hover:border-gray-400"; // Default: Solid Gray
          if (isNonSpacingMark) completedTypeBorderClass = "border-amber-400 dark:border-amber-600 hover:border-amber-500 dark:hover:border-amber-500"; // Solid Amber
          else if (isSpacingMark) completedTypeBorderClass = "border-sky-400 dark:border-sky-600 hover:border-sky-500 dark:hover:border-sky-500"; // Solid Sky Blue
          
          stateClasses = `bg-white dark:bg-gray-800 border-2 border-solid ${completedTypeBorderClass} cursor-pointer`;
      }
  }

  const showName = !!settings.showGlyphNames;
  const shouldShowNameBlock = !isDrawn || showName || settings.showUnicodeValues;

  const displayLabel = character.label || character.name;
  const labelLength = displayLabel.length;
  let ghostFontSizeClass: string;
  if (labelLength > 2) {
    ghostFontSizeClass = isCompact ? "text-sm sm:text-lg" : "text-xl sm:text-3xl";
  } else if (labelLength > 1) {
    ghostFontSizeClass = isCompact ? "text-lg sm:text-3xl" : "text-3xl sm:text-5xl";
  } else {
    ghostFontSizeClass = isCompact ? "text-2xl sm:text-4xl" : "text-4xl sm:text-6xl";
  }

  const ghostTextColor = !isAvailable 
    ? "text-gray-400 dark:text-gray-500" 
    : "text-gray-200 dark:text-gray-700 group-hover:text-gray-300 dark:group-hover:text-gray-600";

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={`${baseContainerClasses} ${stateClasses}`}
      title={disabledReason}
    >
      {/* Badge Priority: pos -> kern -> link -> composite */}
      {!isCompact && character.position && (
          <div className="absolute top-1 left-1 p-1 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-full shadow-sm z-10" title="Syllable (Positioned)">
             <PositioningIcon className="w-3 h-3" />
          </div>
      )}
      {!isCompact && character.kern && (
          <div className="absolute top-1 left-1 p-1 bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 rounded-full shadow-sm z-10" title="Kerning Pair">
             <KerningIcon className="w-3 h-3" />
          </div>
      )}
      {!isCompact && character.link && (
          <div className="absolute top-1 left-1 p-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full shadow-sm z-10" title="Linked Glyph">
             <LinkIcon className="w-3 h-3" />
          </div>
      )}
      {!isCompact && isCompositeTemplate && (
          <div className="absolute top-1 left-1 p-1 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded-full shadow-sm z-10" title="Composite Template">
             <PuzzleIcon className="w-3 h-3" />
          </div>
      )}

      {!isCompact && isSelectionMode && isAvailable && (
          <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10 ${isSelected ? 'bg-indigo-600 border-indigo-600 scale-110' : 'bg-white/80 dark:bg-gray-800/80 border-gray-400'}`}>
              {isSelected && <CheckCircleIcon className="w-4 h-4 text-white" />}
          </div>
      )}

      {isDrawn ? (
        <>
          <div className="w-full flex-1 min-h-0 flex items-center justify-center">
            <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE} className={`transition-transform duration-200 max-w-full max-h-full object-contain ${!isSelectionMode && isAvailable && !isCompact ? 'group-hover:scale-110' : ''}`}></canvas>
          </div>
          {!isCompact && shouldShowNameBlock && (
              <div className="text-center mt-1 sm:mt-2 flex-shrink-0">
                {showName && (
                    <p 
                    className={`${isCompact ? 'text-sm' : 'text-lg sm:text-2xl'} font-bold text-gray-900 dark:text-white truncate max-w-full`}
                    style={{
                        fontFamily: 'var(--guide-font-family)',
                        fontFeatureSettings: 'var(--guide-font-feature-settings)'
                    }}
                    >
                    {character.name}
                    </p>
                )}
                {settings.showUnicodeValues && character.unicode !== undefined && character.glyphClass !== 'virtual' && (
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</p>
                )}
              </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center flex-col">
            <span 
                className={`${ghostFontSizeClass} ${isAvailable ? "text-gray-200 dark:text-gray-700 group-hover:text-gray-300 dark:group-hover:text-gray-600" : "text-gray-400 dark:text-gray-500"} font-bold select-none transition-colors`}
                style={{
                  fontFamily: 'var(--guide-font-family)',
                  fontFeatureSettings: 'var(--guide-font-feature-settings)'
                }}
            >
                {displayLabel}
            </span>
             {!isCompact && settings.showUnicodeValues && character.unicode !== undefined && character.glyphClass !== 'virtual' && (
                <span className="absolute bottom-2 text-[10px] text-gray-300 dark:text-gray-600">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</span>
            )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CharacterCard);