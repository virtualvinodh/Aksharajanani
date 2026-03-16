
import React, { useRef, useEffect, useMemo } from 'react';
import { Character, GlyphData } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, calculateUnifiedTransform, getUnifiedPaths } from '../services/glyphRenderService';
import { TILE_CANVAS_SIZE } from '../constants';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { useSettings } from '../contexts/SettingsContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';

interface GlyphTileProps {
  character: Character;
  glyphData?: GlyphData;
  strokeThickness?: number;
  isDraggable?: boolean;
}

const GlyphTile: React.FC<GlyphTileProps> = ({ 
  character, 
  glyphData: propGlyphData, 
  strokeThickness: propStrokeThickness, 
  isDraggable = false 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { metrics, allCharsByName, characterSets } = useProject();
  const { glyphDataMap } = useGlyphData();
  const { kerningMap } = useKerning();
  const { markPositioningMap } = usePositioning();
  const { groups } = useRules();

  const strokeThickness = propStrokeThickness ?? settings.strokeThickness;

  // Resolve glyph data if not provided (Unified logic)
  const resolvedGlyphData = useMemo(() => {
    if (propGlyphData) return propGlyphData;
    
    const resolvedPaths = getUnifiedPaths(character, {
      glyphDataMap,
      allCharsByName,
      markPositioningMap,
      kerningMap,
      characterSets,
      groups,
      metrics
    });

    return resolvedPaths.length > 0 ? { paths: resolvedPaths } : undefined;
  }, [propGlyphData, character, glyphDataMap, allCharsByName, markPositioningMap, kerningMap, characterSets, groups, metrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, TILE_CANVAS_SIZE, TILE_CANVAS_SIZE);

    if (!isGlyphDrawn(resolvedGlyphData)) {
        return;
    }

    // Use calculateUnifiedTransform for auto-fitting and centering
    const { scale, tx, ty } = calculateUnifiedTransform(
        resolvedGlyphData.paths, 
        TILE_CANVAS_SIZE, 
        strokeThickness, 
        {
            character,
            metrics,
            contrast: settings.contrast
        }
    );
    
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    
    renderPaths(ctx, resolvedGlyphData.paths, {
        strokeThickness,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    
    ctx.restore();
    
  }, [resolvedGlyphData, strokeThickness, theme, character, metrics, settings.contrast]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/plain", character.name);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
      title={character.name}
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-1 flex flex-col items-center justify-center transition-all duration-200 aspect-square ${isDraggable ? 'cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500' : ''}`}
    >
      <canvas ref={canvasRef} width={TILE_CANVAS_SIZE} height={TILE_CANVAS_SIZE}></canvas>
      <p 
        className="text-sm text-gray-600 dark:text-gray-400 truncate w-full text-center mt-1"
        style={{
          fontFamily: 'var(--guide-font-family)',
          fontFeatureSettings: 'var(--guide-font-feature-settings)'
        }}
      >
        {character.label || character.name}
      </p>
    </div>
  );
};

export default React.memo(GlyphTile);
