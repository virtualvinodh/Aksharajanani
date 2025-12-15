
import React, { useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Character, GlyphData, Point, FontMetrics, MarkAttachmentRules, CharacterSet } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { renderPaths, calculateDefaultMarkOffset, getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';
import { LeftArrowIcon, RightArrowIcon, FoldIcon, CloseIcon } from '../../constants';
import { VEC } from '../../utils/vectorUtils';

interface SiblingPair {
    base: Character;
    mark: Character;
    ligature: Character; 
}

interface ClassPreviewStripProps {
    siblings: SiblingPair[];
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    anchorDelta: Point; // The manual deviation from the default anchor snap (calculated in Editor)
    isLinked: boolean;
    orientation?: 'horizontal' | 'vertical';
    onSelectPair: (pair: SiblingPair) => void;
    
    // Dependencies for anchor calculation
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    
    // Lifted State
    isExpanded: boolean;
    setIsExpanded: (expanded: boolean) => void;
}

const DRAWING_CANVAS_SIZE = 1000;

const SiblingThumbnail: React.FC<{
    pair: SiblingPair;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    anchorDelta: Point;
    onClick: () => void;
    size?: number;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = React.memo(({ pair, glyphDataMap, strokeThickness, anchorDelta, onClick, size = 80, metrics, markAttachmentRules, characterSets, groups }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    const baseGlyph = glyphDataMap.get(pair.base.unicode);
    const markGlyph = glyphDataMap.get(pair.mark.unicode);

    // Memoize the default anchor offset for this specific sibling pair.
    const defaultAnchorOffset = useMemo(() => {
        if (!baseGlyph || !markGlyph) return { x: 0, y: 0 };
        
        const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, strokeThickness);
        const markBbox = getAccurateGlyphBBox(markGlyph.paths, strokeThickness);
        
        return calculateDefaultMarkOffset(
            pair.base, 
            pair.mark, 
            baseBbox, 
            markBbox, 
            markAttachmentRules, 
            metrics, 
            characterSets, 
            false, 
            groups
        );
    }, [pair, baseGlyph, markGlyph, strokeThickness, markAttachmentRules, metrics, characterSets, groups]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, size, size);
        
        if (!baseGlyph || !markGlyph) return;

        // --- Dynamic Sizing Logic ---
        const finalOffset = VEC.add(defaultAnchorOffset, anchorDelta);
        const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, strokeThickness);
        const markBbox = getAccurateGlyphBBox(markGlyph.paths, strokeThickness);

        let contentMinX = 0, contentMinY = 0, contentMaxX = DRAWING_CANVAS_SIZE, contentMaxY = DRAWING_CANVAS_SIZE;

        if (baseBbox && markBbox) {
             const mMinX = markBbox.x + finalOffset.x;
             const mMinY = markBbox.y + finalOffset.y;
             
             contentMinX = Math.min(baseBbox.x, mMinX);
             contentMinY = Math.min(baseBbox.y, mMinY);
             contentMaxX = Math.max(baseBbox.x + baseBbox.width, mMinX + markBbox.width);
             contentMaxY = Math.max(baseBbox.y + baseBbox.height, mMinY + markBbox.height);
        } else if (baseBbox) {
             contentMinX = baseBbox.x;
             contentMinY = baseBbox.y;
             contentMaxX = baseBbox.x + baseBbox.width;
             contentMaxY = baseBbox.y + baseBbox.height;
        }

        const contentWidth = contentMaxX - contentMinX;
        const contentHeight = contentMaxY - contentMinY;
        const padding = 100; // Font units padding
        
        // Calculate fit scale
        const fitScaleX = size / (contentWidth + padding * 2);
        const fitScaleY = size / (contentHeight + padding * 2);
        const standardScale = size / DRAWING_CANVAS_SIZE;
        
        // Use fit scale, but cap at standard scale to prevent over-zooming on small glyphs
        const scale = Math.min(fitScaleX, fitScaleY, standardScale);

        // Center the content bounds in the canvas
        const contentCenterX = contentMinX + contentWidth / 2;
        const contentCenterY = contentMinY + contentHeight / 2;
        const canvasCenter = size / 2;

        ctx.save();
        // Move to canvas center, apply scale, then move content center to origin
        ctx.translate(canvasCenter, canvasCenter);
        ctx.scale(scale, scale);
        ctx.translate(-contentCenterX, -contentCenterY);

        // 1. Draw Base (Fixed)
        renderPaths(ctx, baseGlyph.paths, { strokeThickness, color: theme === 'dark' ? '#64748B' : '#94A3B8' }); 

        // 2. Draw Mark (Relative)
        ctx.save();
        ctx.translate(finalOffset.x, finalOffset.y);
        renderPaths(ctx, markGlyph.paths, { strokeThickness, color: theme === 'dark' ? '#818CF8' : '#4F46E5' }); 
        ctx.restore();

        ctx.restore();

    }, [pair, glyphDataMap, strokeThickness, defaultAnchorOffset, anchorDelta, theme, size, baseGlyph, markGlyph]);

    return (
        <div 
            onClick={onClick}
            style={{ width: size }}
            className="flex-shrink-0 flex flex-col items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all hover:-translate-y-0.5 aspect-square"
            title={`Edit ${pair.base.name} + ${pair.mark.name}`}
        >
            <canvas ref={canvasRef} width={size} height={size} className="opacity-90" />
        </div>
    );
});

