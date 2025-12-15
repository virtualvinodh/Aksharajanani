
import React, { useRef, useEffect, forwardRef } from 'react';
import { Character, GlyphData, Path, Point, MarkAttachmentRules, MarkPositioningMap, FontMetrics, CharacterSet } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox, calculateDefaultMarkOffset } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, DRAWING_CANVAS_SIZE, CheckCircleIcon } from '../constants';
import { VEC } from '../utils/vectorUtils';
import { useSettings } from '../contexts/SettingsContext';
import { deepClone } from '../utils/cloneUtils';

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
  groups: Record<string, string[]>;
  hideTick?: boolean;
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
  glyphVersion,
  groups,
  hideTick = false
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
                offset = calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups);
            }
            
            const transformedMarkPaths = deepClone(markGlyph.paths);
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
  }, [baseChar, markChar, ligature, glyphDataMap, strokeThickness, theme, isPositioned, markAttachmentRules, markPositioningMap, metrics, characterSets, glyphVersion, groups]);
  
  const handleConfirmClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConfirmPosition();
  };

  const baseContainerClasses = "relative rounded-lg p-2 sm:p-4 flex flex-col items-center justify-between transition-all duration-200 aspect-square h-full group select-none";
  const cursorClass = canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed';
  
  let stateClasses = "";
  if (isPositioned) {
      stateClasses = "bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-200 dark:border-indigo-700";
  } else {
      stateClasses = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500";
  }

  return (
    <div ref={ref} onClick={canEdit ? onClick : undefined} className={`${baseContainerClasses} ${cursorClass} ${stateClasses}`}>
      {!isPositioned && canEdit && !hideTick && (
        <button
          onClick={handleConfirmClick}
          title="Mark as positioned"
          className="absolute top-1 right-1 z-10 p-1 bg-white dark:bg-gray-700 rounded-full text-gray-400 hover:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors border border-gray-200 dark:border-gray-600"
        >
          <CheckCircleIcon className="w-5 h-5" />
        </button>
      )}
      <div className="w-full flex-1 min-h-0 flex items-center justify-center">
        <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE} className="transition-transform duration-200 max-w-full max-h-full object-contain group-hover:scale-110"></canvas>
      </div>
      <div className="text-center mt-1 sm:mt-2 flex-shrink-0">
        <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
          {ligature.name}
        </p>
      </div>
    </div>
  );
});

export default React.memo(CombinationCard);
