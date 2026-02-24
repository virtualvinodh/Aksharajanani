
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon, DownloadIcon, ShareIcon, ImageIcon, TrashIcon } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { CreatorSettings } from '../types';

interface CreatorPageProps {
    fontBlob: Blob | null;
}

const FONT_FACE_ID = 'creator-font-face';

const CreatorPage: React.FC<CreatorPageProps> = ({ fontBlob }) => {
    const { t } = useLocale();
    const { settings, dispatch: settingsDispatch } = useSettings();
    const { handleBack } = useLayout();
    const saved = settings?.creatorSettings;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // State - initialized from saved settings or defaults
    const [text, setText] = useState(saved?.text ?? 'Type your text here...');
    const [fontSize, setFontSize] = useState(saved?.fontSize ?? 60);
    const [textColor, setTextColor] = useState(saved?.textColor ?? '#ffffff');
    const [bgColor, setBgColor] = useState(saved?.bgColor ?? '#4f46e5'); // Indigo-600 default
    const [bgImageData, setBgImageData] = useState<string | null>(saved?.bgImageData ?? null);
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [overlayOpacity, setOverlayOpacity] = useState(saved?.overlayOpacity ?? 0.3);
    const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>(saved?.textAlign ?? 'center');
    const [fontLoaded, setFontLoaded] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<'square' | 'portrait' | 'landscape'>(saved?.aspectRatio ?? 'square');
    const [addShadow, setAddShadow] = useState(saved?.addShadow ?? true);
    
    // Position State
    const [textPos, setTextPos] = useState<{x: number, y: number} | null>(saved?.textPos ?? null);
    const [isDragging, setIsDragging] = useState(false);
    const lastPointerPos = useRef<{x: number, y: number} | null>(null);

    const fontName = "CreatorFont";

    // Initialize Font
    useEffect(() => {
        if (fontBlob) {
            const loadFont = async () => {
                try {
                    const fontUrl = URL.createObjectURL(fontBlob);
                    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                    setFontLoaded(true);
                } catch (e) {
                    console.error("Failed to load creator font", e);
                }
            };
            loadFont();
        }
    }, [fontBlob]);
    
    // Sync bgImageData string to actual Image element
    useEffect(() => {
        if (bgImageData) {
            const img = new Image();
            img.src = bgImageData;
            img.onload = () => setBgImage(img);
        } else {
            setBgImage(null);
        }
    }, [bgImageData]);

    // Persist settings to context
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const newCreatorSettings: CreatorSettings = {
                text,
                fontSize,
                textColor,
                bgColor,
                overlayOpacity,
                textAlign,
                aspectRatio,
                addShadow,
                textPos,
                bgImageData
            };

            // Avoid unnecessary updates if nothing changed deeply
            if (JSON.stringify(newCreatorSettings) !== JSON.stringify(settings?.creatorSettings)) {
                settingsDispatch({ 
                    type: 'UPDATE_SETTINGS', 
                    payload: (prev) => prev ? ({ ...prev, creatorSettings: newCreatorSettings }) : null 
                });
            }
        }, 500); // Debounce saves
        
        return () => clearTimeout(timeoutId);
    }, [text, fontSize, textColor, bgColor, overlayOpacity, textAlign, aspectRatio, addShadow, textPos, bgImageData, settings?.creatorSettings, settingsDispatch]);

    // Draw Canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !fontLoaded) return;

        // Dimensions
        let width = 1080;
        let height = 1080;
        if (aspectRatio === 'portrait') height = 1920;
        if (aspectRatio === 'landscape') height = 608;

        canvas.width = width;
        canvas.height = height;

        // 1. Background
        if (bgImage) {
             // Cover logic
             const scale = Math.max(width / bgImage.width, height / bgImage.height);
             const x = (width / 2) - (bgImage.width / 2) * scale;
             const y = (height / 2) - (bgImage.height / 2) * scale;
             ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
             
             // Overlay
             ctx.fillStyle = `rgba(0, 0, 0, ${overlayOpacity})`;
             ctx.fillRect(0, 0, width, height);
        } else {
             ctx.fillStyle = bgColor;
             ctx.fillRect(0, 0, width, height);
        }

        // 2. Text Configuration
        ctx.font = `${fontSize * 2}px "${fontName}"`; // Scale font up for hi-res canvas
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'middle';
        
        if (addShadow) {
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4;
        } else {
            ctx.shadowColor = "transparent";
        }

        // 3. Text Wrapping Logic
        const maxWidth = width * 0.8;
        const lineHeight = fontSize * 2.5;
        
        const finalLines: string[] = [];
        text.split('\n').forEach(paragraph => {
             const words = paragraph.split(' ');
             let currentLine = words[0];
             for (let i = 1; i < words.length; i++) {
                 let testLine = currentLine + " " + words[i];
                 if (ctx.measureText(testLine).width > maxWidth) {
                     finalLines.push(currentLine);
                     currentLine = words[i];
                 } else {
                     currentLine = testLine;
                 }
             }
             finalLines.push(currentLine);
        });

        // 4. Position Calculation
        // If textPos is null, calculate default position based on alignment
        let anchorX = width / 2;
        let centerY = height / 2;

        if (textPos) {
            anchorX = textPos.x;
            centerY = textPos.y;
        } else {
            // Default Layout
            if (textAlign === 'left') anchorX = width * 0.1;
            if (textAlign === 'right') anchorX = width * 0.9;
        }

        const totalTextHeight = finalLines.length * lineHeight;
        let startY = centerY - (totalTextHeight / 2) + (lineHeight / 2);

        // 5. Draw Lines
        ctx.textAlign = textAlign;
        finalLines.forEach(line => {
            ctx.fillText(line, anchorX, startY);
            startY += lineHeight;
        });

        // 6. Draw Watermark
        const watermarkText = "Made with Aksharajanani";
        const watermarkFontSize = Math.max(20, width * 0.022); 
        ctx.font = `italic 500 ${watermarkFontSize}px sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        
        const padding = width * 0.025;
        ctx.fillText(watermarkText, width - padding, height - padding);

    }, [text, fontSize, textColor, bgColor, bgImage, overlayOpacity, textAlign, fontLoaded, aspectRatio, addShadow, textPos]);

    useEffect(() => {
        draw();
    }, [draw]);

    // --- Interaction Handlers ---

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        lastPointerPos.current = { x: e.clientX, y: e.clientY };
        
        // If first drag, initialize textPos to current default to avoid jumping
        if (!textPos && canvasRef.current) {
            const canvas = canvasRef.current;
            let width = canvas.width;
            let height = canvas.height;
            
            let anchorX = width / 2;
            if (textAlign === 'left') anchorX = width * 0.1;
            if (textAlign === 'right') anchorX = width * 0.9;
            
            setTextPos({ x: anchorX, y: height / 2 });
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDragging || !lastPointerPos.current || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        
        // Calculate scale factor between visual size (CSS) and internal size (width/height attributes)
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const deltaX = (e.clientX - lastPointerPos.current.x) * scaleX;
        const deltaY = (e.clientY - lastPointerPos.current.y) * scaleY;
        
        setTextPos(prev => prev ? { x: prev.x + deltaX, y: prev.y + deltaY } : null);
        
        lastPointerPos.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };


    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result as string;
                setBgImageData(result);
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };
    
    const handleRemoveImage = () => {
        setBgImageData(null);
    };

    const handleDownload = () => {
        if (canvasRef.current) {
            const link = document.createElement('a');
            link.download = `aksharajanani-${Date.now()}.png`;
            link.href = canvasRef.current.toDataURL();
            link.click();
        }
    };

    const handleShare = async () => {
        if (canvasRef.current) {
            canvasRef.current.toBlob(async (blob) => {
                if (blob && navigator.share) {
                    try {
                        await navigator.share({
                            files: [new File([blob], 'share.png', { type: 'image/png' })],
                            title: 'My Font Creation',
                        });
                    } catch (err) {
                        console.error("Share failed", err);
                    }
                }
            });
        }
    };

    const presets = [
        { name: 'Post', ratio: 'square' as const },
        { name: 'Story', ratio: 'portrait' as const },
        { name: 'Cover', ratio: 'landscape' as const },
    ];
    
    const changeAspectRatio = (ratio: 'square' | 'portrait' | 'landscape') => {
        setAspectRatio(ratio);
        // Reset text position when changing layout significantly
        setTextPos(null);
    };

    // -- Compact Control Section --
    const controls = (
        <div className="flex flex-col gap-3">
             {/* Row 1: Aspect Ratio */}
             <div className="flex bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
                 {presets.map(p => (
                     <button
                        key={p.name}
                        onClick={() => changeAspectRatio(p.ratio)}
                        className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${aspectRatio === p.ratio ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                     >
                         {p.name}
                     </button>
                 ))}
             </div>

             {/* Row 2: Size & Align */}
             <div className="flex items-center gap-3">
                 <div className="flex-grow flex flex-col justify-center">
                    <input 
                        type="range" 
                        min="20" max="200" 
                        value={fontSize} 
                        onChange={(e) => setFontSize(Number(e.target.value))} 
                        className="w-full accent-indigo-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" 
                        title="Text Size"
                    />
                 </div>
                 <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1 shrink-0">
                     {['left', 'center', 'right'].map((align) => (
                         <button
                             key={align}
                             onClick={() => setTextAlign(align as any)}
                             className={`p-1.5 rounded-md transition-all ${textAlign === align ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}
                             title={`Align ${align}`}
                         >
                            {/* Simple Align Icons */}
                            {align === 'left' && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 5h12v2H3V9zm0 5h18v2H3v-2zm0 5h12v2H3v-2z"/></svg>}
                            {align === 'center' && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm3 5h12v2H6V9zm-3 5h18v2H3v-2zm3 5h12v2H6v-2z"/></svg>}
                            {align === 'right' && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm6 5h12v2H9V9zm-6 5h18v2H3v-2zm6 5h12v2H9v-2z"/></svg>}
                         </button>
                     ))}
                 </div>
             </div>

             {/* Row 3: Colors & Effects Compact */}
             <div className="grid grid-cols-4 gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border dark:border-gray-700 items-center justify-items-center">
                
                {/* Text Color */}
                <label className="flex flex-col items-center cursor-pointer group w-full" title="Text Color">
                    <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-600 shadow-sm flex items-center justify-center font-bold text-xs" style={{ backgroundColor: textColor, color: textColor === '#ffffff' ? '#000' : '#fff' }}>T</div>
                    <input type="color" className="sr-only" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                    <span className="text-[10px] text-gray-500 mt-1">Text</span>
                </label>

                {/* Bg Color */}
                <label className={`flex flex-col items-center cursor-pointer group w-full ${bgImage ? 'opacity-50' : ''}`} title="Background Color">
                    <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-600 shadow-sm flex items-center justify-center font-bold text-xs text-white" style={{ backgroundColor: bgColor }}>B</div>
                    <input type="color" className="sr-only" value={bgColor} onChange={(e) => setBgColor(e.target.value)} disabled={!!bgImage} />
                    <span className="text-[10px] text-gray-500 mt-1">Back</span>
                </label>

                {/* Shadow Toggle */}
                <div className="flex flex-col items-center w-full">
                    <button 
                        onClick={() => setAddShadow(!addShadow)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border-2 ${addShadow ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'}`}
                        title="Toggle Shadow"
                    >
                        <span className="font-bold text-xs">S</span>
                    </button>
                    <span className="text-[10px] text-gray-500 mt-1">Shadow</span>
                </div>

                {/* Image Upload */}
                <div className="flex flex-col items-center w-full relative">
                    {bgImage ? (
                        <button onClick={handleRemoveImage} className="w-8 h-8 flex items-center justify-center text-red-500 bg-red-50 dark:bg-red-900/20 rounded-full border border-red-200 hover:bg-red-100" title="Remove Image"><TrashIcon/></button>
                    ) : (
                        <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 flex items-center justify-center" title="Add Background Image">
                            <ImageIcon />
                        </button>
                    )}
                    <span className="text-[10px] text-gray-500 mt-1">Image</span>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                </div>
             </div>

             {/* Row 4: Conditional Opacity Slider */}
             {bgImage && (
                <div className="flex items-center gap-3 px-1 animate-fade-in-up">
                    <span className="text-xs text-gray-500 font-semibold w-12">Dimmer</span>
                    <input 
                        type="range" 
                        min="0" max="0.8" step="0.1" 
                        value={overlayOpacity} 
                        onChange={(e) => setOverlayOpacity(Number(e.target.value))} 
                        className="flex-grow h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-indigo-600" 
                    />
                </div>
             )}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col animate-fade-in-up">
            {/* Header */}
            <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-3 flex justify-between items-center shadow-sm w-full flex-shrink-0 z-10 border-b dark:border-gray-700">
                <button onClick={handleBack} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200">
                    <BackIcon />
                </button>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Studio</h2>
                <div className="flex gap-2">
                    <button onClick={handleDownload} className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 shadow-md">
                        <DownloadIcon />
                    </button>
                    {navigator.share && (
                        <button onClick={handleShare} className="p-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-full hover:bg-gray-300 shadow-md">
                            <ShareIcon />
                        </button>
                    )}
                </div>
            </header>

            {/* Main Content (Responsive) */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                
                {/* Desktop Sidebar (Controls) */}
                <div className="hidden md:flex w-80 bg-gray-50 dark:bg-gray-800 border-r dark:border-gray-700 flex-col p-6 gap-6 z-20 shadow-xl">
                     <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full p-3 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm resize-none"
                        rows={4}
                        placeholder="Your text..."
                    />
                    {controls}
                    <div className="mt-auto text-xs text-gray-400 text-center">
                        Pro Tip: Use transparent backgrounds for stickers.
                    </div>
                </div>

                {/* Preview Area */}
                <div className="flex-1 bg-gray-200 dark:bg-black/20 flex items-center justify-center p-4 relative overflow-hidden">
                    {/* Checkered pattern for transparency */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" 
                         style={{ backgroundImage: `linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)`, backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' }}>
                    </div>
                    
                    <div className="relative shadow-2xl z-10 max-w-full max-h-full flex flex-col">
                        <canvas 
                            ref={canvasRef} 
                            className="max-w-full max-h-[60vh] md:max-h-[85vh] object-contain bg-white mx-auto cursor-move touch-none"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                        />
                    </div>
                </div>

                {/* Mobile Bottom Controls */}
                <div className="md:hidden bg-white dark:bg-gray-800 border-t dark:border-gray-700 p-4 pb-8 flex flex-col gap-4 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-20">
                     <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full p-2 rounded-md border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 text-base resize-none"
                        rows={2}
                        placeholder="Type here..."
                    />
                    {controls}
                </div>
            </div>
        </div>
    );
};

export default CreatorPage;