const ClassPreviewStrip: React.FC<ClassPreviewStripProps> = ({ 
    siblings, glyphDataMap, strokeThickness, anchorDelta, isLinked, onSelectPair,
    metrics, markAttachmentRules, characterSets, groups,
    isExpanded, setIsExpanded
}) => {
    const { visibility, handleScroll, scrollRef, checkVisibility } = useHorizontalScroll();

    useEffect(() => {
        if (!isExpanded) {
            checkVisibility();
            const timer = setTimeout(checkVisibility, 100);
            return () => clearTimeout(timer);
        }
    }, [siblings, checkVisibility, isExpanded]);

    if (!isLinked || siblings.length === 0) return null;
    
    // Shared props for thumbnails
    const thumbProps = {
        glyphDataMap,
        strokeThickness,
        anchorDelta, 
        metrics,
        markAttachmentRules,
        characterSets,
        groups
    };
    
    // Render the expanded view into a Portal to ensure it sits on top of everything
    // Increased z-index to 200 and made background fully opaque to hide underlying controls
    const expandedView = isExpanded ? (
         <div className="fixed inset-0 z-[200] bg-white dark:bg-gray-900 flex flex-col animate-fade-in-up">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md flex-shrink-0">
                 <div className="flex items-center gap-4">
                     <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                        <FoldIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400 rotate-180" />
                     </div>
                     <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Class Sync Preview</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {siblings.length} items syncing with current position
                        </p>
                     </div>
                 </div>
                 <button 
                    onClick={() => setIsExpanded(false)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 transition-colors"
                >
                    <CloseIcon className="w-8 h-8" />
                </button>
            </div>
            <div className="flex-grow overflow-y-auto p-4">
                 <div className="flex flex-wrap justify-center gap-3">
                    {siblings.map((pair) => (
                        <SiblingThumbnail 
                            key={`expanded-${pair.base.unicode}-${pair.mark.unicode}`} 
                            pair={pair} 
                            {...thumbProps}
                            onClick={() => {
                                setIsExpanded(false);
                                onSelectPair(pair);
                            }}
                            size={160}
                        />
                    ))}
                 </div>
            </div>
         </div>
    ) : null;

    return (
        <>
            {expandedView && createPortal(expandedView, document.body)}

            <div className="w-full flex flex-row border-t bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-2 animate-fade-in-up relative items-center transition-all duration-300">
                 
                 {/* Control Column */}
                 <div className="flex flex-col items-center justify-center pr-3 border-r border-gray-300 dark:border-gray-600 mr-2 gap-2 flex-shrink-0 self-stretch">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center leading-tight">
                        Syncing<br/>
                        <span className="text-indigo-600 dark:text-indigo-400 text-xs">{siblings.length}</span>
                    </span>
                    <button 
                        onClick={() => setIsExpanded(true)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"
                        title="Expand to Fullscreen"
                    >
                        <FoldIcon className="w-4 h-4 rotate-180" />
                    </button>
                 </div>

                 {/* Collapsed Scroll View */}
                 <div className="relative flex-grow overflow-hidden flex items-center">
                     {visibility.left && (
                        <button
                            onClick={() => handleScroll('left')}
                            className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-8 bg-gradient-to-r from-gray-50 via-gray-50/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
                        >
                            <div className="p-0.5 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                <LeftArrowIcon className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                            </div>
                        </button>
                    )}

                    <div ref={scrollRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center scroll-smooth px-1 w-full">
                        {siblings.map((pair) => (
                            <SiblingThumbnail 
                                key={`${pair.base.unicode}-${pair.mark.unicode}`} 
                                pair={pair} 
                                {...thumbProps}
                                onClick={() => onSelectPair(pair)}
                                size={80}
                            />
                        ))}
                    </div>

                    {visibility.right && (
                        <button
                            onClick={() => handleScroll('right')}
                            className="absolute right-0 top-0 bottom-0 z-20 flex items-center justify-center w-8 bg-gradient-to-l from-gray-50 via-gray-50/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
                        >
                            <div className="p-0.5 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                <RightArrowIcon className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                            </div>
                        </button>
                    )}
                 </div>
            </div>
        </>
    );
};

export default React.memo(ClassPreviewStrip);
