
import React, { useRef, useEffect, useState } from 'react';
import { Character, GlyphData, Point } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { renderPaths } from '../../services/glyphRenderService';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';
import { LeftArrowIcon, RightArrowIcon, FoldIcon } from '../../constants';

interface SiblingPair {
    base: Character;
    mark: Character;
    ligature: Character; 
}

interface ClassPreviewStripProps {
    siblings: SiblingPair[];
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    currentOffset: Point;
    isLinked: boolean;
    orientation?: 'horizontal' | 'vertical';
    onSelectPair: (pair: SiblingPair) => void;
}

const PREVIEW_SIZE = 80;
const DRAWING_CANVAS_SIZE = 1000;

const SiblingThumbnail: React.FC<{
    pair: SiblingPair;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    currentOffset: Point;
    onClick: () => void;
}> = React.memo(({ pair, glyphDataMap, strokeThickness, currentOffset, onClick }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

        const baseGlyph = glyphDataMap.get(pair.base.unicode);
        const markGlyph = glyphDataMap.get(pair.mark.unicode);
        
        if (!baseGlyph || !markGlyph) return;

        const scale = PREVIEW_SIZE / DRAWING_CANVAS_SIZE;

        ctx.save();
        ctx.scale(scale, scale);

        // 1. Draw Base (Fixed)
        renderPaths(ctx, baseGlyph.paths, { strokeThickness: strokeThickness * 1.5, color: theme === 'dark' ? '#475569' : '#CBD5E1' }); 

        // 2. Draw Mark (Dynamic Offset)
        ctx.save();
        ctx.translate(currentOffset.x, currentOffset.y);
        renderPaths(ctx, markGlyph.paths, { strokeThickness: strokeThickness * 1.5, color: theme === 'dark' ? '#818CF8' : '#4F46E5' }); 
        ctx.restore();

        ctx.restore();

    }, [pair, glyphDataMap, strokeThickness, currentOffset, theme]);

    return (
        <div 
            onClick={onClick}
            className="flex-shrink-0 flex flex-col items-center gap-1 p-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm w-16 sm:w-20 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all hover:-translate-y-0.5"
            title={`Edit ${pair.base.name} + ${pair.mark.name}`}
        >
            <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="w-10 h-10 sm:w-12 sm:h-12 opacity-90" />
            <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate w-full text-center">
                {pair.base.name}
            </span>
        </div>
    );
});

const ClassPreviewStrip: React.FC<ClassPreviewStripProps> = ({ siblings, glyphDataMap, strokeThickness, currentOffset, isLinked, onSelectPair }) => {
    const { visibility, handleScroll, scrollRef, checkVisibility } = useHorizontalScroll();
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (!isExpanded) {
            checkVisibility();
            // Give layout a moment to settle if siblings changed
            const timer = setTimeout(checkVisibility, 100);
            return () => clearTimeout(timer);
        }
    }, [siblings, checkVisibility, isExpanded]);

    if (!isLinked || siblings.length === 0) return null;

    return (
        <div className={`w-full flex flex-row border-t bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-2 animate-fade-in-up relative transition-all duration-300 ${isExpanded ? 'h-64 items-start' : 'items-center'}`}>
             
             {/* Control Column */}
             <div className="flex flex-col items-center justify-center pr-3 border-r border-gray-300 dark:border-gray-600 mr-2 gap-2 flex-shrink-0 self-stretch">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center leading-tight">
                    Syncing<br/>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{siblings.length}</span>
                </span>
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"
                    title={isExpanded ? "Collapse View" : "Expand All"}
                >
                    <FoldIcon className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
             </div>

             {isExpanded ? (
                 /* Expanded Grid View */
                 <div className="flex-grow overflow-y-auto pr-1 h-full">
                     <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 pb-2">
                        {siblings.map((pair) => (
                            <SiblingThumbnail 
                                key={`${pair.base.unicode}-${pair.mark.unicode}`} 
                                pair={pair} 
                                glyphDataMap={glyphDataMap} 
                                strokeThickness={strokeThickness}
                                currentOffset={currentOffset}
                                onClick={() => onSelectPair(pair)}
                            />
                        ))}
                     </div>
                 </div>
             ) : (
                 /* Collapsed Scroll View */
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
                                glyphDataMap={glyphDataMap} 
                                strokeThickness={strokeThickness}
                                currentOffset={currentOffset}
                                onClick={() => onSelectPair(pair)}
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
             )}
        </div>
    );
};

export default React.memo(ClassPreviewStrip);
