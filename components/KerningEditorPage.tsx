import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, RecommendedKerning } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import { calculateAutoKerning } from '../services/kerningService';
import { renderPaths, getAccurateGlyphBBox, getGlyphSubBBoxes, BBox } from '../services/glyphRenderService';
import { VEC } from '../utils/vectorUtils';
import { useMediaQuery } from '../hooks/useMediaQuery';
import KerningEditorHeader from './kerning/KerningEditorHeader';
import KerningEditorWorkspace from './kerning/KerningEditorWorkspace';

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
    const { theme } = useTheme();
    const [inputValue, setInputValue] = useState(String(initialValue));
    const [isDirty, setIsDirty] = useState(false);
    const [isAutoKerning, setIsAutoKerning] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [baseScale, setBaseScale] = useState(1); 
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const debounceTimeout = useRef<number | null>(null);
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    const [isDragging, setIsDragging] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [showInitialCue, setShowInitialCue] = useState(false);
    const rightGlyphBboxRef = useRef<{x: number, y: number, width: number, height: number} | null>(null);
    const dragState = useRef({ startX: 0, startValue: 0, scale: 1 });
    const [xHeightDistance, setXHeightDistance] = useState<number | null>(null);

    const [xDistInputValue, setXDistInputValue] = useState<string>('');
    const [isXDistFocused, setIsXDistFocused] = useState(false);
    const [isXDistHovered, setIsXDistHovered] = useState(false);
    const xDistInputRef = useRef<HTMLInputElement>(null);

    // Sync effect: Re-hydrate on initialValue or pair change (Fixes Reset visual lag)
    useEffect(() => {
        setInputValue(String(initialValue));
        setIsDirty(false);
        setIsDragging(false);
        
        setShowInitialCue(true);
        const timer = setTimeout(() => setShowInitialCue(false), 1200);
        return () => clearTimeout(timer);
    }, [initialValue, pair]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const updateSize = () => {
            const rect = container.getBoundingClientRect();
            setCanvasSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        };
        updateSize();
        const ro = new ResizeObserver(updateSize);
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    // Calculate Stabilized Base Scale
    useEffect(() => {
        if (canvasSize.width === 0 || canvasSize.height === 0) return;
        const leftGlyph = glyphDataMap.get(pair.left.unicode!);
        const rightGlyph = glyphDataMap.get(pair.right.unicode!);
        if (!leftGlyph || !rightGlyph) return;

        const lBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!lBox || !rBox) return;

        const rsbL = pair.left.rsb ?? metrics.defaultRSB;
        const lsbR = pair.right.lsb ?? metrics.defaultLSB;
        const totalRefWidth = lBox.width + rsbL + lsbR + rBox.width;
        
        const fitScale = Math.min((canvasSize.width * 0.8) / totalRefWidth, (canvasSize.height * 0.8) / 700);
        setBaseScale(fitScale);
    }, [pair, canvasSize, glyphDataMap, metrics, strokeThickness]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '' || val === '-' || /^-?\d*$/.test(val)) { setInputValue(val); setIsDirty(true); }
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

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!canvasRef.current || !rightGlyphBboxRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (pt.x >= rightGlyphBboxRef.current.x && pt.x <= rightGlyphBboxRef.current.x + rightGlyphBboxRef.current.width &&
            pt.y >= rightGlyphBboxRef.current.y && pt.y <= rightGlyphBboxRef.current.y + rightGlyphBboxRef.current.height) {
            setIsDragging(true);
            dragState.current.startX = pt.x;
            dragState.current.startValue = parseInt(inputValue, 10) || 0;
            e.preventDefault();
        }
    }, [inputValue]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (isDragging) {
            const change = Math.round((pt.x - dragState.current.startX) / dragState.current.scale);
            setInputValue(String(dragState.current.startValue + change));
            setIsDirty(true);
        } else if (rightGlyphBboxRef.current) {
            setIsHovering(pt.x >= rightGlyphBboxRef.current.x && pt.x <= rightGlyphBboxRef.current.x + rightGlyphBboxRef.current.width &&
                         pt.y >= rightGlyphBboxRef.current.y && pt.y <= rightGlyphBboxRef.current.y + rightGlyphBboxRef.current.height);
        }
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleAutoKern = useCallback(async () => {
        if (!metrics || !settings) return;
        setIsAutoKerning(true);
        try {
            const results = await calculateAutoKerning(
                [pair],
                glyphDataMap,
                metrics,
                strokeThickness,
                () => {}, // No need for progress reporting for a single pair
                recommendedKerning
            );
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            if (results.has(key)) {
                setInputValue(String(results.get(key)));
                setIsDirty(true);
            }
        } catch (error) {
            console.error("Auto-kerning failed for pair:", pair, error);
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

    useEffect(() => {
        if (document.activeElement !== xDistInputRef.current) setXDistInputValue(xHeightDistance !== null ? String(xHeightDistance) : 'N/A');
    }, [xHeightDistance]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas || canvasSize.width === 0) return;
        canvas.width = canvasSize.width; canvas.height = canvasSize.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const leftGlyph = glyphDataMap.get(pair.left.unicode!);
        const rightGlyph = glyphDataMap.get(pair.right.unicode!);
        if (!leftGlyph || !rightGlyph) return;
        const lBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!lBox || !rBox) return;

        const rsbL = pair.left.rsb ?? metrics.defaultRSB;
        const lsbR = pair.right.lsb ?? metrics.defaultLSB;
        const kern = parseInt(inputValue, 10) || 0;
        const rightTranslateX = lBox.x + lBox.width + rsbL + kern + lsbR - rBox.x;

        const lSub = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rSub = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        if (lSub?.xHeight && rSub?.xHeight) setXHeightDistance(Math.round(rSub.xHeight.minX + rightTranslateX - lSub.xHeight.maxX));

        const finalScale = baseScale * zoom;
        const totalW = (lBox.x + lBox.width - lBox.x) + rsbL + kern + lsbR + rBox.width;
        const tx = (canvasSize.width - (totalW * finalScale)) / 2 - (lBox.x * finalScale);
        const ty = (canvasSize.height - (700 * finalScale)) / 2;

        ctx.save();
        ctx.translate(tx, ty); ctx.scale(finalScale, finalScale);

        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        ctx.lineWidth = 1 / finalScale; ctx.setLineDash([8/finalScale, 6/finalScale]);
        ctx.beginPath(); ctx.moveTo(-500, metrics.topLineY); ctx.lineTo(totalW+1000, metrics.topLineY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-500, metrics.baseLineY); ctx.lineTo(totalW+1000, metrics.baseLineY); ctx.stroke();
        ctx.setLineDash([]);

        const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
        const rightColor = isDragging || isHovering || showInitialCue ? (theme === 'dark' ? '#A78BFA' : '#8B5CF6') : glyphColor;
        renderPaths(ctx, leftGlyph.paths, { strokeThickness, color: glyphColor });
        ctx.save(); ctx.translate(rightTranslateX, 0); renderPaths(ctx, rightGlyph.paths, { strokeThickness, color: rightColor }); ctx.restore();

        rightGlyphBboxRef.current = { x: tx + (rightTranslateX + rBox.x)*finalScale, y: ty + rBox.y*finalScale, width: rBox.width*finalScale, height: rBox.height*finalScale };
        dragState.current.scale = finalScale;

        if ((isXDistFocused || isXDistHovered) && lSub?.xHeight && rSub?.xHeight) {
            const yMid = (metrics.baseLineY + metrics.topLineY)/2;
            ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 2/finalScale; ctx.beginPath();
            ctx.moveTo(lSub.xHeight.maxX, yMid); ctx.lineTo(rSub.xHeight.minX + rightTranslateX, yMid); ctx.stroke();
        }
        ctx.restore();
    }, [pair, inputValue, zoom, baseScale, canvasSize, theme, isDragging, isHovering, showInitialCue, glyphVersion]);

    return (
        <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800 animate-fade-in-up">
            <KerningEditorHeader pair={pair} onClose={onClose} onNavigate={onNavigate} hasPrev={hasPrev} hasNext={hasNext} onAutoKern={handleAutoKern} isAutoKerning={isAutoKerning} onSave={handleSaveClick} onRemove={onRemove} isDirty={isDirty} isAutosaveEnabled={settings.isAutosaveEnabled} />
            <KerningEditorWorkspace isLargeScreen={isLargeScreen} canvasRef={canvasRef} containerRef={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onTouchStart={() => {}} onTouchMove={() => {}} onZoom={f => setZoom(z => Math.max(0.1, Math.min(10, z * f)))} kernValue={inputValue} onKernChange={handleInputChange} isKernDirty={isDirty} xDistValue={xDistInputValue} onXDistChange={e => setXDistInputValue(e.target.value)} onXDistCommit={handleXDistCommit} isXDistFocused={isXDistFocused} isXDistHovered={isXDistHovered} onXDistFocus={setIsXDistFocused} onXDistHover={setIsXDistHovered} xDistInputRef={xDistInputRef} />
        </div>
    );
};

export default React.memo(KerningEditorPage);