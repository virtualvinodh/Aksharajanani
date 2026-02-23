import React, { useRef, useEffect, forwardRef, useMemo } from 'react';
import { Character, GlyphData, Path, Point, MarkAttachmentRules, MarkPositioningMap, FontMetrics, CharacterSet, PositioningRules } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { renderPaths, getAccurateGlyphBBox } from '../services/glyphRenderService';
import { calculateDefaultMarkOffset } from '../services/positioningHeuristicsService';
import { PREVIEW_CANVAS_SIZE, DRAWING_CANVAS_SIZE, CheckCircleIcon } from '../constants';
import { VEC } from '../utils/vectorUtils';
import { useSettings } from '../contexts/SettingsContext';
import { deepClone } from '../utils/cloneUtils';
import { expandMembers } from '../services/groupExpansionService';

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
  positioningRules: PositioningRules[] | null;
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
  positioningRules,
  markPositioningMap,
  characterSets,
  glyphVersion,
  groups,
  hideTick = false
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const { t } = useLocale();
  const { metrics } = useSettings();

  const movementConstraint = useMemo(() => {
    if (!positioningRules) return 'none';
    const rule = positioningRules.find(r => 
        expandMembers(r.base, groups, characterSets).includes(baseChar.name) && 
        expandMembers(r.mark, groups, characterSets).includes(markChar.name)
    );
    return (rule && (rule.movement === 'horizontal' || rule.movement === 'vertical')) ? rule.movement : 'none';
  }, [positioningRules, baseChar.name, markChar.name, groups, characterSets]);

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
                offset = calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups, movementConstraint);
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

    // Calculate BBox for auto-fitting
    const bbox = getAccurateGlyphBBox(pathsToDraw, strokeThickness);
    
    // Default standard scale
    const standardScale = PREVIEW_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
    let scale = standardScale;

    if (bbox) {
        const PADDING = 10;
        const availableWidth = PREVIEW_CANVAS_SIZE - (PADDING * 2);
        const availableHeight = PREVIEW_CANVAS_SIZE - (PADDING * 2);

        // Determine if we need to shrink to fit
        if (bbox.width > 0 && bbox.height > 0) {
            const fitScaleX = availableWidth / bbox.width;
            const fitScaleY = availableHeight / bbox.height;
            const fitScale = Math.min(fitScaleX, fitScaleY);
            
            // Cap at standard scale (don't zoom in for tiny glyphs), but allow shrinking for large ones
            scale = Math.min(standardScale, fitScale);
        }
        
        // Center alignment: Move canvas center to (0,0), scale, then move glyph center to (0,0)
        const glyphCenterX = bbox.x + bbox.width / 2;
        const glyphCenterY = bbox.y + bbox.height / 2;
        const canvasCenter = PREVIEW_CANVAS_SIZE / 2;
        
        ctx.save();
        ctx.translate(canvasCenter, canvasCenter);
        ctx.scale(scale, scale);
        ctx.translate(-glyphCenterX, -glyphCenterY);
    } else {
        ctx.save();
        ctx.scale(scale, scale);
    }

    renderPaths(ctx, pathsToDraw, {
        strokeThickness,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
  }, [baseChar, markChar, ligature, glyphDataMap, strokeThickness, theme, isPositioned, markAttachmentRules, markPositioningMap, metrics, characterSets, glyphVersion, groups, movementConstraint]);
  
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
      stateClasses = "bg-white dark:bg-gray-800 border-2 border-dashed border-blue-400 dark:border-blue-500 hover:border-blue-600 cursor-pointer";
  }

  const status = isPositioned ? 'positioned' : 'review-required';

  return (
    <div 
      ref={ref} 
      onClick={canEdit ? onClick : undefined} 
      className={`${baseContainerClasses} ${cursorClass} ${stateClasses}`}
      data-tour={`combo-card-${ligature.name}`}
      data-status={status}
    >
      {!isPositioned && canEdit && !hideTick && (
        <button
          onClick={handleConfirmClick}
          title={t('markAsPositioned')}
          data-tour={`accept-pos-${ligature.name}`}
          className="absolute top-1 right-1 z-10 p-1 bg-white dark:bg-gray-700 rounded-full text-gray-400 hover:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors border border-gray-200 dark:border-gray-600"
        >
          <CheckCircleIcon className="w-5 h-5" />
        </button>
      )}
      <div className="w-full flex-1 min-h-0 flex items-center justify-center">
        <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE} className="transition-transform duration-200 max-w-full max-h-full object-contain group-hover:scale-110"></canvas>
      </div>
    </div>
  );
});

export default React.memo(CombinationCard);