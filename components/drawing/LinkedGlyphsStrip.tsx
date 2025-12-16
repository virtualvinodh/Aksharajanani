
import React, { useRef, useEffect } from 'react';
import { Character, GlyphData, AppSettings } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';
import { LeftArrowIcon, RightArrowIcon, LinkIcon, BrokenLinkIcon } from '../../constants';
import { isGlyphDrawn } from '../../utils/glyphUtils';

interface LinkedGlyphsStripProps {
    title: string;
    items: Character[];
    glyphDataMap: Map<number, GlyphData>;
    settings: AppSettings;
    onSelect: (char: Character) => void;
    variant: 'sources' | 'dependents';
}

const PREVIEW_SIZE = 60;
const DRAWING_CANVAS_SIZE = 1000;

const GlyphThumbnail: React.FC<{
    character: Character;
    glyphData: GlyphData | undefined;
    strokeThickness: number;
    onClick: () => void;
}> = React.memo(({ character, glyphData, strokeThickness, onClick }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

        if (isGlyphDrawn(glyphData)) {
            const bbox = getAccurateGlyphBBox(glyphData!, strokeThickness);
            
            // Auto-fit logic
            let scale = PREVIEW_SIZE / DRAWING_CANVAS_SIZE;
            let tx = 0;
            let ty = 0;

            if (bbox) {
                 const padding = 100;
                 const w = Math.max(bbox.width + padding * 2, 100);
                 const h = Math.max(bbox.height + padding * 2, 100);
                 
                 scale = Math.min(PREVIEW_SIZE / w, PREVIEW_SIZE / h);
                 
                 // Center
                 const cx = bbox.x + bbox.width / 2;
                 const cy = bbox.y + bbox.height / 2;
                 
                 tx = (PREVIEW_SIZE / 2) - (cx * scale);
                 ty = (PREVIEW_SIZE / 2) - (cy * scale);
            }

            ctx.save();
            ctx.translate(tx, ty);
            ctx.scale(scale, scale);
            
            renderPaths(ctx, glyphData!.paths, {
                strokeThickness,
                color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
            });
            ctx.restore();
        }
    }, [glyphData, strokeThickness, theme]);

    return (
        <div 
            onClick={onClick}
            className="flex-shrink-0 flex flex-col items-center justify-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all p-1 group w-16 h-20"
            title={character.name}
        >
            <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} />
            <span 
                className="text-[10px] font-bold text-gray-600 dark:text-gray-400 truncate max-w-full mt-1"
                style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
            >
                {character.name}
            </span>
        </div>
    );
});

const LinkedGlyphsStrip: React.FC<LinkedGlyphsStripProps> = ({ 
    title, items, glyphDataMap, settings, onSelect, variant
}) => {
    const { visibility, handleScroll, scrollRef, checkVisibility } = useHorizontalScroll();
    
    useEffect(() => {
        checkVisibility();
    }, [items, checkVisibility]);

    if (items.length === 0) return null;

    const isSource = variant === 'sources';

    return (
        <div className="w-full flex flex-row border-t bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 p-2 animate-fade-in-up relative items-center max-w-5xl rounded-b-xl mx-auto">
             {/* Label Column */}
             <div className="flex flex-col items-center justify-center pr-3 border-r border-gray-300 dark:border-gray-600 mr-2 gap-1 flex-shrink-0 w-20">
                <span className={`p-1.5 rounded-full ${isSource ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300'}`}>
                    {isSource ? <LinkIcon className="w-4 h-4" /> : <BrokenLinkIcon className="w-4 h-4" />}
                </span>
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center leading-tight">
                    {title}<br/>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">{items.length}</span>
                </span>
             </div>

             {/* Scrollable List */}
             <div className="relative flex-grow overflow-hidden flex items-center">
                 {visibility.left && (
                    <button
                        onClick={() => handleScroll('left')}
                        className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-gradient-to-r from-gray-50 via-gray-50/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
                    >
                        <div className="p-0.5 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                            <LeftArrowIcon className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                        </div>
                    </button>
                )}

                <div ref={scrollRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center scroll-smooth px-1 w-full">
                    {items.map((char) => (
                        <GlyphThumbnail 
                            key={char.unicode || char.name}
                            character={char}
                            glyphData={char.unicode !== undefined ? glyphDataMap.get(char.unicode) : undefined}
                            strokeThickness={settings.strokeThickness}
                            onClick={() => onSelect(char)}
                        />
                    ))}
                </div>

                {visibility.right && (
                    <button
                        onClick={() => handleScroll('right')}
                        className="absolute right-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-gradient-to-l from-gray-50 via-gray-50/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
                    >
                        <div className="p-0.5 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                            <RightArrowIcon className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                        </div>
                    </button>
                )}
             </div>
        </div>
    );
};

export default React.memo(LinkedGlyphsStrip);
