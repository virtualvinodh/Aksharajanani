
import React, { useRef, useEffect } from 'react';
import { Character, GlyphData, Point } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { renderPaths } from '../../services/glyphRenderService';

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
    orientation?: 'horizontal' | 'vertical'; // Kept for prop compatibility but currently unused logic-wise as we prioritize horizontal
}

const PREVIEW_SIZE = 80;
const DRAWING_CANVAS_SIZE = 1000;

const SiblingThumbnail: React.FC<{
    pair: SiblingPair;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    currentOffset: Point;
}> = React.memo(({ pair, glyphDataMap, strokeThickness, currentOffset }) => {
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
        <div className="flex-shrink-0 flex flex-col items-center gap-1 p-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm w-16 sm:w-20">
            <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="w-10 h-10 sm:w-12 sm:h-12 opacity-90" />
            <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate w-full text-center">
                {pair.base.name}
            </span>
        </div>
    );
});

const ClassPreviewStrip: React.FC<ClassPreviewStripProps> = ({ siblings, glyphDataMap, strokeThickness, currentOffset, isLinked }) => {
    if (!isLinked || siblings.length === 0) return null;

    return (
        <div className="w-full flex flex-col border-t bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-2 animate-fade-in-up">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mr-2 flex-shrink-0 px-2 border-r border-gray-300 dark:border-gray-600">
                    Syncing {siblings.length}
                </span>
                {siblings.map((pair) => (
                    <SiblingThumbnail 
                        key={`${pair.base.unicode}-${pair.mark.unicode}`} 
                        pair={pair} 
                        glyphDataMap={glyphDataMap} 
                        strokeThickness={strokeThickness}
                        currentOffset={currentOffset}
                    />
                ))}
            </div>
        </div>
    );
};

export default React.memo(ClassPreviewStrip);
