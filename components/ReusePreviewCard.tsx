
import React, { useRef, useEffect, useMemo } from 'react';
import { Character, GlyphData, MarkPositioningMap, Path } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, DRAWING_CANVAS_SIZE } from '../constants';

interface ReusePreviewCardProps {
  baseChar: Character;
  markChar: Character;
  onClick: () => void;
  glyphDataMap: Map<number, GlyphData>;
  strokeThickness: number;
  markPositioningMap: MarkPositioningMap;
  glyphVersion: number;
}

const ReusePreviewCard: React.FC<ReusePreviewCardProps> = ({ baseChar, markChar, onClick, glyphDataMap, strokeThickness, markPositioningMap, glyphVersion }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  const ligatureGlyph = useMemo(() => {
    const basePaths = glyphDataMap.get(baseChar.unicode)?.paths ?? [];
    const markPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
    const offset = markPositioningMap.get(`${baseChar.unicode}-${markChar.unicode}`);
    
    let combinedPaths = [...basePaths];
    if (offset) {
        const transformedMarkPaths = JSON.parse(JSON.stringify(markPaths)).map((p: Path) => {
            p.points = p.points.map(pt => ({ x: pt.x + offset!.x, y: pt.y + offset!.y }));
            return p;
        });
        combinedPaths.push(...transformedMarkPaths);
    } else {
        combinedPaths.push(...markPaths);
    }
    return { paths: combinedPaths };
  }, [baseChar, markChar, glyphDataMap, markPositioningMap, glyphVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);
    
    const pathsToDraw = ligatureGlyph.paths;
    if (pathsToDraw.length === 0) return;

    const scale = PREVIEW_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
    
    ctx.save();
    ctx.scale(scale, scale);
    renderPaths(ctx, pathsToDraw, {
        strokeThickness,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
  }, [ligatureGlyph, strokeThickness, theme]);

  return (
    <div onClick={onClick} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 flex flex-col items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-indigo-500 cursor-pointer transition-all duration-200 aspect-square">
        <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE}></canvas>
        <p className="text-center mt-1 text-sm font-bold text-gray-700 dark:text-gray-300" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
            {markChar.name}
        </p>
    </div>
  );
};

export default React.memo(ReusePreviewCard);
