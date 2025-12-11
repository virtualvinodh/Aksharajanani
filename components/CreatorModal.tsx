import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';
import { CloseIcon, DownloadIcon, ShareIcon, ImageIcon, TrashIcon } from '../constants';

interface CreatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    fontBlob: Blob | null;
}

const FONT_FACE_ID = 'creator-font-face';

const CreatorModal: React.FC<CreatorModalProps> = ({ isOpen, onClose, fontBlob }) => {
    const { t } = useLocale();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // State
    const [text, setText] = useState('Type your text here...');
    const [fontSize, setFontSize] = useState(60);
    const [textColor, setTextColor] = useState('#ffffff');
    const [bgColor, setBgColor] = useState('#4f46e5'); // Indigo-600 default
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [overlayOpacity, setOverlayOpacity] = useState(0.3);
    const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
    const [fontLoaded, setFontLoaded] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<'square' | 'portrait' | 'landscape'>('square');
    const [addShadow, setAddShadow] = useState(true);

    const fontName = "CreatorFont";

    // Initialize Font
    useEffect(() => {
        if (fontBlob && isOpen) {
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
        return () => {
            // Cleanup logic if needed, though FontFace API cleanup is tricky. 
            // Browser handles cache.
        };
    }, [fontBlob, isOpen]);

    // Draw Canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !fontLoaded) return;

        // Dimensions
        let width = 1080;
        let height = 1080;
        if (aspectRatio === 'portrait') height = 1920;
        if (aspectRatio === 'landscape') height = 608; // Roughly facebook link preview

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
        const words = text.split(' ');
        let lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            let testLine = currentLine + " " + words[i];
            let metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && i > 0) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        
        // Handle explicit newlines in input
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
        
        // Overwrite simple wrap with multi-line support
        lines = finalLines;

        // 4. Draw Lines
        const totalTextHeight = lines.length * lineHeight;
        let startY = (height - totalTextHeight) / 2 + (lineHeight / 2);

        lines.forEach(line => {
            let x = width / 2;
            if (textAlign === 'left') x = width * 0.1;
            if (textAlign === 'right') x = width * 0.9;
            
            ctx.textAlign = textAlign;
            ctx.fillText(line, x, startY);
            startY += lineHeight;
        });

    }, [text, fontSize, textColor, bgColor, bgImage, overlayOpacity, textAlign, fontLoaded, aspectRatio, addShadow]);

    useEffect(() => {
        draw();
    }, [draw]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const img = new Image();
            img.src = URL.createObjectURL(e.target.files[0]);
            img.onload = () => {
                setBgImage(img);
            };
        }
    };

    const handleDownload = () => {
        if (canvasRef.current) {
            const link = document.createElement('a');
            link.download = `font-creation-${Date.now()}.png`;
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
                            title: 'My Custom Font Creation',
                        });
                    } catch (err) {
                        console.error("Share failed", err);
                    }
                }
            });
        }
    };

    const presets = [
        { name: 'Instagram Post', ratio: 'square' as const },
        { name: 'Story / Status', ratio: 'portrait' as const },
        { name: 'Banner', ratio: 'landscape' as const },
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col md:flex-row animate-fade-in-up">
            {/* Close Button Mobile */}
            <button onClick={onClose} className="md:hidden absolute top-4 right-4 text-white z-50 bg-gray-800 rounded-full p-2">
                <CloseIcon />
            </button>

            {/* Preview Area */}
            <div className="flex-1 flex items-center justify-center p-4 md:p-10 bg-gray-900 overflow-hidden relative">
                 <div className="relative shadow-2xl" style={{ maxHeight: '100%', maxWidth: '100%' }}>
                     <canvas 
                        ref={canvasRef} 
                        className="max-w-full max-h-[80vh] object-contain rounded-md"
                     />
                 </div>
            </div>

            {/* Controls Area */}
            <div className="w-full md:w-96 bg-white dark:bg-gray-800 p-6 overflow-y-auto flex flex-col gap-6 shadow-2xl z-40">
                <div className="flex justify-between items-center">
                     <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                         <span className="text-2xl">✨</span> Creator Studio
                     </h2>
                     <button onClick={onClose} className="hidden md:block text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                         <CloseIcon />
                     </button>
                </div>

                {/* Text Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message</label>
                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full p-3 rounded-lg border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        rows={3}
                    />
                </div>

                {/* Canvas Settings */}
                <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Format</label>
                     <div className="flex gap-2">
                         {presets.map(p => (
                             <button
                                key={p.name}
                                onClick={() => setAspectRatio(p.ratio)}
                                className={`flex-1 py-2 px-1 text-xs font-semibold rounded-lg border ${aspectRatio === p.ratio ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                             >
                                 {p.name}
                             </button>
                         ))}
                     </div>
                </div>

                {/* Style Settings */}
                <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text Size: {fontSize}</label>
                        <input type="range" min="20" max="200" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-indigo-600" />
                     </div>
                     
                     <div className="flex justify-between">
                         <div>
                             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text Color</label>
                             <div className="flex items-center gap-2">
                                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-8 w-12 rounded border cursor-pointer" />
                                <label className="text-xs flex items-center gap-1 cursor-pointer select-none">
                                    <input type="checkbox" checked={addShadow} onChange={(e) => setAddShadow(e.target.checked)} className="rounded text-indigo-600" /> Shadow
                                </label>
                             </div>
                         </div>
                         <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bg Color</label>
                              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} disabled={!!bgImage} className="h-8 w-12 rounded border cursor-pointer disabled:opacity-30" />
                         </div>
                     </div>
                     
                     <div>
                         <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alignment</label>
                         <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                             {['left', 'center', 'right'].map((align) => (
                                 <button
                                     key={align}
                                     onClick={() => setTextAlign(align as any)}
                                     className={`flex-1 py-1 rounded capitalize text-sm ${textAlign === align ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                                 >
                                     {align}
                                 </button>
                             ))}
                         </div>
                     </div>
                </div>

                {/* Background Image */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Background Image</label>
                     <div className="flex gap-2">
                         <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-indigo-500 dark:hover:border-indigo-500 transition-colors">
                             <ImageIcon /> <span className="text-sm">Upload</span>
                         </button>
                         {bgImage && (
                             <button onClick={() => setBgImage(null)} className="p-2 text-red-500 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                 <TrashIcon />
                             </button>
                         )}
                         <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                     </div>
                     
                     {bgImage && (
                         <div className="mt-3">
                             <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dim Image (Overlay)</label>
                             <input type="range" min="0" max="0.9" step="0.1" value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} className="w-full accent-indigo-600" />
                         </div>
                     )}
                </div>

                {/* Actions */}
                <div className="mt-auto flex flex-col gap-3">
                    <button onClick={handleDownload} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                        <DownloadIcon /> Save Image
                    </button>
                    {navigator.share && (
                        <button onClick={handleShare} className="w-full py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-transform active:scale-95">
                            <ShareIcon /> Share
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreatorModal;
