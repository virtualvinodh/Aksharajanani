
import React, { useRef, useEffect, useState } from 'react';
import { Character } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, DRAWING_CANVAS_SIZE } from '../constants';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { isGlyphDrawn } from '../utils/glyphUtils';

interface CharacterCardProps {
  character: Character;
  onSelect: (character: Character, rect: DOMRect) => void;
}

declare var unicodeName: any;

const CharacterCard: React.FC<CharacterCardProps> = ({ character, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { glyphDataMap } = useGlyphData();
  const { settings } = useSettings();
  
  const glyphData = glyphDataMap.get(character.unicode);

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
        // Format to Title Case for better readability
        const titleCaseName = name.toLowerCase().split(' ').map((s: string) => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');
        setTooltip({ visible: true, name: titleCaseName });
      }
    } catch (e) {
      // This library can throw for unassigned codepoints, which is expected.
      // We can safely ignore the error and not show a tooltip.
    }
  };

  const hideTooltip = () => {
    setTooltip({ visible: false, name: '' });
  };

  const handleMouseEnter = () => {
    showTooltip();
  };

  const handleMouseLeave = () => {
    hideTooltip();
  };

  const handleTouchStart = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    
    longPressTimeout.current = window.setTimeout(() => {
      showTooltip();
      longPressTimeout.current = null; // Mark as fired
    }, 500); // 500ms for long press
  };

  const handleTouchEnd = () => {
    if (longPressTimeout.current) {
      // It was a short tap, not a long press. Clear the timer.
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    // Whether it was a short tap or a long press, hide the tooltip on finger lift.
    hideTooltip();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !settings) return;

    ctx.clearRect(0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);

    if (!isGlyphDrawn(glyphData)) {
        return;
    }

    const scale = PREVIEW_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
    
    ctx.save();
    ctx.scale(scale, scale);
    renderPaths(ctx, glyphData!.paths, {
        strokeThickness: settings.strokeThickness,
        contrast: settings.contrast,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
    
  }, [glyphData, settings, theme]);

  if (!settings) return null;

  return (
    <div
      ref={cardRef}
      onClick={() => cardRef.current && onSelect(character, cardRef.current.getBoundingClientRect())}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-between shadow-sm hover:shadow-md hover:-translate-y-1 cursor-pointer transition-all duration-200 aspect-square group"
    >
      {tooltip.visible && (
        <div className="absolute top-full mb-2 w-max max-w-xs bg-black text-white text-xs rounded py-1 px-2 z-50 pointer-events-none transform -translate-x-1/2 left-1/2 opacity-90 dark:bg-gray-700 shadow-lg">
          {tooltip.name}
          <svg className="absolute text-black h-2 w-full left-0 top-full dark:text-gray-700" x="0px" y="0px" viewBox="0 0 255 255">
             <polygon className="fill-current" points="0,0 0,0 255,0"/>
          </svg>
        </div>
      )}
      <div className="w-full h-full flex items-center justify-center">
        <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE} className="group-hover:scale-110 transition-transform duration-300 ease-out"></canvas>
      </div>
      <div className="text-center mt-2">
        <p 
          className="text-2xl font-bold text-gray-900 dark:text-white drop-shadow-sm"
          style={{
            fontFamily: 'var(--guide-font-family)',
            fontFeatureSettings: 'var(--guide-font-feature-settings)'
          }}
        >
          {character.name}
          {character.link && <span className="ml-1 opacity-60" aria-label="Linked Glyph">🔗</span>}
        </p>
        {settings.editorMode === 'advanced' && character.unicode !== undefined && (
            <p className="text-xs text-gray-500 dark:text-gray-400">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</p>
        )}
      </div>
    </div>
  );
};

export default React.memo(CharacterCard);
