
import React, { useRef, useEffect } from 'react';
import { Character, GlyphData, FontMetrics } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { renderPaths, getAccurateGlyphBBox } from '../services/glyphRenderService';
import { KERNING_CARD_CANVAS_SIZE, DRAWING_CANVAS_SIZE } from '../constants';

interface PairCardProps { 
    pair: { left: Character, right: Character }; 
    onClick: () => void;
    isRecommended: boolean;
    showRecommendedLabel: boolean;
    kerningValue: number | undefined;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    metrics: FontMetrics;
    glyphVersion: number;
}

const PairCard: React.FC<PairCardProps> = ({ pair, onClick, isRecommended, showRecommendedLabel, kerningValue, glyphDataMap, strokeThickness, metrics, glyphVersion }) => {
    const { theme } = useTheme();
    const { t } = useLocale();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, KERNING_CARD_CANVAS_SIZE, KERNING_CARD_CANVAS_SIZE);

        const leftGlyph = glyphDataMap.get(pair.left.unicode);
        const rightGlyph = glyphDataMap.get(pair.right.unicode);
        if (!leftGlyph || !rightGlyph) return;

        const leftBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rightBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!leftBox || !rightBox) return;

        const leftMaxX = leftBox.x + leftBox.width;
        const rightMinX = rightBox.x;

        const kernVal = kerningValue ?? 0;
        const rsbLeft = pair.left.rsb ?? metrics.defaultRSB;
        const lsbRight = pair.right.lsb ?? metrics.defaultLSB;
        
        const totalContentWidth = (leftMaxX - leftBox.x) + rsbLeft + kernVal + lsbRight + (rightBox.width);
        if (totalContentWidth <= 0) return;
    
        const scaleFactor = Math.min(
            (KERNING_CARD_CANVAS_SIZE * 0.9) / totalContentWidth,
            (KERNING_CARD_CANVAS_SIZE * 0.9) / DRAWING_CANVAS_SIZE
        );

        const finalWidth = totalContentWidth * scaleFactor;
        const offsetX = (KERNING_CARD_CANVAS_SIZE - finalWidth) / 2 - (leftBox.x * scaleFactor);
        const finalHeight = DRAWING_CANVAS_SIZE * scaleFactor;
        const offsetY = (KERNING_CARD_CANVAS_SIZE - finalHeight) / 2;
    
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scaleFactor, scaleFactor);
        
        // Draw guides
        ctx.strokeStyle = theme === 'dark' ? 'rgba(74, 85, 104, 0.5)' : 'rgba(209, 213, 219, 0.7)';
        ctx.lineWidth = 1 / scaleFactor;
        ctx.setLineDash([2 / scaleFactor, 2 / scaleFactor]);
        const guideWidth = totalContentWidth + leftBox.x + rightBox.x; 
        ctx.beginPath(); ctx.moveTo(0, metrics.topLineY); ctx.lineTo(guideWidth, metrics.topLineY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, metrics.baseLineY); ctx.lineTo(guideWidth, metrics.baseLineY); ctx.stroke();
        ctx.setLineDash([]);
        
        const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
        
        // Draw left glyph
        ctx.save();
        renderPaths(ctx, leftGlyph.paths, { strokeThickness, color: glyphColor });
        ctx.restore();
        
        // Draw right glyph
        const rightStartTranslateX = leftMaxX + rsbLeft + kernVal + lsbRight - rightMinX;
        ctx.save();
        ctx.translate(rightStartTranslateX, 0);
        renderPaths(ctx, rightGlyph.paths, { strokeThickness, color: glyphColor });
        ctx.restore();
        
        ctx.restore();

    }, [pair, kerningValue, glyphDataMap, strokeThickness, theme, metrics, glyphVersion]);

    const hasKerning = kerningValue !== undefined;
    const cardClasses = `relative border-2 rounded-lg p-2 flex items-center justify-center cursor-pointer transition-all duration-200 aspect-square
        ${hasKerning 
            ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600' 
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:border-indigo-500'}`;

    return (
        <div onClick={onClick} className={cardClasses}>
            <canvas ref={canvasRef} width={KERNING_CARD_CANVAS_SIZE} height={KERNING_CARD_CANVAS_SIZE}></canvas>
            {isRecommended && !hasKerning && showRecommendedLabel && (
                <span className="absolute top-1 right-1 text-xs bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100 font-semibold px-2 py-0.5 rounded-full">{t('recommended')}</span>
            )}
            {hasKerning && (
                    <span className="absolute top-1 left-1 text-xs bg-indigo-500 text-white font-bold px-2 py-0.5 rounded-full">{kerningValue}</span>
            )}
        </div>
    );
};

export default React.memo(PairCard);
