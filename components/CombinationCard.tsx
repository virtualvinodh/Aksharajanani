
import React, { useRef, useEffect, forwardRef } from 'react';
import { Character, GlyphData, Path, Point, MarkAttachmentRules, MarkPositioningMap, FontMetrics, CharacterSet } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox, calculateDefaultMarkOffset } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, DRAWING_CANVAS_SIZE, CheckCircleIcon } from '../constants';
import { VEC } from '../utils/vectorUtils';
import { useSettings } from '../contexts/SettingsContext';

interface CombinationCardProps {
  baseChar: Character;
  markChar: Character;
  ligature: Character;
  isPositioned: boolean;
  canEdit: boolean;
  onClick: () => void;
  onConfirmPosition: () => void;
  glyphDataMap: Map<number, GlyphData>;
  strokeThickness: number;
  markAttachmentRules: MarkAttachmentRules | null;
  markPositioningMap?: MarkPositioningMap;
  characterSets: CharacterSet[];
  glyphVersion: number;
}


const CombinationCard = forwardRef<HTMLDivElement, CombinationCardProps>(({
  baseChar,
  markChar,
  ligature,
  isPositioned,
  canEdit,
  onClick,
  onConfirmPosition,
  glyphDataMap,
  strokeThickness,
  markAttachmentRules,
  markPositioningMap,
  characterSets,
  glyphVersion
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const { metrics } = useSettings();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !metrics) return;

    ctx.clearRect(0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);

    const baseGlyph = glyphDataMap.get(baseChar.unicode);
    const markGlyph = glyphDataMap.get(markChar.unicode);
    const ligatureGlyph = glyphDataMap.get(ligature.unicode);

    const pathsToDraw: Path[] = [];
    
    if (isPositioned && ligatureGlyph && ligatureGlyph.paths.length > 0) {
        // If the ligature has been saved, its glyph data is the source of truth
        pathsToDraw.push(...ligatureGlyph.paths);
    } else {
        // Otherwise, show the base and mark with a calculated default position
        if (baseGlyph) pathsToDraw.push(...baseGlyph.paths);

        if (markGlyph) {
            const key = `${baseChar.unicode}-${markChar.unicode}`;
            let offset: Point | undefined | null = markPositioningMap?.get(key);

            if (!offset) {
                const baseBbox = getAccurateGlyphBBox(baseGlyph?.paths ?? [], strokeThickness);
                const markBbox = getAccurateGlyphBBox(markGlyph.paths, strokeThickness);
                offset = calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets);
            }
            
            const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths));
            if (offset) {
                 transformedMarkPaths.forEach((p: Path) => {
                    p.points = p.points.map(pt => ({ x: pt.x + offset!.x, y: pt.y + offset!.y }));
                    if (p.segmentGroups) {
                        p.segmentGroups = p.segmentGroups.map(group => group.map(seg => ({
                            ...seg,
                            point: { x: seg.point.x + offset!.x, y: seg.point.y + offset!.y }
                        })));
                    }
                });
            }
            pathsToDraw.push(...transformedMarkPaths);
        }
    }

    if (pathsToDraw.length === 0) return;

    const scale = PREVIEW_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
    
    ctx.save();
    ctx.scale(scale, scale);
    renderPaths(ctx, pathsToDraw, {
        strokeThickness,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
  }, [baseChar, markChar, ligature, glyphDataMap, strokeThickness, theme, isPositioned, markAttachmentRules, markPositioningMap, metrics, characterSets, glyphVersion]);
  
  const handleConfirmClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConfirmPosition();
  };

  const cardClasses = `relative border-2 rounded-lg p-2 flex flex-col items-center justify-between transition-all duration-200 aspect-square ${
    canEdit ? 'cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500' : 'opacity-50 cursor-not-allowed'
  } ${
    isPositioned ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:border-indigo-500'
  }`;

  return (
    <div ref={ref} onClick={canEdit ? onClick : undefined} className={cardClasses}>
      {!isPositioned && canEdit && (
        <button
          onClick={handleConfirmClick}
          title="Mark as positioned"
          className="absolute top-1 right-1 z-10 p-1 bg-white dark:bg-gray-700 rounded-full text-gray-400 hover:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
        >
          <CheckCircleIcon className="w-5 h-5" />
        </button>
      )}
      <div className="w-full h-full flex items-center justify-center">
        <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE}></canvas>
      </div>
      <div className="text-center mt-2 h-8 flex items-center justify-center">
        <p className="text-lg font-bold text-gray-700 dark:text-gray-300" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
          {ligature.name}
        </p>
      </div>
    </div>
  );
});

export default React.memo(CombinationCard);
