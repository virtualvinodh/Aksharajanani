
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, RecommendedKerning } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import { ZoomInIcon, ZoomOutIcon, SparklesIcon, SaveIcon, TrashIcon } from '../constants';
import { calculateAutoKerning } from '../services/kerningService';
import { renderPaths, getAccurateGlyphBBox, getGlyphSubBBoxes, BBox } from '../services/glyphRenderService';

interface KerningModalProps {
    pair: { left: Character, right: Character };
    isOpen: boolean;
    onClose: () => void;
    onSave: (value: number) => void;
    onRemove: () => void;
    initialValue: number;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    metrics: FontMetrics;
    settings: AppSettings;
    recommendedKerning: RecommendedKerning[] | null;
}

const KerningModal: React.FC<KerningModalProps> = ({
    pair, isOpen, onClose, onSave, onRemove, initialValue, glyphDataMap, strokeThickness, metrics, settings, recommendedKerning
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

    // New state and refs for dragging interaction
    const [isDragging, setIsDragging] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const rightGlyphBboxRef = useRef<{x: number, y: number, width: number, height: number} | null>(null);
    const dragState = useRef({ startX: 0, startValue: 0, scale: 1 });
    const [xHeightDistance, setXHeightDistance] = useState<number | null>(null);
    const [showInitialCue, setShowInitialCue] = useState(false);

    // NEW state for the editable dist input
    const [xDistInputValue, setXDistInputValue] = useState<string>('');
    const [isXDistFocused, setIsXDistFocused] = useState(false);
    const [isXDistHovered, setIsXDistHovered] = useState(false);
    const xDistInputRef = useRef<HTMLInputElement>(null);


    useEffect(() => { 
        if (isOpen) {
            setInputValue(String(initialValue));
            setIsDirty(false);
            setZoom(1);
            setIsDragging(false);
            setIsHovering(false);
            setShowInitialCue(true);
            const timer = setTimeout(() => setShowInitialCue(false), 1500);
            return () => clearTimeout(timer);
        }
    }, [isOpen, initialValue]);
    
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !isOpen) return;

        const resizeObserver = new ResizeObserver(() => {
            if (container) {
                const { width } = container.getBoundingClientRect();
                setCanvasSize({ width, height: width * 0.6 }); // Maintain a 5:3 aspect ratio
            }
        });

        resizeObserver.observe(container);

        // Set initial size
        const { width } = container.getBoundingClientRect();
        if (width > 0) {
            setCanvasSize({ width, height: width * 0.6 });
        }

        return () => resizeObserver.disconnect();
    }, [isOpen]);

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
        if (!isOpen || !settings.isAutosaveEnabled || !isDirty) {
            return;
        }

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        debounceTimeout.current = window.setTimeout(() => {
            handleSaveClick();
        }, 1000); // 1 second debounce

        return () => {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current);
            }
        };
    }, [inputValue, isDirty, settings.isAutosaveEnabled, handleSaveClick, isOpen]);

    const handleAutoKernSinglePair = async () => {
        setIsAutoKerning(true);
        try {
            const result = await calculateAutoKerning([pair], glyphDataMap, metrics, strokeThickness, () => {}, recommendedKerning);
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            const kernValue = result.get(key);
            if (kernValue !== undefined) {
                setInputValue(String(kernValue));
                setIsDirty(true);
            }
        } catch (error) {
            console.error("Auto-kerning failed for single pair:", error);
        } finally {
            setIsAutoKerning(false);
        }
    };
    
    const localKernValue = parseInt(inputValue, 10) || 0;

    // --- Drag Interaction Handlers ---
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mousePoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        if (rightGlyphBboxRef.current && 
            mousePoint.x >= rightGlyphBboxRef.current.x &&
            mousePoint.x <= rightGlyphBboxRef.current.x + rightGlyphBboxRef.current.width &&
            mousePoint.y >= rightGlyphBboxRef.current.y &&
            mousePoint.y <= rightGlyphBboxRef.current.y + rightGlyphBboxRef.current.height) {
            
            setIsDragging(true);
            dragState.current.startX = mousePoint.x;
            dragState.current.startValue = parseInt(inputValue, 10) || 0;
            e.preventDefault();
        }
    }, [inputValue]);
    
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mousePoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        if (isDragging) {
            const deltaX = mousePoint.x - dragState.current.startX;
            const scale = dragState.current.scale;
            if (scale > 0) {
                const kerningChange = Math.round(deltaX / scale);
                const newValue = dragState.current.startValue + kerningChange;
                setInputValue(String(newValue));
                setIsDirty(true);
            }
        } else {
             if (rightGlyphBboxRef.current && 
                mousePoint.x >= rightGlyphBboxRef.current.x &&
                mousePoint.x <= rightGlyphBboxRef.current.x + rightGlyphBboxRef.current.width &&
                mousePoint.y >= rightGlyphBboxRef.current.y &&
                mousePoint.y <= rightGlyphBboxRef.current.y + rightGlyphBboxRef.current.height) {
                setIsHovering(true);
            } else {
                setIsHovering(false);
            }
        }
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
        }
    }, [isDragging]);
    
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length !== 1 || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const touchPoint = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };

        if (rightGlyphBboxRef.current && 
            touchPoint.x >= rightGlyphBboxRef.current.x &&
            touchPoint.x <= rightGlyphBboxRef.current.x + rightGlyphBboxRef.current.width &&
            touchPoint.y >= rightGlyphBboxRef.current.y &&
            touchPoint.y <= rightGlyphBboxRef.current.y + rightGlyphBboxRef.current.height) {
            
            setIsDragging(true);
            dragState.current.startX = touchPoint.x;
            dragState.current.startValue = parseInt(inputValue, 10) || 0;
            e.preventDefault();
        }
    }, [inputValue]);
    
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging || e.touches.length !== 1 || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        const touchPoint = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        
        const deltaX = touchPoint.x - dragState.current.startX;
        const scale = dragState.current.scale;
        if (scale > 0) {
            const kerningChange = Math.round(deltaX / scale);
            const newValue = dragState.current.startValue + kerningChange;
            setInputValue(String(newValue));
            setIsDirty(true);
        }
    }, [isDragging]);

    const handleTouchEnd = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
        }
    }, [isDragging]);

    const getCursor = useCallback(() => {
        if (isDragging) return 'grabbing';
        if (isHovering || showInitialCue) return 'ew-resize';
        return 'default';
    }, [isDragging, isHovering, showInitialCue]);

    useEffect(() => {
        if (document.activeElement !== xDistInputRef.current) {
            setXDistInputValue(xHeightDistance !== null ? String(xHeightDistance) : 'N/A');
        }
    }, [xHeightDistance]);

    const handleXDistInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setXDistInputValue(e.target.value);
    };

    const handleXDistCommit = () => {
        const newDistance = parseInt(xDistInputValue, 10);
        if (!isNaN(newDistance) && xHeightDistance !== null) {
            const currentKernValue = parseInt(inputValue, 10) || 0;
            const distanceChange = newDistance - xHeightDistance;
            const newKernValue = currentKernValue + distanceChange;
            setInputValue(String(newKernValue));
            setIsDirty(true);
        } else {
            setXDistInputValue(xHeightDistance !== null ? String(xHeightDistance) : 'N/A');
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas || !isOpen || !canvasSize.width) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const { left: selectedLeft, right: selectedRight } = pair;
        const leftGlyph = glyphDataMap.get(selectedLeft.unicode);
        const rightGlyph = glyphDataMap.get(selectedRight.unicode);
        if (!leftGlyph || !rightGlyph) {
            setXHeightDistance(null);
            return;
        };

        const leftBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rightBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!leftBox || !rightBox) {
            setXHeightDistance(null);
            return;
        };
        
        // Calculate layout variables
        const rsbLeft = selectedLeft.rsb ?? metrics.defaultRSB;
        const lsbRight = selectedRight.lsb ?? metrics.defaultLSB;
        const leftMaxX = leftBox.x + leftBox.width;
        const rightMinX = rightBox.x;
        const rightStartTranslateX = leftMaxX + rsbLeft + localKernValue + lsbRight - rightMinX;
        
        // Calculate x-height distance
        const leftBoxes = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rightBoxes = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        
        if (leftBoxes && rightBoxes && leftBoxes.xHeight && rightBoxes.xHeight && leftBoxes.full && rightBoxes.full) {
            // Calculate translated X position for right glyph
            const rightXHeightTranslatedMinX = rightBoxes.xHeight.minX + rightStartTranslateX;
            const distance = Math.round(rightXHeightTranslatedMinX - leftBoxes.xHeight.maxX);
            setXHeightDistance(distance);
        } else {
            setXHeightDistance(null);
        }

        
        const totalContentWidth = (leftMaxX - leftBox.x) + rsbLeft + localKernValue + lsbRight + (rightBox.width);
        const drawingCanvasHeight = 700;
        
        if (totalContentWidth <= 0) return;
        
        const scale = Math.min(
            (canvasSize.width * 0.9) / totalContentWidth,
            (canvasSize.height * 0.8) / drawingCanvasHeight
        ) * zoom;
            
        if (!isFinite(scale) || scale <= 0) return;

        const finalWidth = totalContentWidth * scale;
        const finalHeight = drawingCanvasHeight * scale;
        const startX = (canvasSize.width - finalWidth) / 2 - (leftBox.x * scale);
        const startY = (canvasSize.height - finalHeight) / 2;
        
        ctx.save();
        ctx.translate(startX, startY);
        ctx.scale(scale, scale);
        
        const unscaledLineWidth = 1 / scale;

        // Draw Grid
        ctx.strokeStyle = theme === 'dark' ? 'rgba(74, 85, 104, 0.3)' : 'rgba(209, 213, 219, 0.5)';
        ctx.lineWidth = unscaledLineWidth / 2;
        const gridSize = 50;
        const gridWidth = totalContentWidth + leftBox.x + rightBox.x; 
        for (let x = -gridSize; x < gridWidth; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, drawingCanvasHeight); ctx.stroke();
        }
        for (let y = 0; y < drawingCanvasHeight; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(gridWidth, y); ctx.stroke();
        }

        // Draw Guides
        ctx.strokeStyle = theme === 'dark' ? '#818CF8' : '#6366F1';
        ctx.lineWidth = unscaledLineWidth;
        ctx.setLineDash([8 / scale, 6 / scale]);
        ctx.beginPath(); ctx.moveTo(-gridSize, metrics.topLineY); ctx.lineTo(gridWidth, metrics.topLineY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-gridSize, metrics.baseLineY); ctx.lineTo(gridWidth, metrics.baseLineY); ctx.stroke();
        ctx.setLineDash([]);
        
        const glyphColor = theme === 'dark' ? '#E2E8F0' : '#1F2937';
        const rightGlyphColor = isDragging || isHovering || showInitialCue ? (theme === 'dark' ? '#A78BFA' : '#8B5CF6') : glyphColor;

        // Draw left glyph
        ctx.save();
        renderPaths(ctx, leftGlyph.paths, { strokeThickness, color: glyphColor });
        ctx.restore();
        
        // Draw right glyph
        ctx.save();
        ctx.translate(rightStartTranslateX, 0);
        renderPaths(ctx, rightGlyph.paths, { strokeThickness, color: rightGlyphColor });
        ctx.restore();
        
        // --- Store BBox and Scale for interaction handlers ---
        const rightGlyphCanvasBbox = {
            x: startX + (rightStartTranslateX * scale) + (rightBox.x * scale),
            y: startY + (rightBox.y * scale),
            width: rightBox.width * scale,
            height: rightBox.height * scale
        };
        rightGlyphBboxRef.current = rightGlyphCanvasBbox;
        dragState.current.scale = scale;

        // Draw Debug Boxes
        if (settings.isDebugKerningEnabled) {
            ctx.save();
            ctx.lineWidth = 3 / scale;
            ctx.globalAlpha = 0.6;
            ctx.setLineDash([6 / scale, 3 / scale]);
        
            const drawSubBBoxesForGlyph = (glyphData: GlyphData, translationX = 0) => {
                const subBBoxes = getGlyphSubBBoxes(glyphData, metrics.baseLineY, metrics.topLineY, strokeThickness);
                if (!subBBoxes) return;
                
                const drawBox = (box: BBox | null, color: string) => {
                    if (!box) return;
                    ctx.strokeStyle = color;
                    ctx.strokeRect(box.minX + translationX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
                };
                
                drawBox(subBBoxes.ascender, 'rgba(59, 130, 246, 0.7)'); // blue
                drawBox(subBBoxes.xHeight, 'rgba(16, 185, 129, 0.7)'); // green
                drawBox(subBBoxes.descender, 'rgba(239, 68, 68, 0.7)'); // red
            };
        
            drawSubBBoxesForGlyph(leftGlyph);
            drawSubBBoxesForGlyph(rightGlyph, rightStartTranslateX);
        
            ctx.restore();
        }

        // --- Dimension Line Visualization ---
        // Show if debug enabled OR input interaction state active
        if ((settings.isDebugKerningEnabled || isXDistFocused || isXDistHovered) && leftBoxes && rightBoxes && leftBoxes.xHeight && rightBoxes.xHeight) {
            const yMid = (metrics.baseLineY + metrics.topLineY) / 2;
            const x1 = leftBoxes.xHeight.maxX;
            const x2 = rightBoxes.xHeight.minX + rightStartTranslateX;
            const dimensionColor = '#14b8a6'; // Teal-500

            ctx.save();
            ctx.strokeStyle = dimensionColor;
            ctx.fillStyle = dimensionColor;
            ctx.lineWidth = 2 / scale;
            ctx.beginPath();
            // Horizontal line
            ctx.moveTo(x1, yMid);
            ctx.lineTo(x2, yMid);
            
            // Vertical Ticks (End caps)
            const tickSize = 10 / scale;
            ctx.moveTo(x1, yMid - tickSize); ctx.lineTo(x1, yMid + tickSize);
            ctx.moveTo(x2, yMid - tickSize); ctx.lineTo(x2, yMid + tickSize);
            ctx.stroke();

            // Label
            if (xHeightDistance !== null) {
                ctx.font = `bold ${24/scale}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(String(xHeightDistance), (x1 + x2) / 2, yMid - (5/scale));
            }
            ctx.restore();
        }
        
        ctx.restore();

        if (isHovering || isDragging || showInitialCue) {
            const bbox = rightGlyphBboxRef.current;
            if (bbox) {
                ctx.save();
                // Dashed bounding box
                ctx.strokeStyle = '#6366F1';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
                ctx.setLineDash([]);
                
                // Move handle icon
                const centerX = bbox.x + bbox.width / 2;
                const centerY = bbox.y + bbox.height / 2;
                const handleRadius = 12; // A bit bigger to be visible
                
                ctx.fillStyle = 'rgba(99, 102, 241, 0.7)'; // semi-transparent
                ctx.strokeStyle = theme === 'dark' ? '#1F2937' : '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, handleRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw horizontal move arrows inside the circle
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                const arrowLength = 5;
                // Horizontal line
                ctx.moveTo(centerX - arrowLength, centerY);
                ctx.lineTo(centerX + arrowLength, centerY);
                // Right arrow head
                ctx.moveTo(centerX + arrowLength, centerY);
                ctx.lineTo(centerX + arrowLength - 3, centerY - 3);
                ctx.moveTo(centerX + arrowLength, centerY);
                ctx.lineTo(centerX + arrowLength - 3, centerY + 3);
                // Left arrow head
                ctx.moveTo(centerX - arrowLength, centerY);
                ctx.lineTo(centerX - arrowLength + 3, centerY - 3);
                ctx.moveTo(centerX - arrowLength, centerY);
                ctx.lineTo(centerX - arrowLength + 3, centerY + 3);
                ctx.stroke();
                
                ctx.restore();
            }
        }

    }, [pair, localKernValue, zoom, glyphDataMap, metrics, strokeThickness, theme, isOpen, canvasSize, isDragging, isHovering, settings.isDebugKerningEnabled, showInitialCue, isXDistFocused, isXDistHovered, xHeightDistance]);

    if (!isOpen) return null;
    
    const modalTitle = settings.editorMode === 'advanced' ? t('adjustKerning') : t('adjustSpacing');
    const inputLabel = settings.editorMode === 'advanced' ? t('kerning') : t('spacing');

    return (
        <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{modalTitle}</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={handleAutoKernSinglePair} disabled={isAutoKerning} title={t('autoKern')} className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:bg-teal-400 disabled:cursor-wait">
                           {isAutoKerning ? (
                               <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           ) : ( <SparklesIcon /> )}
                           <span className="hidden sm:inline">{t('autoKern')}</span>
                        </button>
                        {!settings.isAutosaveEnabled && isDirty && (
                            <button onClick={handleSaveClick} title={t('save')} className="p-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
                                <SaveIcon />
                            </button>
                        )}
                        <button onClick={onRemove} title={t('removeKerning')} className="p-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
                            <TrashIcon />
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-800 dark:hover:text-white text-3xl leading-none">&times;</button>
                    </div>
                </div>

                <div ref={containerRef} className="mb-4 bg-gray-100 dark:bg-gray-900 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 w-full">
                    <canvas 
                        ref={canvasRef} 
                        width={canvasSize.width} 
                        height={canvasSize.height}
                        style={{ cursor: getCursor(), touchAction: 'none' }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchEnd}
                    />
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setZoom(z => z * 1.2)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"><ZoomInIcon/></button>
                    <button onClick={() => setZoom(z => z / 1.2)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"><ZoomOutIcon/></button>
                    <div className="flex-grow flex items-center justify-center gap-4">
                        {settings.editorMode === 'advanced' && (
                            <div className="flex items-center gap-2"> 
                                <label htmlFor="kerning-value" className="text-sm font-medium text-gray-700 dark:text-gray-300">{inputLabel}:</label>
                                <input
                                    id="kerning-value"
                                    type="text"
                                    value={inputValue}
                                    onChange={handleInputChange}
                                    className="w-20 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        )}
                        <div className={`flex items-center gap-2 ${isXDistFocused || isXDistHovered ? 'text-teal-600 dark:text-teal-400' : ''}`}>
                            <label htmlFor="xheight-distance" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                {settings.editorMode === 'simple' ? inputLabel : t('xDist')}
                                <span className="text-xs opacity-50">↔</span>
                            </label>
                            <input
                                ref={xDistInputRef}
                                id="xheight-distance"
                                type="text"
                                value={xDistInputValue}
                                onChange={handleXDistInputChange}
                                onBlur={(e) => { handleXDistCommit(); setIsXDistFocused(false); }}
                                onFocus={() => setIsXDistFocused(true)}
                                onMouseEnter={() => setIsXDistHovered(true)}
                                onMouseLeave={() => setIsXDistHovered(false)}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className={`w-20 bg-white dark:bg-gray-900 border rounded-md p-2 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:outline-none transition-colors ${
                                    isXDistFocused || isXDistHovered 
                                        ? 'border-teal-500 ring-teal-500' 
                                        : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500'
                                }`}
                                title="Distance between x-height bounding boxes"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(KerningModal);
