
import React, { useMemo, useRef, useEffect } from 'react';
import { Character, GlyphData, MarkAttachmentRules, MarkPositioningMap, PositioningRules, CharacterSet, FontMetrics } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useTheme } from '../../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { DRAWING_CANVAS_SIZE, RightArrowIcon, EditIcon } from '../../constants';
import { isGlyphDrawn } from '../../utils/glyphUtils';

interface PositioningRuleBlockProps {
    rule: PositioningRules;
    pairs: { base: Character, mark: Character, ligature: Character }[];
    onEditPair: (pair: { base: Character, mark: Character, ligature: Character }) => void;
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    strokeThickness: number;
    markAttachmentRules: MarkAttachmentRules | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    glyphVersion: number;
    metrics: FontMetrics;
}

const MINI_SIZE = 48; // Size of thumbnail

declare var UnicodeProperties: any;

// Internal component for a single mini glyph canvas
const MiniGlyphCanvas: React.FC<{ 
    glyphData: GlyphData | undefined; 
    strokeThickness: number; 
    theme: 'light' | 'dark';
    character: Character;
}> = React.memo(({ glyphData, strokeThickness, theme, character }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, MINI_SIZE, MINI_SIZE);

        if (isGlyphDrawn(glyphData)) {
            const bbox = getAccurateGlyphBBox(glyphData!, strokeThickness);
            
            // Standard scale (fit 1000 units into 48px)
            let scale = MINI_SIZE / DRAWING_CANVAS_SIZE;
            let tx = 0;
            let ty = 0;

            if (bbox) {
                // Auto-fit logic to ensure wide glyphs don't spill
                const PADDING = 6; // Small padding for the mini tile
                const availableDim = MINI_SIZE - (PADDING * 2);
                
                // 1. Calculate Fit Scale
                if (bbox.width > 0 && bbox.height > 0) {
                    const fitScaleX = availableDim / bbox.width;
                    const fitScaleY = availableDim / bbox.height;
                    
                    // Use the smaller scale to fit entirely
                    const fitScale = Math.min(fitScaleX, fitScaleY);
                    
                    // If the glyph is huge (scale < standard), shrink it.
                    // If it's small, keep standard scale to maintain relative size consistency in the list.
                    if (fitScale < scale) {
                        scale = fitScale;
                    }
                }

                // 2. Horizontal Center: Always center content
                const contentCenterX = bbox.x + bbox.width / 2;
                const canvasCenter = MINI_SIZE / 2;
                tx = canvasCenter - (contentCenterX * scale);

                // 3. Vertical Center: Conditional based on type
                let shouldVerticallyCenter = true;

                if (character.glyphClass === 'mark') {
                    shouldVerticallyCenter = false;
                } else if (character.unicode && typeof UnicodeProperties !== 'undefined') {
                    try {
                        const cat = UnicodeProperties.getCategory(character.unicode);
                        // Lm: Modifier Letter, Sk: Modifier Symbol, P*: Punctuation
                        if (cat === 'Lm' || cat === 'Sk' || cat.startsWith('P')) {
                            shouldVerticallyCenter = false;
                        }
                    } catch (e) { }
                }

                if (shouldVerticallyCenter) {
                    // Center the content bounding box
                    const contentCenterY = bbox.y + bbox.height / 2;
                    ty = canvasCenter - (contentCenterY * scale);
                } else {
                    // Center the drawing frame (preserve relative Y position for marks)
                    ty = (MINI_SIZE - (DRAWING_CANVAS_SIZE * scale)) / 2;
                }
            }

            ctx.save();
            ctx.translate(tx, ty);
            ctx.scale(scale, scale);
            renderPaths(ctx, glyphData!.paths, {
                strokeThickness,
                color: theme === 'dark' ? '#E2E8F0' : '#374151'
            });
            ctx.restore();
        }
    }, [glyphData, strokeThickness, theme, character]);

    return <canvas ref={canvasRef} width={MINI_SIZE} height={MINI_SIZE} />;
});

