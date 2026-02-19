
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Character, GlyphData, KerningMap } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox } from '../services/glyphRenderService';
import { DRAWING_CANVAS_SIZE, RightArrowIcon } from '../constants';

interface KerningCelebrationOverlayProps {
    glyphDataMap: Map<number, GlyphData>;
    kerningMap: KerningMap;
    onProceed: () => void;
    onClose: () => void;
    allCharsByUnicode: Map<number, Character>;
}

interface AnimationPair {
    leftPaths: any[];
    rightPaths: any[];
    leftWidth: number;
    rightWidth: number;
    targetKern: number;
    screenPosition: { x: number, y: number };
    scale: number;
    color: string;
}

const KerningCelebrationOverlay: React.FC<KerningCelebrationOverlayProps> = ({ 
    glyphDataMap, kerningMap, onProceed, onClose, allCharsByUnicode 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const [opacity, setOpacity] = useState(0);

    // Easing: elastic snap
    const easeOutElastic = (x: number): number => {
        const c4 = (2 * Math.PI) / 3;
        return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    };

    const pairsToAnimate = useMemo(() => {
        const pairs: AnimationPair[] = [];
        const entries = Array.from(kerningMap.entries());
        
        // Pick random pairs
        const selectedEntries = entries.sort(() => 0.5 - Math.random()).slice(0, 8);
        const palette = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];

        selectedEntries.forEach((entry, index) => {
            const [key, val] = entry;
            const [lUni, rUni] = key.split('-').map(Number);
            const lGlyph = glyphDataMap.get(lUni);
            const rGlyph = glyphDataMap.get(rUni);
            const lChar = allCharsByUnicode.get(lUni);
            const rChar = allCharsByUnicode.get(rUni);

            if (lGlyph && rGlyph && lChar && rChar) {
                const lBox = getAccurateGlyphBBox(lGlyph.paths, 20);
                const rBox = getAccurateGlyphBBox(rGlyph.paths, 20);

                if (lBox && rBox) {
                    // Random screen position
                    const x = 0.2 + Math.random() * 0.6;
                    const y = 0.2 + Math.random() * 0.6;
                    
                    pairs.push({
                        leftPaths: lGlyph.paths,
                        rightPaths: rGlyph.paths,
                        leftWidth: lBox.width + (lChar.rsb || 50),
                        rightWidth: rBox.width + (rChar.lsb || 50),
                        targetKern: val,
                        screenPosition: { x, y },
                        scale: 0.3 + Math.random() * 0.2,
                        color: palette[index % palette.length]
                    });
                }
            }
        });
        return pairs;
    }, [glyphDataMap, kerningMap, allCharsByUnicode]);

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
        const duration = 2500;
        let animationId: number;
        
        // Particles
        let particles: {x: number, y: number, vx: number, vy: number, life: number, color: string}[] = [];

        const draw = (time: number) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Loop animation
            const cycleProgress = (elapsed % 2000) / 2000;
            const snapProgress = easeOutElastic(Math.min(cycleProgress * 1.5, 1));
            
            // Clear
            ctx.fillStyle = theme === 'dark' ? 'rgba(17, 24, 39, 0.2)' : 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Pairs
            pairsToAnimate.forEach((pair, i) => {
                // Offset calculation
                // Start far apart, snap to kern distance
                const startGap = 500;
                const currentGap = startGap - (startGap * snapProgress);
                
                const cx = (pair.screenPosition.x * canvas.width);
                const cy = (pair.screenPosition.y * canvas.height);
                
                // Jitter position slightly
                const floatY = Math.sin(time / 500 + i) * 10;
                
                const scale = pair.scale * (DRAWING_CANVAS_SIZE / 1000); // Normalize visual scale

                ctx.save();
                ctx.translate(cx, cy + floatY);
                ctx.scale(scale, scale);
                
                // Draw Left
                ctx.save();
                ctx.translate(-500, -500); // Center glyph
                renderPaths(ctx, pair.leftPaths, { strokeThickness: 20, color: pair.color });
                ctx.restore();

                // Draw Right
                ctx.save();
                // Move right glyph: Initial Right Pos + Current Gap + Target Kern
                // Assume standard advance width approx 800
                const rightX = 800 + currentGap + pair.targetKern;
                ctx.translate(rightX - 500, -500);
                renderPaths(ctx, pair.rightPaths, { strokeThickness: 20, color: pair.color });
                ctx.restore();
                
                ctx.restore();

                // Spawn particles on snap (around 60% of cycle)
                if (cycleProgress > 0.6 && cycleProgress < 0.65 && Math.random() > 0.5) {
                     // Midpoint
                     const mx = cx + (scale * 400); // Approx
                     for(let k=0; k<5; k++) {
                         particles.push({
                             x: mx, y: cy + floatY,
                             vx: (Math.random() - 0.5) * 10,
                             vy: (Math.random() - 0.5) * 10,
                             life: 1.0,
                             color: pair.color
                         });
                     }
                }
            });

            // Draw Particles
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
                ctx.fill();
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.05;
                if (p.life <= 0) particles.splice(i, 1);
            }
            ctx.globalAlpha = 1.0;

            animationId = requestAnimationFrame(draw);
        };
        
        animationId = requestAnimationFrame(draw);
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [glyphDataMap, kerningMap, theme]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-1000" style={{ opacity }}>
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
            <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-700 max-w-md text-center transform transition-transform duration-500 scale-100 animate-pop-in z-10">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">🎯</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Visual Rhythm Mastered!</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
                    You've adjusted the spacing for your pairs. Your font now reads with professional flow and balance.
                </p>
                <div className="flex flex-col gap-3">
                    <button onClick={onProceed} className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                        <span>Finish & Export</span>
                        <RightArrowIcon className="w-5 h-5" />
                    </button>
                    <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline">
                        One Last Test
                    </button>
                </div>
            </div>
        </div>
    );
};

export default KerningCelebrationOverlay;
