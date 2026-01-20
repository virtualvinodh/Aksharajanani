import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Character, GlyphData, UnifiedRenderContext } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, getUnifiedPaths, calculateUnifiedTransform } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, CheckCircleIcon, LinkIcon, KerningIcon, PositioningIcon } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { isGlyphDrawn as isDrawnCheck } from '../utils/glyphUtils';

interface UnifiedCardProps {
  character: Character;
  onSelect: (character: Character, rect: DOMRect) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (character: Character) => void;
  variant?: 'default' | 'compact';
}

declare var unicodeName: any;

const UnifiedCard: React.FC<UnifiedCardProps> = ({ 
    character, onSelect, 
    isSelectionMode = false, isSelected = false, onToggleSelect,
    variant = 'default'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { settings, metrics } = useSettings();
  
  // Data Contexts
  const { glyphDataMap, version: glyphVersion } = useGlyphData();
  const { allCharsByName, characterSets, markAttachmentRules, positioningRules } = useProject();
  const { kerningMap } = useKerning();
  const { markPositioningMap } = usePositioning();
  const { state: rulesState } = useRules();
  const groups = rulesState.fontRules?.groups || {};

  // 1. Determine Availability
  // Virtual glyphs (Positioned/Kerned) require both components to be drawn to be "Available"
  const isAvailable = useMemo(() => {
    if (character.position) {
        const base = allCharsByName.get(character.position[0]);
        const mark = allCharsByName.get(character.position[1]);
        if (!base || !mark) return false;
        return isDrawnCheck(glyphDataMap.get(base.unicode!)) && isDrawnCheck(glyphDataMap.get(mark.unicode!));
    }
    if (character.kern) {
        const left = allCharsByName.get(character.kern[0]);
        const right = allCharsByName.get(character.kern[1]);
        if (!left || !right) return false;
        return isDrawnCheck(glyphDataMap.get(left.unicode!)) && isDrawnCheck(glyphDataMap.get(right.unicode!));
    }
    return true; // Standard glyphs are always available to open/draw
  }, [character, allCharsByName, glyphDataMap, glyphVersion]);

  // 2. Resolve Paths using the Unified Service
  const { paths, isDrawn } = useMemo(() => {
    const ctx: UnifiedRenderContext = {
        glyphDataMap,
        allCharsByName,
        markPositioningMap,
        kerningMap,
        characterSets: characterSets || [],
        groups,
        metrics: metrics || undefined,
        markAttachmentRules,
        strokeThickness: settings?.strokeThickness || 15,
        positioningRules
    };

    const resolvedPaths = getUnifiedPaths(character, ctx);
    
    // Check if the result has actual visual content
    const hasPaths = resolvedPaths.length > 0 && resolvedPaths.some(p => p.points.length > 0 || (p.segmentGroups && p.segmentGroups.length > 0));

    return { paths: resolvedPaths, isDrawn: hasPaths };
  }, [character, glyphDataMap, glyphVersion, allCharsByName, markPositioningMap, kerningMap, characterSets, groups, metrics, markAttachmentRules, positioningRules, settings?.strokeThickness]);

  // 3. Interaction Logic
  const handleClick = (e: React.MouseEvent) => {
      if (!isAvailable) return;
      
      if (isSelectionMode || e.ctrlKey || e.metaKey || e.shiftKey) {
          e.stopPropagation();
          onToggleSelect?.(character);
          return;
      }

      if (cardRef.current) {
          onSelect(character, cardRef.current.getBoundingClientRect());
      }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !settings || !isDrawn) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);

    // Use the Universal Fitter service
    const { scale, tx, ty } = calculateUnifiedTransform(paths, PREVIEW_CANVAS_SIZE, settings.strokeThickness, {
        character,
        metrics: metrics || undefined
    });

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    renderPaths(ctx, paths, {
        strokeThickness: settings.strokeThickness,
        contrast: settings.contrast,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
  }, [paths, settings, theme, isDrawn, character, metrics]);

  if (!settings) return null;

  const isCompact = variant === 'compact';
  const paddingClass = isCompact ? 'p-2' : 'p-2 sm:p-4';
  const baseContainerClasses = `relative rounded-lg ${paddingClass} flex flex-col items-center justify-between transition-all duration-200 aspect-square h-full group select-none overflow-hidden`;
  
  let stateClasses = "";
  if (!isAvailable) {
      stateClasses = "bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 opacity-40 grayscale cursor-not-allowed";
  } else if (isSelected) {
      stateClasses = "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 border-transparent cursor-pointer";
  } else if (character.hidden) {
      stateClasses = "bg-gray-50 dark:bg-gray-900/40 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-500 opacity-70 cursor-pointer";
  } else if (!isDrawn) {
      stateClasses = "bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-indigo-500 hover:border-solid opacity-90 cursor-pointer";
  } else {
      stateClasses = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500 cursor-pointer";
  }

  const nameLength = character.name.length;
  let ghostFontSizeClass = "text-4xl sm:text-6xl";
  if (nameLength > 2) ghostFontSizeClass = "text-xl sm:text-3xl";
  else if (nameLength > 1) ghostFontSizeClass = "text-3xl sm:text-5xl";

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={`${baseContainerClasses} ${stateClasses}`}
    >
      {/* Badge: Syllable/Positioning */}
      {character.position && (
          <div className="absolute top-1 left-1 p-1 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-full shadow-sm z-10" title="Syllable (Positioned)">
             <PositioningIcon className="w-3 h-3" />
          </div>
      )}

      {/* Badge: Kerning Pair */}
      {character.kern && (
          <div className="absolute top-1 left-1 p-1 bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 rounded-full shadow-sm z-10" title="Kerning Pair">
             <KerningIcon className="w-3 h-3" />
          </div>
      )}

      {/* Badge: Linked Drawing */}
      {character.link && !character.position && (
          <div className="absolute top-1 left-1 p-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full shadow-sm z-10" title="Linked Component">
             <LinkIcon className="w-3 h-3" />
          </div>
      )}

      {isSelectionMode && isAvailable && (
          <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10 ${isSelected ? 'bg-indigo-600 border-indigo-600 scale-110' : 'bg-white/80 dark:bg-gray-800/80 border-gray-400'}`}>
              {isSelected && <CheckCircleIcon className="w-4 h-4 text-white" />}
          </div>
      )}

      {isDrawn ? (
        <>
          <div className="w-full flex-1 min-h-0 flex items-center justify-center">
            <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE} className={`transition-transform duration-200 max-w-full max-h-full object-contain ${(!isSelectionMode && isAvailable) ? 'group-hover:scale-110' : ''}`}></canvas>
          </div>
          {(!!settings.showGlyphNames || settings.showUnicodeValues) && (
              <div className="text-center mt-1 sm:mt-2 flex-shrink-0">
                {!!settings.showGlyphNames && (
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
                {settings.showUnicodeValues && character.unicode !== undefined && (
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</p>
                )}
              </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center flex-col">
            <span 
                className={`${ghostFontSizeClass} text-gray-200 dark:text-gray-700 font-bold select-none transition-colors ${isAvailable ? 'group-hover:text-gray-300 dark:group-hover:text-gray-600' : ''}`}
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

export default React.memo(UnifiedCard);