
import React, { useRef, useEffect } from 'react';
import { Character, GlyphData } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { TILE_CANVAS_SIZE, DRAWING_CANVAS_SIZE } from '../constants';
import { isGlyphDrawn } from '../utils/glyphUtils';

interface GlyphTileProps {
  character: Character;
  glyphData: GlyphData | undefined;
  strokeThickness: number;
  isDraggable?: boolean;
}

const GlyphTile: React.FC<GlyphTileProps> = ({ character, glyphData, strokeThickness, isDraggable = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, TILE_CANVAS_SIZE, TILE_CANVAS_SIZE);

    if (!isGlyphDrawn(glyphData)) {
        return;
    }

    const scale = TILE_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
    
    ctx.save();
    ctx.scale(scale, scale);
    renderPaths(ctx, glyphData!.paths, {
        strokeThickness,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
    
  }, [glyphData, strokeThickness, theme]);

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
