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
    const [baseScale, setBaseScale] = useState(1); // New state for stabilized scale
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const debounceTimeout = useRef<number | null>(null);
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    // Dragging state
    const [isDragging, setIsDragging] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [showInitialCue, setShowInitialCue] = useState(false);
    const rightGlyphBboxRef = useRef<{x: number, y: number, width: number, height: number} | null>(null);
    const dragState = useRef({ startX: 0, startValue: 0, scale: 1 });
    const [xHeightDistance, setXHeightDistance] = useState<number | null>(null);

    // Input state
    const [xDistInputValue, setXDistInputValue] = useState<string>('');
    const [isXDistFocused, setIsXDistFocused] = useState(false);
    const [isXDistHovered, setIsXDistHovered] = useState(false);
    const xDistInputRef = useRef<HTMLInputElement>(null);

    // Sync local state with props when navigating
    useEffect(() => {
        setInputValue(String(initialValue));
        setIsDirty(false);
        setIsDragging(false);
        setIsHovering(false);
        
        setShowInitialCue(true);
        const timer = setTimeout(() => setShowInitialCue(false), 1500);
        return () => clearTimeout(timer);
    }, [initialValue, pair]);

    // Resize observer
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateSize = () => {
            const rect = container.getBoundingClientRect();
            setCanvasSize({ 
                width: Math.floor(rect.width), 
                height: Math.floor(rect.height) 
            });
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    // Calculate baseScale only when pair or canvas size changes
    useEffect(() => {
        if (canvasSize.width === 0 || canvasSize.height === 0) return;

        const leftGlyph = glyphDataMap.get(pair.left.unicode!);
        const rightGlyph = glyphDataMap.get(pair.right.unicode!);
        if (!leftGlyph || !rightGlyph) return;

        const leftBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rightBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!leftBox || !rightBox) return;

        // Use a "neutral" total width for scaling so the scale doesn't change as user kerns
        // Reference width = combined widths + neutral space (0 kern)
        const neutralKern = 0;
        const rsbLeft = pair.left.rsb ?? metrics.defaultRSB;
        const lsbRight = pair.right.lsb ?? metrics.defaultLSB;
        const totalRefWidth = (leftBox.width) + rsbLeft + neutralKern + lsbRight + (rightBox.width);
        
        const fitScale = Math.min(
            (canvasSize.width * 0.8) / totalRefWidth, // Use 80% instead of 90% for safer margin
            (canvasSize.height * 0.8) / 700
        );

        setBaseScale(fitScale);
    }, [pair, canvasSize, glyphDataMap, metrics, strokeThickness]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '' || val === '-' || /^-?\d*$/.test(val)) {
            setInputValue(val);
            setIsDirty(true);
        }
    };

    const performSave = useCallback((value: number) => {
        onSave(value);
        setIsDirty(false);
    }, [onSave]);

    const handleSaveClick = useCallback(() => {
        const parsed = parseInt(inputValue, 10);
        performSave(isNaN(parsed) ? 0 : parsed);
    }, [inputValue, performSave]);

    // Autosave logic
    useEffect(() => {
        if (!settings.isAutosaveEnabled || !isDirty) return;
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = window.setTimeout(() => {
            handleSaveClick();
        }, 1000);
        return () => { if (debounceTimeout.current) clearTimeout(debounceTimeout.current); };
    }, [inputValue, isDirty, settings.isAutosaveEnabled, handleSaveClick]);

    const handleAutoKernSinglePair = async () => {
        setIsAutoKerning(true);
        try {
            const result = await calculateAutoKerning([pair], glyphDataMap, metrics, strokeThickness, () => {}, recommendedKerning);
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            const kernValue = result.get(key);
            if (kernValue !== undefined) {
                setInputValue(String(kernValue));
                setIsDirty(true);
                if(settings.isAutosaveEnabled) {
                     onSave(kernValue);
                     setIsDirty(false);
                }
            }
        } catch (error) {
            console.error("Auto-kerning failed:", error);
        } finally {
            setIsAutoKerning(false);
        }
    };

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
            
            if (e.key === 'ArrowLeft') {
                if (hasPrev) onNavigate('prev');
            } else if (e.key === 'ArrowRight') {
                if (hasNext) onNavigate('next');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasPrev, hasNext, onNavigate]);


    // --- Canvas Interaction ---
    const localKernValue = parseInt(inputValue, 10) || 0;

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
            const deltaX = pt.x - dragState.current.startX;
            if (dragState.current.scale > 0) {
                const change = Math.round(deltaX / dragState.current.scale);
                const newVal = dragState.current.startValue + change;
                setInputValue(String(newVal));
                setIsDirty(true);
            }
        } else {
            if (rightGlyphBboxRef.current &&
                pt.x >= rightGlyphBboxRef.current.x && pt.x <= rightGlyphBboxRef.current.x + rightGlyphBboxRef.current.width &&
                pt.y >= rightGlyphBboxRef.current.y && pt.y <= rightGlyphBboxRef.current.y + rightGlyphBboxRef.current.height) {
                setIsHovering(true);
            } else {
                setIsHovering(false);
            }
        }
    }, [isDragging]);

    const handleMouseUp = () => setIsDragging(false);
    
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length !== 1 || !canvasRef.current || !rightGlyphBboxRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const pt = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };

        if (pt.x >= rightGlyphBboxRef.current.x && pt.x <= rightGlyphBboxRef.current.x + rightGlyphBboxRef.current.width &&
            pt.y >= rightGlyphBboxRef.current.y && pt.y <= rightGlyphBboxRef.current.y + rightGlyphBboxRef.current.height) {
            setIsDragging(true);
            dragState.current.startX = pt.x;
            dragState.current.startValue = parseInt(inputValue, 10) || 0;
            e.preventDefault();
        }
    }, [inputValue]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging || e.touches.length !== 1 || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const pt = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        
        const deltaX = pt.x - dragState.current.startX;
        if (dragState.current.scale > 0) {
            const change = Math.round(deltaX / dragState.current.scale);
            const newVal = dragState.current.startValue + change;
            setInputValue(String(newVal));
            setIsDirty(true);
        }
    }, [isDragging]);

    // X-Dist Logic
    useEffect(() => {
        if (document.activeElement !== xDistInputRef.current) {
            setXDistInputValue(xHeightDistance !== null ? String(xHeightDistance) : 'N/A');
        }
    }, [xHeightDistance]);

    const handleXDistCommit = () => {
        const newDist = parseInt(xDistInputValue, 10);
        if (!isNaN(newDist) && xHeightDistance !== null) {
            const current = parseInt(inputValue, 10) || 0;
            const diff = newDist - xHeightDistance;
            setInputValue(String(current + diff));
            setIsDirty(true);
        } else {
            setXDistInputValue(xHeightDistance !== null ? String(xHeightDistance) : 'N/A');
        }
    };

    // --- Drawing ---
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas || canvasSize.width === 0) return;

        // Sync internal resolution with DOM size
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const leftGlyph = glyphDataMap.get(pair.left.unicode!);
        const rightGlyph = glyphDataMap.get(pair.right.unicode!);
        if (!leftGlyph || !rightGlyph) { setXHeightDistance(null); return; }

        const leftBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rightBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!leftBox || !rightBox) { setXHeightDistance(null); return; }

        const rsbLeft = pair.left.rsb ?? metrics.defaultRSB;
        const lsbRight = pair.right.lsb ?? metrics.defaultLSB;
        const leftMaxX = leftBox.x + leftBox.width;
        const rightMinX = rightBox.x;
        const rightStartTranslateX = leftMaxX + rsbLeft + localKernValue + lsbRight - rightMinX;

        // Calculate x-height distance
        const leftSubBoxes = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rightSubBoxes = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        
        if (leftSubBoxes?.xHeight && rightSubBoxes?.xHeight) {
            const rightXMin = rightSubBoxes.xHeight.minX + rightStartTranslateX;
            setXHeightDistance(Math.round(rightXMin - leftSubBoxes.xHeight.maxX));
        } else {
            setXHeightDistance(null);
        }

        // Apply Stabilized Scale
        const totalContentWidth = (leftMaxX - leftBox.x) + rsbLeft + localKernValue + lsbRight + (rightBox.width);
        const finalScale = baseScale * zoom;
        
        const tx = (canvasSize.width - (totalContentWidth * finalScale)) / 2 - (leftBox.x * finalScale);
        const ty = (canvasSize.height - (700 * finalScale)) / 2;
        
        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(finalScale, finalScale);
        
        const unscaledLineWidth = 1 / finalScale;

        // Guides
        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        ctx.lineWidth = unscaledLineWidth;
        ctx.setLineDash([8 / finalScale, 6 / finalScale]);
        const guideW = totalContentWidth + leftBox.x + rightBox.x + 1000;
        ctx.beginPath(); ctx.moveTo(-500, metrics.topLineY); ctx.lineTo(guideW, metrics.topLineY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-500, metrics.baseLineY); ctx.lineTo(guideW, metrics.baseLineY); ctx.stroke();
        ctx.setLineDash([]);

        const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
        const rightColor = isDragging || isHovering || showInitialCue ? (theme === 'dark' ? '#A78BFA' : '#8B5CF6') : glyphColor;

        ctx.save();
        renderPaths(ctx, leftGlyph.paths, { strokeThickness, color: glyphColor });
        ctx.restore();

        ctx.save();
        ctx.translate(rightStartTranslateX, 0);
        renderPaths(ctx, rightGlyph.paths, { strokeThickness, color: rightColor });
        ctx.restore();

        // Store Hit Box
        rightGlyphBboxRef.current = {
            x: tx + (rightStartTranslateX * finalScale) + (rightBox.x * finalScale),
            y: ty + (rightBox.y * finalScale),
            width: rightBox.width * finalScale,
            height: rightBox.height * finalScale
        };
        dragState.current.scale = finalScale;

        // Dimension Line
        if ((settings.isDebugKerningEnabled || isXDistFocused || isXDistHovered) && leftSubBoxes?.xHeight && rightSubBoxes?.xHeight) {
            const yMid = (metrics.baseLineY + metrics.topLineY) / 2;
            const x1 = leftSubBoxes.xHeight.maxX;
            const x2 = rightSubBoxes.xHeight.minX + rightStartTranslateX;
            const color = '#14b8a6';

            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2 / finalScale;
            ctx.beginPath();
            ctx.moveTo(x1, yMid); ctx.lineTo(x2, yMid);
            const tick = 10 / finalScale;
            ctx.moveTo(x1, yMid - tick); ctx.lineTo(x1, yMid + tick);
            ctx.moveTo(x2, yMid - tick); ctx.lineTo(x2, yMid + tick);
            ctx.stroke();
            
            if (xHeightDistance !== null) {
                ctx.font = `bold ${24/finalScale}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText(String(xHeightDistance), (x1+x2)/2, yMid - (5/finalScale));
            }
            ctx.restore();
        }
        
        // Debug Boxes
        if (settings.isDebugKerningEnabled) {
            ctx.save();
            ctx.lineWidth = 3 / finalScale;
            ctx.globalAlpha = 0.6;
            const drawBox = (b: BBox | null, c: string, tx = 0) => {
                if (!b) return;
                ctx.strokeStyle = c;
                ctx.strokeRect(b.minX + tx, b.minY, b.maxX - b.minX, b.maxY - b.minY);
            };
            drawBox(leftSubBoxes?.ascender, 'blue');
            drawBox(leftSubBoxes?.xHeight, 'green');
            drawBox(leftSubBoxes?.descender, 'red');
            drawBox(rightSubBoxes?.ascender, 'blue', rightStartTranslateX);
            drawBox(rightSubBoxes?.xHeight, 'green', rightStartTranslateX);
            drawBox(rightSubBoxes?.descender, 'red', rightStartTranslateX);
            ctx.restore();
        }

        ctx.restore();

        // Hover UI
        if (isHovering || isDragging || showInitialCue) {
             const bbox = rightGlyphBboxRef.current;
             ctx.save();
             ctx.strokeStyle = '#6366F1'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
             ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
             const cx = bbox.x + bbox.width/2; const cy = bbox.y + bbox.height/2;
             ctx.fillStyle = 'rgba(99, 102, 241, 0.7)'; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI*2); ctx.fill(); ctx.stroke();
             ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.beginPath(); const arrowLength = 5;
             ctx.moveTo(cx - arrowLength, cy); ctx.lineTo(cx + arrowLength, cy);
             ctx.moveTo(cx + arrowLength, cy); ctx.lineTo(cx + arrowLength - 3, cy - 3); ctx.moveTo(cx + arrowLength, cy); ctx.lineTo(cx + arrowLength - 3, cy + 3);
             ctx.moveTo(cx - arrowLength, cy); ctx.lineTo(cx - arrowLength + 3, cy - 3); ctx.moveTo(cx - arrowLength, cy); ctx.lineTo(cx - arrowLength + 3, cy + 3);
             ctx.stroke(); ctx.restore();
        }
    }, [pair, localKernValue, zoom, baseScale, glyphDataMap, metrics, strokeThickness, theme, canvasSize, isDragging, isHovering, settings.isDebugKerningEnabled, xHeightDistance, isXDistHovered, isXDistFocused, showInitialCue, glyphVersion]);

    return (
        <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800 animate-fade-in-up">
            <KerningEditorHeader 
                pair={pair} 
                onClose={onClose} 
                onNavigate={onNavigate} 
                hasPrev={hasPrev} 
                hasNext={hasNext} 
                onAutoKern={handleAutoKernSinglePair} 
                isAutoKerning={isAutoKerning} 
                onSave={handleSaveClick} 
                onRemove={onRemove} 
                isDirty={isDirty} 
                isAutosaveEnabled={settings.isAutosaveEnabled} 
            />

            <KerningEditorWorkspace 
                isLargeScreen={isLargeScreen}
                canvasRef={canvasRef}
                containerRef={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onZoom={f => setZoom(z => Math.max(0.1, Math.min(10, z * f)))}
                kernValue={inputValue}
                onKernChange={handleInputChange}
                isKernDirty={isDirty}
                xDistValue={xDistInputValue}
                onXDistChange={e => setXDistInputValue(e.target.value)}
                onXDistCommit={handleXDistCommit}
                isXDistFocused={isXDistFocused}
                isXDistHovered={isXDistHovered}
                onXDistFocus={setIsXDistFocused}
                onXDistHover={setIsXDistHovered}
                xDistInputRef={xDistInputRef}
            />
        </div>
    );
};

export default React.memo(KerningEditorPage);