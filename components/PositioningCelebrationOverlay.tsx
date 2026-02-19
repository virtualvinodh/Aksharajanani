
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GlyphData, MarkPositioningMap, Path, Point } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { DRAWING_CANVAS_SIZE, RightArrowIcon } from '../constants';

interface PositioningCelebrationOverlayProps {
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    onProceed: () => void;
    onClose: () => void;
    isFinalMilestone?: boolean;
}

interface AnimationPair {
    basePaths: Path[];
    markPaths: Path[];
    targetOffset: Point;
    startOffset: Point;
    screenPosition: Point; // Normalized 0-1
    scale: number;
}

const PositioningCelebrationOverlay: React.FC<PositioningCelebrationOverlayProps> = ({ 
    glyphDataMap, markPositioningMap, onProceed, onClose, isFinalMilestone = false
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const [opacity, setOpacity] = useState(0);

    const easeOutBack = (x: number): number => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    };

    const pairsToAnimate = useMemo(() => {
        const pairs: AnimationPair[] = [];
        const entries = Array.from(markPositioningMap.entries());
        
        // Shuffle and pick up to 15
        const selectedEntries = entries.sort(() => 0.5 - Math.random()).slice(0, 15);
        const cols = 5;
        const rows = Math.ceil(selectedEntries.length / cols) || 1;
        
        selectedEntries.forEach((entry, index) => {
            const [key, offset] = entry;
            const [baseUni, markUni] = key.split('-').map(Number);
            const baseGlyph = glyphDataMap.get(baseUni);
            const markGlyph = glyphDataMap.get(markUni);

            if (baseGlyph && markGlyph) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 300 + Math.random() * 500;
                const startOffset = {
                    x: offset.x + Math.cos(angle) * dist,
                    y: offset.y + Math.sin(angle) * dist
                };

                const col = index % cols;
                const row = Math.floor(index / cols);
                
                pairs.push({
                    basePaths: baseGlyph.paths,
                    markPaths: markGlyph.paths,
                    targetOffset: offset,
                    startOffset: startOffset,
                    screenPosition: { 
                        x: (col + 0.5) / cols, 
                        y: (row + 0.5) / rows 
                    }, 
                    scale: 0.15 
                });
            }
        });
        return pairs;
    }, [glyphDataMap, markPositioningMap]);

    useEffect(() => {
        setTimeout(() => setOpacity(1), 100);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const startTime = performance.now();
        const duration = 2000;
        
        let animationId: number;

        const draw = (time: number) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutBack(progress);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = theme === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cellW = canvas.width / 5;
            const cellH = canvas.height / 3;
            const scaleBase = Math.min(cellW, cellH) / DRAWING_CANVAS_SIZE * 0.5;

            pairsToAnimate.forEach(pair => {
                const { basePaths, markPaths, targetOffset, startOffset, screenPosition } = pair;
                
                const currentX = startOffset.x + (targetOffset.x - startOffset.x) * easedProgress;
                const currentY = startOffset.y + (targetOffset.y - startOffset.y) * easedProgress;
                
                const cx = screenPosition.x * canvas.width;
                const cy = screenPosition.y * canvas.height;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(scaleBase, scaleBase);
                ctx.translate(-500, -500);

                renderPaths(ctx, basePaths, { 
                    strokeThickness: 30, 
                    color: theme === 'dark' ? '#4b5563' : '#94a3b8' 
                });

                ctx.save();
                ctx.translate(currentX, currentY);
                
                if (progress >= 0.9) {
                    const glowIntensity = (progress - 0.9) * 10 * 20;
                    ctx.shadowBlur = glowIntensity;
                    ctx.shadowColor = theme === 'dark' ? '#818cf8' : '#4f46e5';
                }

                renderPaths(ctx, markPaths, { 
                    strokeThickness: 30,
                    color: theme === 'dark' ? '#818cf8' : '#4f46e5' 
                });
                ctx.restore();
                ctx.restore();
            });

            if (progress < 1) {
                animationId = requestAnimationFrame(draw);
            }
        };
        
        animationId = requestAnimationFrame(draw);

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [pairsToAnimate, theme]);

    const title = isFinalMilestone ? "Engineering Complete!" : "Perfect Alignment!";
    const message = isFinalMilestone 
        ? "Your marks and base letters are perfectly aligned. Your font works, but you can make it beautiful by checking spacing."
        : "Your marks are now correctly anchored to their base characters. The script is taking shape!";
    
    const buttonText = isFinalMilestone ? "Finish & Export" : "Next: Kerning";
    const secondaryText = isFinalMilestone ? "Fine-tune Spacing" : "Stay here for now";

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-1000" style={{ opacity }}>
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
            <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-700 max-w-md text-center transform transition-transform duration-500 scale-100 animate-pop-in z-10">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✨</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
                    {message}
                </p>
                <div className="flex flex-col gap-3">
                    <button onClick={onProceed} className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                        <span>{buttonText}</span>
                        <RightArrowIcon className="w-5 h-5" />
                    </button>
                    <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline">
                        {secondaryText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PositioningCelebrationOverlay;
