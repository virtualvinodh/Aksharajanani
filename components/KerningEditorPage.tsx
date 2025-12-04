
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, RecommendedKerning } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import { ZoomInIcon, ZoomOutIcon, SparklesIcon, SaveIcon, TrashIcon, BackIcon, LeftArrowIcon, RightArrowIcon, UndoIcon } from '../constants';
import { calculateAutoKerning } from '../services/kerningService';
import { renderPaths, getAccurateGlyphBBox, getGlyphSubBBoxes, BoundingBox, BBox } from '../services/glyphRenderService';
import { VEC } from '../utils/vectorUtils';
import { useMediaQuery } from '../hooks/useMediaQuery';

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
    const { theme } = useTheme();
    const [inputValue, setInputValue] = useState(String(initialValue));
    const [isDirty, setIsDirty] = useState(false);
    const [isAutoKerning, setIsAutoKerning] = useState(false);
    const [zoom, setZoom] = useState(1);
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
        // Reset view state on nav
        setIsDragging(false);
        setIsHovering(false);
        
        // Trigger visual cue
        setShowInitialCue(true);
        const timer = setTimeout(() => setShowInitialCue(false), 1500);
        return () => clearTimeout(timer);
    }, [initialValue, pair]);

    // Resize observer
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateSize = () => {
            const { width, height } = container.getBoundingClientRect();
            setCanvasSize({ width, height });
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

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
                     // Immediate save for button action
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

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const leftGlyph = glyphDataMap.get(pair.left.unicode);
        const rightGlyph = glyphDataMap.get(pair.right.unicode);
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

        // Auto-fit logic
        const totalContentWidth = (leftMaxX - leftBox.x) + rsbLeft + localKernValue + lsbRight + (rightBox.width);
        if (totalContentWidth <= 0) return;

        const visWidth = totalContentWidth;
        const visHeight = 700; // Reference height from drawing canvas size
        
        const fitScale = Math.min(
            (canvasSize.width * 0.9) / visWidth,
            (canvasSize.height * 0.9) / visHeight
        ) * zoom;
        
        const tx = (canvasSize.width - visWidth * fitScale) / 2 - (leftBox.x * fitScale);
        const ty = (canvasSize.height - visHeight * fitScale) / 2;
        
        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(fitScale, fitScale);
        
        const unscaledLineWidth = 1 / fitScale;

        // Guides
        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        ctx.lineWidth = unscaledLineWidth;
        ctx.setLineDash([8 / fitScale, 6 / fitScale]);
        const guideW = visWidth + leftBox.x + rightBox.x;
        ctx.beginPath(); ctx.moveTo(-500, metrics.topLineY); ctx.lineTo(guideW + 500, metrics.topLineY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-500, metrics.baseLineY); ctx.lineTo(guideW + 500, metrics.baseLineY); ctx.stroke();
        ctx.setLineDash([]);

        const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
        // Use showInitialCue to trigger highlight
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
            x: tx + (rightStartTranslateX * fitScale) + (rightBox.x * fitScale),
            y: ty + (rightBox.y * fitScale),
            width: rightBox.width * fitScale,
            height: rightBox.height * fitScale
        };
        dragState.current.scale = fitScale;

        // Dimension Line
        if ((settings.isDebugKerningEnabled || isXDistFocused || isXDistHovered) && leftSubBoxes?.xHeight && rightSubBoxes?.xHeight) {
            const yMid = (metrics.baseLineY + metrics.topLineY) / 2;
            const x1 = leftSubBoxes.xHeight.maxX;
            const x2 = rightSubBoxes.xHeight.minX + rightStartTranslateX;
            const color = '#14b8a6';

            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2 / fitScale;
            ctx.beginPath();
            ctx.moveTo(x1, yMid); ctx.lineTo(x2, yMid);
            const tick = 10 / fitScale;
            ctx.moveTo(x1, yMid - tick); ctx.lineTo(x1, yMid + tick);
            ctx.moveTo(x2, yMid - tick); ctx.lineTo(x2, yMid + tick);
            ctx.stroke();
            
            if (xHeightDistance !== null) {
                ctx.font = `bold ${24/fitScale}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText(String(xHeightDistance), (x1+x2)/2, yMid - (5/fitScale));
            }
            ctx.restore();
        }
        
        // Debug Boxes
        if (settings.isDebugKerningEnabled) {
            ctx.save();
            ctx.lineWidth = 3 / fitScale;
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

        // Hover UI overlay (in DOM space)
        if (isHovering || isDragging || showInitialCue) {
             const bbox = rightGlyphBboxRef.current;
             ctx.save();
             ctx.strokeStyle = '#6366F1';
             ctx.lineWidth = 1;
             ctx.setLineDash([4, 4]);
             ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
             
             const cx = bbox.x + bbox.width/2;
             const cy = bbox.y + bbox.height/2;
             ctx.fillStyle = 'rgba(99, 102, 241, 0.7)';
             ctx.setLineDash([]);
             ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI*2); ctx.fill();
             ctx.stroke();
             
             // Draw horizontal move arrows inside the circle
             ctx.strokeStyle = '#FFFFFF';
             ctx.lineWidth = 2;
             ctx.beginPath();
             const arrowLength = 5;
             // Horizontal line
             ctx.moveTo(cx - arrowLength, cy); ctx.lineTo(cx + arrowLength, cy);
             // Right arrow head
             ctx.moveTo(cx + arrowLength, cy); ctx.lineTo(cx + arrowLength - 3, cy - 3);
             ctx.moveTo(cx + arrowLength, cy); ctx.lineTo(cx + arrowLength - 3, cy + 3);
             // Left arrow head
             ctx.moveTo(cx - arrowLength, cy); ctx.lineTo(cx - arrowLength + 3, cy - 3);
             ctx.moveTo(cx - arrowLength, cy); ctx.lineTo(cx - arrowLength + 3, cy + 3);
             ctx.stroke();

             ctx.restore();
        }
    }, [pair, localKernValue, zoom, glyphDataMap, metrics, strokeThickness, theme, canvasSize, isDragging, isHovering, settings.isDebugKerningEnabled, xHeightDistance, isXDistHovered, isXDistFocused, showInitialCue, glyphVersion]);


    const navButtonClass = "p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors";
    const inputLabel = settings.editorMode === 'advanced' ? t('kerning') : t('spacing');

    const controls = (
        <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-700/50 px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 relative">
                <label htmlFor="kern-input" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {inputLabel}:
                </label>
                <div className="relative">
                    <input
                        id="kern-input"
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        className="w-16 p-1 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-600 font-mono text-center text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    {isDirty && <span className="absolute -top-1 -right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span></span>}
                </div>
            </div>

            <div className={`flex items-center gap-2 ${isXDistFocused || isXDistHovered ? 'text-teal-600 dark:text-teal-400' : 'text-gray-500 dark:text-gray-400'}`}>
                <label htmlFor="xdist-input" className="text-sm font-medium flex items-center gap-1 cursor-help" title={t('xDist')}>
                    <span className="font-mono text-xs">x</span><span className="text-[10px] opacity-70">↔</span>
                </label>
                <input
                    ref={xDistInputRef}
                    id="xdist-input"
                    type="text"
                    value={xDistInputValue}
                    onChange={e => setXDistInputValue(e.target.value)}
                    onBlur={() => { handleXDistCommit(); setIsXDistFocused(false); }}
                    onFocus={() => setIsXDistFocused(true)}
                    onMouseEnter={() => setIsXDistHovered(true)}
                    onMouseLeave={() => setIsXDistHovered(false)}
                    onKeyDown={e => e.key === 'Enter' && xDistInputRef.current?.blur()}
                    className={`w-14 p-1 border rounded-md bg-white dark:bg-gray-900 font-mono text-center text-xs transition-colors focus:outline-none ${isXDistFocused ? 'border-teal-500 ring-2 ring-teal-500' : 'dark:border-gray-600'}`}
                />
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full w-full bg-white dark:bg-gray-800">
            <header className="flex flex-col w-full flex-shrink-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 z-20">
                 <div className="flex items-center justify-between p-2 sm:p-4 gap-4">
                    {/* Left: Back */}
                    <div className="flex-shrink-0">
                        <button onClick={onClose} className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                            <BackIcon /><span className="hidden sm:inline">{t('back')}</span>
                        </button>
                    </div>

                    {/* Center: Navigation */}
                    <div className="flex items-center gap-2 sm:gap-4 flex-grow justify-center">
                        <button onClick={() => onNavigate('prev')} disabled={!hasPrev} className={navButtonClass}><LeftArrowIcon /></button>
                        <div className="text-center min-w-[80px]">
                            <h2 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                {pair.left.name} + {pair.right.name}
                            </h2>
                        </div>
                        <button onClick={() => onNavigate('next')} disabled={!hasNext} className={navButtonClass}><RightArrowIcon /></button>
                    </div>

                    {/* Right: Actions (Desktop) */}
                    <div className="hidden md:flex items-center gap-2">
                         {controls}
                         <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
                         <button onClick={handleAutoKernSinglePair} disabled={isAutoKerning} title={t('autoKern')} className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-teal-400 transition-colors shadow-sm">
                            {isAutoKerning ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <SparklesIcon />}
                        </button>
                        {!settings.isAutosaveEnabled && (
                            <button onClick={handleSaveClick} title={t('save')} disabled={!isDirty} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors shadow-sm">
                                <SaveIcon />
                            </button>
                        )}
                        <button onClick={onRemove} title={t('removeKerning')} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm">
                            <TrashIcon />
                        </button>
                    </div>

                    {/* Right: Actions (Mobile - Minimal) */}
                    <div className="flex md:hidden items-center gap-2">
                         {!settings.isAutosaveEnabled && (
                            <button onClick={handleSaveClick} title={t('save')} disabled={!isDirty} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                                <SaveIcon />
                            </button>
                        )}
                        <button onClick={onRemove} title={t('removeKerning')} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                            <TrashIcon />
                        </button>
                    </div>
                </div>
                
                {/* Mobile Controls Bar */}
                <div className="md:hidden flex items-center justify-center gap-3 p-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-x-auto">
                    {controls}
                    <button onClick={handleAutoKernSinglePair} disabled={isAutoKerning} title={t('autoKern')} className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-teal-400 flex-shrink-0">
                        {isAutoKerning ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <SparklesIcon />}
                    </button>
                </div>
            </header>

            {/* Main Canvas */}
            <main className="flex-grow relative bg-gray-100 dark:bg-gray-900 overflow-hidden" ref={containerRef}>
                 <canvas
                    ref={canvasRef}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    className="w-full h-full cursor-ew-resize"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUp}
                />
                <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                    <button onClick={() => setZoom(z => z * 1.2)} className="p-2 bg-white dark:bg-gray-800 rounded-md shadow hover:bg-gray-100 dark:hover:bg-gray-700"><ZoomInIcon/></button>
                    <button onClick={() => setZoom(z => z / 1.2)} className="p-2 bg-white dark:bg-gray-800 rounded-md shadow hover:bg-gray-100 dark:hover:bg-gray-700"><ZoomOutIcon/></button>
                </div>
            </main>
        </div>
    );
};

export default React.memo(KerningEditorPage);
