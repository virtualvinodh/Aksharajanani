
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, RecommendedKerning, Point } from '../../types';
import { calculateAutoKerning } from '../../services/kerningService';
import { getAccurateGlyphBBox, getGlyphSubBBoxes } from '../../services/glyphRenderService';

interface UseKerningSessionProps {
    pair: { left: Character, right: Character };
    initialValue: number;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    metrics: FontMetrics;
    settings: AppSettings;
    recommendedKerning: RecommendedKerning[] | null;
    onSave: (value: number) => void;
    onClose: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
}

export const useKerningSession = ({
    pair, initialValue, glyphDataMap, strokeThickness, metrics, settings, recommendedKerning, onSave, onClose, onNavigate
}: UseKerningSessionProps) => {
    // --- State ---
    const [kernValue, setKernValue] = useState(String(initialValue));
    const [isDirty, setIsDirty] = useState(false);
    const [isAutoKerning, setIsAutoKerning] = useState(false);
    
    // Viewport
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 0, height: 0 });
    const [baseScale, setBaseScale] = useState(1);

    // Optical Math
    const [xHeightDistance, setXHeightDistance] = useState<number | null>(null);
    const [xDistValue, setXDistValue] = useState<string>('');
    const [isXDistFocused, setIsXDistFocused] = useState(false);
    const [isXDistHovered, setIsXDistHovered] = useState(false);
    const [isKernFocused, setIsKernFocused] = useState(false);
    const [isKernHovered, setIsKernHovered] = useState(false);

    const debounceTimeout = useRef<number | null>(null);

    // --- Viewport Scaling Logic ---
    useEffect(() => {
        if (containerSize.width === 0 || containerSize.height === 0) return;
        const targetRatio = 1.5;
        let w = containerSize.width * 0.95;
        let h = w / targetRatio;
        if (h > containerSize.height * 0.95) {
            h = containerSize.height * 0.95;
            w = h * targetRatio;
        }
        const finalWidth = Math.floor(w);
        const finalHeight = Math.floor(h);
        setCanvasDisplaySize({ width: finalWidth, height: finalHeight });
        setBaseScale(finalWidth / 1500); // 1500 is the logical width for 1.5 ratio (1000 height)
    }, [containerSize]);

    // --- Core Interaction Handlers ---
    const handleKernValueChange = useCallback((val: string) => {
        setKernValue(val);
        setIsDirty(true);
    }, []);

    const handleSave = useCallback(() => {
        const parsed = parseInt(kernValue, 10);
        onSave(isNaN(parsed) ? 0 : parsed);
        setIsDirty(false);
    }, [kernValue, onSave]);

    const handleAutoKern = useCallback(async () => {
        setIsAutoKerning(true);
        try {
            const results = await calculateAutoKerning([pair], glyphDataMap, metrics, strokeThickness, () => {}, recommendedKerning);
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            if (results.has(key)) {
                handleKernValueChange(String(results.get(key)));
            }
        } finally {
            setIsAutoKerning(false);
        }
    }, [pair, glyphDataMap, metrics, strokeThickness, recommendedKerning, handleKernValueChange]);

    // --- Optical Gap (X-Dist) Math ---
    useEffect(() => {
        const leftGlyph = glyphDataMap.get(pair.left.unicode!);
        const rightGlyph = glyphDataMap.get(pair.right.unicode!);
        if (!leftGlyph || !rightGlyph) return;
        
        const lSub = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rSub = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        
        if (lSub?.xHeight && rSub?.xHeight) {
            const kern = parseInt(kernValue, 10) || 0;
            const lBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness)!;
            const rBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness)!;
            const rsbL = pair.left.rsb ?? metrics.defaultRSB;
            const lsbR = pair.right.lsb ?? metrics.defaultLSB;
            const rightTranslateX = lBox.x + lBox.width + rsbL + kern + lsbR - rBox.x;
            
            const dist = Math.round(rSub.xHeight.minX + rightTranslateX - lSub.xHeight.maxX);
            setXHeightDistance(dist);
            if (!isXDistFocused) setXDistValue(String(dist));
        }
    }, [pair, kernValue, glyphDataMap, strokeThickness, metrics, isXDistFocused]);

    const handleXDistCommit = useCallback(() => {
        const newDist = parseInt(xDistValue, 10);
        if (!isNaN(newDist) && xHeightDistance !== null) {
            const delta = newDist - xHeightDistance;
            handleKernValueChange(String((parseInt(kernValue, 10) || 0) + delta));
        } else {
            setXDistValue(xHeightDistance !== null ? String(xHeightDistance) : 'N/A');
        }
    }, [xDistValue, xHeightDistance, kernValue, handleKernValueChange]);

    // --- Lifecycle ---
    useEffect(() => {
        setKernValue(String(initialValue));
        setIsDirty(false);
    }, [initialValue, pair]);

    useEffect(() => {
        if (!settings.isAutosaveEnabled || !isDirty) return;
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = window.setTimeout(handleSave, 800);
        return () => { if (debounceTimeout.current) clearTimeout(debounceTimeout.current); };
    }, [kernValue, isDirty, settings.isAutosaveEnabled, handleSave]);

    return {
        kernValue, setKernValue: handleKernValueChange,
        xDistValue, setXDistValue, handleXDistCommit,
        isDirty, isAutoKerning, handleAutoKern, handleSave,
        zoom, setZoom, viewOffset, setViewOffset,
        containerSize, setContainerSize, canvasDisplaySize, baseScale,
        isXDistFocused, setIsXDistFocused, isXDistHovered, setIsXDistHovered,
        isKernFocused, setIsKernFocused, isKernHovered, setIsKernHovered,
        showMeasurement: isXDistFocused || isXDistHovered || isKernFocused || isKernHovered
    };
};
