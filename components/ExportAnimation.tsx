
import React, { useEffect, useMemo, useRef } from 'react';
import { GlyphData, AppSettings } from '../types';
import { renderPaths } from '../services/glyphRenderService';
import { useTheme } from '../contexts/ThemeContext';
import { DRAWING_CANVAS_SIZE, ExportIcon } from '../constants';
import { isGlyphDrawn } from '../utils/glyphUtils';

interface ExportAnimationProps {
  isOpen: boolean;
  onComplete: () => void;
  glyphDataMap: Map<number, GlyphData>;
  settings: AppSettings;
  glyphVersion: number;
}

const GLYPH_COUNT = 5;
const ANIMATION_DURATION = 2000; // ms

const ExportAnimation: React.FC<ExportAnimationProps> = ({ isOpen, onComplete, glyphDataMap, settings, glyphVersion }) => {
  const timeoutRef = useRef<number | null>(null);

  const sampleGlyphs = useMemo(() => {
    const drawnGlyphs = Array.from(glyphDataMap.entries())
      .filter(([, data]) => isGlyphDrawn(data))
      .map(([, data]) => data);

    if (drawnGlyphs.length === 0) return [];

    // Shuffle and pick
    return drawnGlyphs.sort(() => 0.5 - Math.random()).slice(0, GLYPH_COUNT);
  }, [glyphDataMap, glyphVersion]);

  useEffect(() => {
    if (isOpen) {
      timeoutRef.current = window.setTimeout(onComplete, ANIMATION_DURATION);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isOpen, onComplete]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/80 z-[100] flex items-center justify-center overflow-hidden" aria-hidden="true">
      {sampleGlyphs.map((glyphData, index) => (
        <GlyphCanvas
          key={index}
          index={index}
          glyphData={glyphData}
          settings={settings}
        />
      ))}
      <div className="export-icon-container">
        <div className="text-white">
          <ExportIcon className="w-32 h-32" />
        </div>
      </div>
    </div>
  );
};

const GlyphCanvas: React.FC<{ index: number, glyphData: GlyphData, settings: AppSettings }> = ({ index, glyphData, settings }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const GLYPH_CANVAS_SIZE = 200;

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas || !settings) return;

        ctx.clearRect(0, 0, GLYPH_CANVAS_SIZE, GLYPH_CANVAS_SIZE);

        const scale = GLYPH_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
        
        ctx.save();
        ctx.scale(scale, scale);
        renderPaths(ctx, glyphData.paths, {
            strokeThickness: settings.strokeThickness,
            color: '#FFFFFF'
        });
        ctx.restore();
    }, [glyphData, settings]);
  
    return (
        <canvas
            ref={canvasRef}
            width={GLYPH_CANVAS_SIZE}
            height={GLYPH_CANVAS_SIZE}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ animation: `fly-in-${index + 1} ${ANIMATION_DURATION}ms cubic-bezier(0.5, 0, 1, 1) forwards` }}
        />
    );
}

export default React.memo(ExportAnimation);
