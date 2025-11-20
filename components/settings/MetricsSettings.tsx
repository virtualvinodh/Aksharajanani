import React, { useRef, useEffect } from 'react';
import { FontMetrics } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useTheme } from '../../contexts/ThemeContext';
import { DRAWING_CANVAS_SIZE } from '../../constants';

const MetricsVisualizer: React.FC<{ metrics: FontMetrics }> = ({ metrics }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        
        // --- Colors ---
        const bgColor = theme === 'dark' ? '#1F2937' : '#F3F4F6';
        const guideColor = theme === 'dark' ? '#6B7280' : '#9CA3AF';
        const ascenderColor = theme === 'dark' ? '#60A5FA' : '#3B82F6';
        const descenderColor = theme === 'dark' ? '#F87171' : '#EF4444';
        const baselineColor = theme === 'dark' ? '#A78BFA' : '#8B5CF6';
        const sampleTextColor = theme === 'dark' ? '#F9FAFB' : '#111827';
        
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // --- Calculations ---
        const fontUnitHeight = metrics.ascender - metrics.descender;
        if (fontUnitHeight <= 0) return;

        const diagramVisibleHeight = height * 0.8;
        const scale = diagramVisibleHeight / fontUnitHeight;
        const topMargin = height * 0.1;

        const getDiagramY = (fontUnitY: number) => topMargin + (metrics.ascender - fontUnitY) * scale;

        const ascenderY = getDiagramY(metrics.ascender);
        const descenderY = getDiagramY(metrics.descender);
        const baselineY = getDiagramY(0);

        const fontScaleForGuides = fontUnitHeight / DRAWING_CANVAS_SIZE;
        const baseGuideFontY = ((DRAWING_CANVAS_SIZE - metrics.baseLineY) * fontScaleForGuides) + metrics.descender;
        const topGuideFontY = ((DRAWING_CANVAS_SIZE - metrics.topLineY) * fontScaleForGuides) + metrics.descender;
        const superTopGuideFontY = metrics.superTopLineY !== undefined ? ((DRAWING_CANVAS_SIZE - metrics.superTopLineY) * fontScaleForGuides) + metrics.descender : null;
        const subBaseGuideFontY = metrics.subBaseLineY !== undefined ? ((DRAWING_CANVAS_SIZE - metrics.subBaseLineY) * fontScaleForGuides) + metrics.descender : null;
        
        const baseGuideDiagramY = getDiagramY(baseGuideFontY);
        const topGuideDiagramY = getDiagramY(topGuideFontY);
        const superTopGuideDiagramY = superTopGuideFontY !== null ? getDiagramY(superTopGuideFontY) : null;
        const subBaseGuideDiagramY = subBaseGuideFontY !== null ? getDiagramY(subBaseGuideFontY) : null;

        // --- Drawing ---
        const drawLineWithLabel = (y: number, label: string, color: string, isDashed = false, alignLeft = false) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = isDashed ? 1 : 2;
            ctx.setLineDash(isDashed ? [5, 5] : []);
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.font = '12px sans-serif';
            ctx.textAlign = alignLeft ? 'left' : 'right';
            const yPos = y > height - 20 ? y - 2 : y + 2;
            const textBaseline = y > height - 20 ? 'bottom' : 'top';
            ctx.textBaseline = textBaseline;
            ctx.fillText(label, alignLeft ? 10 : width - 10, yPos);
        };
        
        drawLineWithLabel(ascenderY, `Ascender (${metrics.ascender})`, ascenderColor, false, true);
        drawLineWithLabel(descenderY, `Descender (${metrics.descender})`, descenderColor, false, true);
        drawLineWithLabel(baselineY, 'Baseline (0)', baselineColor);

        drawLineWithLabel(baseGuideDiagramY, `Baseline Guide (${metrics.baseLineY})`, guideColor, true);
        drawLineWithLabel(topGuideDiagramY, `Topline Guide (${metrics.topLineY})`, guideColor, true);
        if (superTopGuideDiagramY !== null && metrics.superTopLineY !== undefined) {
            drawLineWithLabel(superTopGuideDiagramY, `Super Topline Guide (${metrics.superTopLineY})`, guideColor, true);
        }
        if (subBaseGuideDiagramY !== null && metrics.subBaseLineY !== undefined) {
            drawLineWithLabel(subBaseGuideDiagramY, `Sub Baseline Guide (${metrics.subBaseLineY})`, guideColor, true);
        }
        
        ctx.setLineDash([]);

        // --- Draw Sample Text ---
        const fontSize = Math.abs(ascenderY - baseGuideDiagramY) * 0.9;
        if (fontSize > 0) {
            ctx.font = `italic ${fontSize}px serif`;
            ctx.fillStyle = sampleTextColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText("Ag", width * 0.1, baseGuideDiagramY);
        }

    }, [metrics, theme]);

    return <canvas ref={canvasRef} width="512" height="250" className="w-full rounded-md border border-gray-300 dark:border-gray-600 mb-6"></canvas>
};

