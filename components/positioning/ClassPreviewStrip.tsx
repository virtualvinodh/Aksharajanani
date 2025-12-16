
import React, { useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Character, GlyphData, Point, FontMetrics, MarkAttachmentRules, CharacterSet, AttachmentClass } from '../../types';
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
    activePair: SiblingPair;
    pivotChar?: Character | null; // The character that drives the class (usually first member)
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
    
    activeClass?: AttachmentClass;
}

const DRAWING_CANVAS_SIZE = 1000;

const CrownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
    </svg>
);

const SiblingThumbnail: React.FC<{
    pair: SiblingPair;
    isActive: boolean;
    isPivot: boolean;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    anchorDelta: Point;
    onClick: () => void;
    size?: number;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = React.memo(({ pair, isActive, isPivot, glyphDataMap, strokeThickness, anchorDelta, onClick, size = 80, metrics, markAttachmentRules, characterSets, groups }) => {
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

    // Dynamic Classes
    const containerClasses = `flex-shrink-0 flex flex-col items-center justify-center bg-white dark:bg-gray-800 border rounded shadow-sm cursor-pointer transition-all duration-200 aspect-square relative
        ${isActive 
            ? 'ring-2 ring-indigo-500 border-transparent opacity-100 z-10' 
            : 'border-gray-200 dark:border-gray-600 opacity-60 hover:opacity-100 hover:scale-105'}`;

    return (
        <div 
            onClick={onClick}
            style={{ width: size }}
            className={containerClasses}
            title={isPivot ? "Class Leader (Edit here to sync)" : `Edit ${pair.base.name} + ${pair.mark.name}`}
        >
            <canvas ref={canvasRef} width={size} height={size} />
            {isPivot && (
                 <div className="absolute top-0.5 right-0.5 bg-yellow-400 text-yellow-900 rounded-full p-1 shadow-md z-20" title="Class Leader">
                    <CrownIcon className="w-3 h-3" />
                 </div>
            )}
        </div>
    );
});

const ClassPreviewStrip: React.FC<ClassPreviewStripProps> = ({ 
    siblings, activePair, pivotChar, glyphDataMap, strokeThickness, anchorDelta, isLinked, onSelectPair,
    metrics, markAttachmentRules, characterSets, groups,
    isExpanded, setIsExpanded, activeClass
}) => {
    const { visibility, handleScroll, scrollRef, checkVisibility } = useHorizontalScroll();

    useEffect(() => {
        if (!isExpanded) {
            checkVisibility();
            const timer = setTimeout(checkVisibility, 100);
            return () => clearTimeout(timer);
        }
    }, [siblings, checkVisibility, isExpanded]);

    // If Unlinked AND no active class context, hide strip (pure manual mode)
    if (!activeClass && siblings.length === 0) return null;
    
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
    
    // Check if a pair is the Pivot
    // Logic: Identify if the Base or Mark in the pair matches the pivot character provided
    const isPairPivot = (pair: SiblingPair) => {
        if (!pivotChar) return false;
        return pair.base.unicode === pivotChar.unicode || pair.mark.unicode === pivotChar.unicode;
    };
    
    const isPairActive = (pair: SiblingPair) => {
        return pair.base.unicode === activePair.base.unicode && pair.mark.unicode === activePair.mark.unicode;
    };
    
    const renderThumb = (pair: SiblingPair, size: number) => (
         <SiblingThumbnail 
            key={`${pair.base.unicode}-${pair.mark.unicode}`} 
            pair={pair} 
            isActive={isPairActive(pair)}
            isPivot={isPairPivot(pair)}
            {...thumbProps}
            onClick={() => {
                if (isExpanded) setIsExpanded(false);
                onSelectPair(pair);
            }}
            size={size}
        />
    );
    
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
                            {siblings.length} items in class <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{activeClass?.name || 'Group'}</span>
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
            <div className="flex-grow overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/50">
                 <div className="flex flex-wrap justify-center gap-4">
                    {siblings.map((pair) => renderThumb(pair, 140))}
                 </div>
            </div>
         </div>
    ) : null;

    return (
        <>
            {expandedView && createPortal(expandedView, document.body)}

            <div className={`w-full flex flex-row border-t bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-2 animate-fade-in-up relative items-center transition-all duration-300 ${!isLinked ? 'grayscale opacity-75' : ''}`}>
                 
                 {/* Control Column */}
                 <div className="flex flex-col items-center justify-center pr-3 border-r border-gray-300 dark:border-gray-600 mr-2 gap-2 flex-shrink-0 self-stretch">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center leading-tight">
                        Class<br/>
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
                        {siblings.map((pair) => renderThumb(pair, 80))}
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