// Component to render a stack of glyphs
const GroupStack: React.FC<{
    title: string;
    items: Character[];
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    theme: 'light' | 'dark';
}> = ({ title, items, glyphDataMap, strokeThickness, theme }) => {
    const { t } = useLocale();
    const displayItems = items.slice(0, 3);
    const overflow = items.length - 3;

    return (
        <div className="flex flex-col items-center">
            {/* Stack Container */}
            <div className="flex items-center justify-center h-16 pl-4"> 
                {displayItems.map((char, index) => (
                    <div 
                        key={char.unicode}
                        className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm -ml-4 first:ml-0 transition-transform hover:-translate-y-1 z-0 hover:z-10 w-12 h-12 flex items-center justify-center overflow-hidden"
                        style={{ zIndex: displayItems.length - index }}
                        title={char.name}
                    >
                        <MiniGlyphCanvas 
                            glyphData={glyphDataMap.get(char.unicode!)} 
                            strokeThickness={strokeThickness}
                            theme={theme}
                            character={char}
                        />
                        {/* Overflow Badge on the last item if needed */}
                        {index === 2 && overflow > 0 && (
                            <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center backdrop-blur-[1px]">
                                <span className="text-white text-xs font-bold">+{overflow}</span>
                            </div>
                        )}
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="w-12 h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center">
                        <span className="text-gray-300 text-xs">{t('empty')}</span>
                    </div>
                )}
            </div>
            {/* Label */}
            <div className="mt-2 text-center">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {title}
                </span>
            </div>
        </div>
    );
};


const PositioningRuleBlock: React.FC<PositioningRuleBlockProps> = ({
    rule,
    pairs,
    onEditPair,
    glyphDataMap,
    markPositioningMap,
    strokeThickness,
}) => {
    const { t } = useLocale();
    const { theme } = useTheme();

    // 1. Organize Data for Visual Equation
    const { uniqueBases, uniqueMarks, groupLabelBase, groupLabelMark } = useMemo(() => {
        const bases = new Map<number, Character>();
        const marks = new Map<number, Character>();
        
        pairs.forEach(p => {
            if (p.base.unicode) bases.set(p.base.unicode, p.base);
            if (p.mark.unicode) marks.set(p.mark.unicode, p.mark);
        });

        // Heuristic labels
        const baseLabel = rule.base.length === 1 && rule.base[0].startsWith('$') 
            ? t(rule.base[0].substring(1)) 
            : t('basesCount', { count: bases.size });
            
        const markLabel = (rule.mark && rule.mark.length === 1 && rule.mark[0].startsWith('$'))
            ? t(rule.mark[0].substring(1))
            : t('marksCount', { count: marks.size });

        return {
            uniqueBases: Array.from(bases.values()),
            uniqueMarks: Array.from(marks.values()),
            groupLabelBase: baseLabel,
            groupLabelMark: markLabel
        };
    }, [pairs, rule, t]);

    // 2. Calculate Progress
    const totalPairs = pairs.length;
    const completedPairs = useMemo(() => {
        return pairs.filter(p => 
            markPositioningMap.has(`${p.base.unicode}-${p.mark.unicode}`)
        ).length;
    }, [pairs, markPositioningMap]);
    
    const percentage = totalPairs > 0 ? Math.round((completedPairs / totalPairs) * 100) : 0;
    const isComplete = percentage === 100;

    // Use the first pair as the entry point if clicked (essentially opening the group)
    const handleBlockClick = () => {
        if (pairs.length > 0) {
            onEditPair(pairs[0]);
        }
    };

    return (
        <div 
            className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer"
            onClick={handleBlockClick}
        >
            <div className="flex flex-col sm:flex-row items-center p-6 gap-6 sm:gap-4">
                
                {/* Visual Equation Area */}
                <div className="flex-grow flex items-center justify-center sm:justify-start gap-4 sm:gap-8 w-full sm:w-auto">
                    
                    {/* Left Operand (Base) */}
                    <GroupStack 
                        title={groupLabelBase} 
                        items={uniqueBases} 
                        glyphDataMap={glyphDataMap} 
                        strokeThickness={strokeThickness}
                        theme={theme}
                    />

                    {/* Operator */}
                    <div className="flex flex-col items-center justify-center pb-6">
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 font-bold text-xl">
                            +
                        </div>
                    </div>

                    {/* Right Operand (Mark) */}
                    <GroupStack 
                        title={groupLabelMark} 
                        items={uniqueMarks} 
                        glyphDataMap={glyphDataMap} 
                        strokeThickness={strokeThickness}
                        theme={theme}
                    />
                </div>

                {/* Divider (Mobile Only) */}
                <div className="w-full h-px bg-gray-100 dark:bg-gray-700 sm:hidden"></div>

                {/* Action Area */}
                <div className="flex-shrink-0 w-full sm:w-64 flex flex-col gap-3">
                    <button 
                        className={`w-full py-3 px-4 rounded-lg font-bold text-sm shadow-sm flex items-center justify-between transition-colors
                            ${isComplete 
                                ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' 
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500'
                            }`}
                    >
                        <span>{isComplete ? t('reviewPositions') : t('startPositioning')}</span>
                        <div className={`p-1 rounded-full ${isComplete ? 'bg-green-200 dark:bg-green-800' : 'bg-white/20'}`}>
                            {isComplete ? <EditIcon className="w-4 h-4"/> : <RightArrowIcon className="w-4 h-4" />}
                        </div>
                    </button>

                    {/* Progress Bar & Text */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
                            <span>{t('progress')}</span>
                            <span>{t('progressPairs', { completed: completedPairs, total: totalPairs })}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-indigo-500'}`}
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default React.memo(PositioningRuleBlock);