interface MetricsSettingsProps {
    metrics: FontMetrics;
    onMetricsChange: React.Dispatch<React.SetStateAction<FontMetrics>>;
}

const MetricsSettings: React.FC<MetricsSettingsProps> = ({ metrics, onMetricsChange }) => {
    const { t } = useLocale();
    
    const handleMetricsChange = (key: keyof FontMetrics) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const isNumeric = e.target.type === 'number';
        onMetricsChange(prev => ({
            ...prev,
            [key]: isNumeric ? (value === '' ? undefined : Number(value)) : value
        }));
    };

    return (
        <div className="space-y-6">
            <MetricsVisualizer metrics={metrics} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                <div>
                    <label htmlFor="unitsPerEm" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsUnitsPerEm')}</label>
                    <input type="number" id="unitsPerEm" value={metrics.unitsPerEm ?? ''} onChange={handleMetricsChange('unitsPerEm')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="ascender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsAscender')}</label>
                    <input type="number" id="ascender" value={metrics.ascender ?? ''} onChange={handleMetricsChange('ascender')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="descender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDescender')}</label>
                    <input type="number" id="descender" value={metrics.descender ?? ''} onChange={handleMetricsChange('descender')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="defaultAdvanceWidth" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDefaultAdvanceWidth')}</label>
                    <input type="number" id="defaultAdvanceWidth" value={metrics.defaultAdvanceWidth ?? ''} onChange={handleMetricsChange('defaultAdvanceWidth')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="superTopLineY" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsSuperTopLineY')}</label>
                    <input type="number" id="superTopLineY" value={metrics.superTopLineY ?? ''} onChange={handleMetricsChange('superTopLineY')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="topLineY" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsTopLineY')}</label>
                    <input type="number" id="topLineY" value={metrics.topLineY ?? ''} onChange={handleMetricsChange('topLineY')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="baseLineY" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsBaseLineY')}</label>
                    <input type="number" id="baseLineY" value={metrics.baseLineY ?? ''} onChange={handleMetricsChange('baseLineY')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="subBaseLineY" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsSubBaseLineY')}</label>
                    <input type="number" id="subBaseLineY" value={metrics.subBaseLineY ?? ''} onChange={handleMetricsChange('subBaseLineY')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="styleName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsStyleName')}</label>
                    <input type="text" id="styleName" value={metrics.styleName} onChange={handleMetricsChange('styleName')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="spaceAdvanceWidth" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsSpaceAdvanceWidth')}</label>
                    <input type="number" id="spaceAdvanceWidth" value={metrics.spaceAdvanceWidth ?? ''} onChange={handleMetricsChange('spaceAdvanceWidth')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="defaultLSB" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDefaultLSB')}</label>
                    <input type="number" id="defaultLSB" value={metrics.defaultLSB ?? ''} onChange={handleMetricsChange('defaultLSB')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
                <div>
                    <label htmlFor="defaultRSB" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDefaultRSB')}</label>
                    <input type="number" id="defaultRSB" value={metrics.defaultRSB ?? ''} onChange={handleMetricsChange('defaultRSB')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
                </div>
            </div>
        </div>
    );
};

export default React.memo(MetricsSettings);