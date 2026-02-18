import React, { useEffect, useRef, useState } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import { GlyphData } from '../types';
import { renderPaths } from '../services/glyphRenderService';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { DRAWING_CANVAS_SIZE, RightArrowIcon } from '../constants';

interface CelebrationOverlayProps {
    glyphDataMap: Map<number, GlyphData>;
    nextStep: 'positioning' | 'kerning';
    onProceed: () => void;
    onClose: () => void;
}

const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({ glyphDataMap, nextStep, onProceed, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const { t } = useLocale();
    const [opacity, setOpacity] = useState(0);

    useEffect(() => {
        // Fade in
        setTimeout(() => setOpacity(1), 100);

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize canvas
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Prepare Glyph Bitmaps
        const glyphImages: HTMLCanvasElement[] = [];
        const drawnGlyphs = Array.from(glyphDataMap.values()).filter((g: GlyphData) => isGlyphDrawn(g));
        const sampleSize = Math.min(drawnGlyphs.length);
        
        // Shuffle and pick
        const samples = drawnGlyphs.sort(() => 0.5 - Math.random()).slice(0, sampleSize);
        const CELL_SIZE = 200; // Pixel size for the rain drops

        samples.forEach(g => {
            const buffer = document.createElement('canvas');
            buffer.width = CELL_SIZE;
            buffer.height = CELL_SIZE;
            const bCtx = buffer.getContext('2d');
            if (bCtx) {
                // Determine scale
                // Glyphs are 1000x1000 usually
                const scale = CELL_SIZE / DRAWING_CANVAS_SIZE;
                
                bCtx.save();
                bCtx.scale(scale, scale);
                
                renderPaths(bCtx, g.paths, { 
                    strokeThickness: 20, // Thick enough to see when scaled down
                    color: theme === 'dark' ? '#818cf8' : '#4f46e5' // Indigo color
                });
                bCtx.restore();
                glyphImages.push(buffer);
            }
        });
        
        if (glyphImages.length === 0) {
            return;
        }

        // Matrix Rain State
        const fontSize = CELL_SIZE;
        const columns = Math.floor(canvas.width / fontSize);
        const drops: number[] = [];
        for (let i = 0; i < columns; i++) {
            drops[i] = Math.random() * -100; // Start above screen randomly
        }

        let animationId: number;

        const draw = () => {
            // Translucent fade to create trails
            ctx.fillStyle = theme === 'dark' ? 'rgba(17, 24, 39, 0.1)' : 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < drops.length; i++) {
                const imgIndex = Math.floor(Math.random() * glyphImages.length);
                const img = glyphImages[imgIndex];
                const x = i * fontSize;
                const y = drops[i] * fontSize;

                ctx.globalAlpha = 0.6; // Slightly transparent glyphs
                ctx.drawImage(img, x, y);
                ctx.globalAlpha = 1.0;

                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [glyphDataMap, theme]);

    const title = nextStep === 'positioning' 
        ? "Drawing Complete!" 
        : "Alphabet Finished!";
        
    const message = nextStep === 'positioning'
        ? "You've crafted the shapes. Now, let's define how charcters are positioned."
        : "You've crafted the shapes. Now, let's fine-tune the spacing between letters.";

    const buttonText = nextStep === 'positioning' ? "Go to Positioning" : "Go to Kerning";

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-1000"
            style={{ opacity }}
        >
            <canvas 
                ref={canvasRef} 
                className="absolute inset-0 pointer-events-none"
            />
            
            <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-700 max-w-md text-center transform transition-transform duration-500 scale-100 animate-pop-in">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">🎉</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
                    {message}
                </p>
                
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={onProceed}
                        className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        <span>{buttonText}</span>
                        <RightArrowIcon className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={onClose}
                        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                    >
                        Stay here for now
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CelebrationOverlay;