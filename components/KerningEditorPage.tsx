import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, RecommendedKerning, Point } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import { calculateAutoKerning } from '../services/kerningService';
import { getAccurateGlyphBBox, getGlyphSubBBoxes } from '../services/glyphRenderService';
import { useMediaQuery } from '../hooks/useMediaQuery';
import KerningEditorHeader from './kerning/KerningEditorHeader';
import KerningEditorWorkspace from './kerning/KerningEditorWorkspace';
import KerningCanvas from './KerningCanvas';

interface KerningEditorPageProps {
    pair: { left: Character, right: Character };
    onClose: () => void;
    onSave: (value: number) => void;
    onRemove: () => void;
    initialValue: number;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    metrics: FontMetrics;
    settings: AppSettings;
    recommendedKerning: RecommendedKerning[] | null;
    onNavigate: (direction: 'prev' | 'next') => void;
    hasPrev: boolean;
    hasNext: boolean;
    glyphVersion: number;
}

const KerningEditorPage: React.FC<KerningEditorPageProps> = ({
    pair, onClose, onSave, onRemove, initialValue, glyphDataMap, strokeThickness, metrics, settings, recommendedKerning,
    onNavigate, hasPrev, hasNext, glyphVersion
}) => {
    const { t } = useLocale();
    const [inputValue, setInputValue] = useState(String(initialValue));
    const [isDirty, setIsDirty] = useState(false);
    const [isAutoKerning, setIsAutoKerning] = useState(false);
    
    // Viewport State
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [baseScale, setBaseScale] = useState(1); 
    const [pageTool, setPageTool] = useState<'select' | 'pan'>('select');

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 0, height: 0 });
    const debounceTimeout = useRef<number | null>(null);
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    const [xHeightDistance, setXHeightDistance] = useState<number | null>(null);
    const [xDistInputValue, setXDistInputValue] = useState<string>('');
    const [isXDistFocused, setIsXDistFocused] = useState(false);
    const [isXDistHovered, setIsXDistHovered] = useState(false);
    const [isKernFocused, setIsKernFocused] = useState(false);
    const [isKernHovered, setIsKernHovered] = useState(false);

    const xDistInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setInputValue(String(initialValue));
        setIsDirty(false);
    }, [initialValue, pair]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const updateSize = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setContainerSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
            }
        };
        updateSize();
        const ro = new ResizeObserver(updateSize);
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (containerSize.width === 0 || containerSize.height === 0) return;
        
        // Logical aspect ratio requested: 1.5
        const targetRatio = 1.5;
        let w = containerSize.width * 0.95;
        let h = w / targetRatio;
        
        // If calculated height exceeds available container height, cap height and adjust width
        if (h > containerSize.height * 0.95) {
            h = containerSize.height * 0.95;
            w = h * targetRatio;
        }
        
        const finalWidth = Math.floor(w);
        const finalHeight = Math.floor(h);
        
        setCanvasDisplaySize({ width: finalWidth, height: finalHeight });
        
        // Base scale maps our logical units (1500 width at 1.5 ratio) to visual pixels
        // Logical Width = Ratio * Height = 1.5 * 1000 = 1500
        setBaseScale(finalWidth / 1500);
    }, [containerSize]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '' || val === '-' || /^-?\d*$/.test(val)) { 
            setInputValue(val); 
            setIsDirty(true); 
        }
    };

    const handleSaveClick = useCallback(() => {
        const parsed = parseInt(inputValue, 10);
        onSave(isNaN(parsed) ? 0 : parsed);
        setIsDirty(false);
    }, [inputValue, onSave]);

    useEffect(() => {
        if (!settings.isAutosaveEnabled || !isDirty) return;
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = window.setTimeout(handleSaveClick, 800);
        return () => { if (debounceTimeout.current) clearTimeout(debounceTimeout.current); };
    }, [inputValue, isDirty, settings.isAutosaveEnabled, handleSaveClick]);

    const handleAutoKern = useCallback(async () => {
        if (!metrics || !settings) return;
        setIsAutoKerning(true);
        try {
            const results = await calculateAutoKerning([pair], glyphDataMap, metrics, strokeThickness, () => {}, recommendedKerning);
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            if (results.has(key)) {
                setInputValue(String(results.get(key)));
                setIsDirty(true);
            }
        } finally {
            setIsAutoKerning(false);
        }
    }, [pair, glyphDataMap, metrics, strokeThickness, recommendedKerning, settings]);

    const handleXDistCommit = () => {
        const newDist = parseInt(xDistInputValue, 10);
        if (!isNaN(newDist) && xHeightDistance !== null) {
            setInputValue(String((parseInt(inputValue, 10) || 0) + (newDist - xHeightDistance)));
            setIsDirty(true);
        } else {
            setXDistInputValue(xHeightDistance !== null ? String(xHeightDistance) : 'N/A');
        }
    };

    // Update x-height distance calculation whenever kern value or glyphs change
    useEffect(() => {
        const leftGlyph = glyphDataMap.get(pair.left.unicode!);
        const rightGlyph = glyphDataMap.get(pair.right.unicode!);
        if (!leftGlyph || !rightGlyph) return;
        
        const lSub = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rSub = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        
        if (lSub?.xHeight && rSub?.xHeight) {
            const kern = parseInt(inputValue, 10) || 0;
            const lBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness)!;
            const rBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness)!;
            const rsbL = pair.left.rsb ?? metrics.defaultRSB;
            const lsbR = pair.right.lsb ?? metrics.defaultLSB;
            const rightTranslateX = lBox.x + lBox.width + rsbL + kern + lsbR - rBox.x;
            
            const dist = Math.round(rSub.xHeight.minX + rightTranslateX - lSub.xHeight.maxX);
            setXHeightDistance(dist);
            if (document.activeElement !== xDistInputRef.current) setXDistInputValue(String(dist));
        }
    }, [pair, inputValue, glyphDataMap, strokeThickness, metrics]);

    const showMeasurement = isXDistFocused || isXDistHovered || isKernFocused || isKernHovered;

    return (
        <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800 animate-fade-in-up">
            <KerningEditorHeader 
                pair={pair} 
                onClose={onClose} 
                onNavigate={onNavigate} 
                hasPrev={hasPrev} 
                hasNext={hasNext} 
                onAutoKern={handleAutoKern} 
                isAutoKerning={isAutoKerning} 
                onSave={handleSaveClick} 
                onRemove={onRemove} 
                isDirty={isDirty} 
                settings={settings} 
            />
            
            <KerningEditorWorkspace 
                isLargeScreen={isLargeScreen}
                containerRef={containerRef}
                onZoom={f => setZoom(z => Math.max(0.1, Math.min(10, z * f)))} 
                kernValue={inputValue} 
                onKernChange={handleInputChange} 
                onKernFocus={setIsKernFocused} 
                onKernHover={setIsKernHovered} 
                isKernDirty={isDirty} 
                xDistValue={xDistInputValue} 
                onXDistChange={e => setXDistInputValue(e.target.value)} 
                onXDistCommit={handleXDistCommit} 
                isXDistFocused={isXDistFocused} 
                isXDistHovered={isXDistHovered} 
                onXDistFocus={setIsXDistFocused} 
                onXDistHover={setIsXDistHovered} 
                xDistInputRef={xDistInputRef} 
            >
                {/* The visual container for the canvas, strictly following the aspect ratio */}
                <div 
                    className="rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800"
                    style={{ width: canvasDisplaySize.width, height: canvasDisplaySize.height }}
                >
                    <KerningCanvas
                        width={canvasDisplaySize.width}
                        height={canvasDisplaySize.height}
                        leftChar={pair.left}
                        rightChar={pair.right}
                        glyphDataMap={glyphDataMap}
                        kernValue={inputValue}
                        onKernChange={setInputValue}
                        metrics={metrics}
                        tool={pageTool}
                        zoom={zoom}
                        setZoom={setZoom}
                        viewOffset={viewOffset}
                        setViewOffset={setViewOffset}
                        settings={settings}
                        baseScale={baseScale}
                        strokeThickness={strokeThickness}
                        showMeasurement={showMeasurement}
                    />
                </div>
            </KerningEditorWorkspace>
        </div>
    );
};

export default React.memo(KerningEditorPage);