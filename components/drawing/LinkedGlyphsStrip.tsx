import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { Character, GlyphData, AppSettings, CharacterSet, MarkAttachmentRules, Path, KerningMap, MarkPositioningMap, UnifiedRenderContext } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox, generateCompositeGlyphData, updateComponentInPaths, getUnifiedPaths } from '../../services/glyphRenderService';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';
import { LeftArrowIcon, RightArrowIcon, LinkIcon, BrokenLinkIcon, FoldIcon, CloseIcon } from '../../constants';
import { isGlyphDrawn } from '../../utils/glyphUtils';

interface LinkedGlyphsStripProps {
    title: string;
    items: Character[];
    glyphDataMap: Map<number, GlyphData>;
    settings: AppSettings;
    onSelect: (char: Character) => void;
    variant: 'sources' | 'dependents';
    
    // Props for Live Preview
    liveSourcePaths?: Path[]; 
    sourceCharacter?: Character;
    allCharsByName?: Map<string, Character>;
    metrics?: any;
    markAttachmentRules?: MarkAttachmentRules | null;
    characterSets?: CharacterSet[];
    groups?: Record<string, string[]>;
    kerningMap?: KerningMap;
    markPositioningMap?: MarkPositioningMap;
}

const DRAWING_CANVAS_SIZE = 1000;
const VIRTUOSO_THRESHOLD = 30; // Switch to virtual list if items exceed this count

declare var UnicodeProperties: any;

const GlyphThumbnail: React.FC<{
    character: Character;
    glyphData: GlyphData | undefined;
    strokeThickness: number;
    onClick: () => void;
    size?: number; 
}> = React.memo(({ character, glyphData, strokeThickness, onClick, size = 60 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, size, size);

        if (isGlyphDrawn(glyphData)) {
            const bbox = getAccurateGlyphBBox(glyphData!, strokeThickness);
            
            const standardScale = size / DRAWING_CANVAS_SIZE;
            let scale = standardScale;
            let tx = 0;
            let ty = 0;

            if (bbox) {
                const PADDING = size * 0.1;
                const availableDim = size - (PADDING * 2);
                
                if (bbox.width > 0 && bbox.height > 0) {
                    const fitScaleX = availableDim / bbox.width;
                    const fitScaleY = availableDim / bbox.height;
                    const fitScale = Math.min(fitScaleX, fitScaleY);
                    
                    if (fitScale < standardScale) {
                        scale = fitScale;
                    }
                }

                const contentCenterX = bbox.x + bbox.width / 2;
                const canvasCenter = size / 2;
                tx = canvasCenter - (contentCenterX * scale);

                let shouldVerticallyCenter = true;

                if (character.glyphClass === 'mark') {
                    shouldVerticallyCenter = false;
                } else if (character.unicode && typeof UnicodeProperties !== 'undefined') {
                    try {
                        const cat = UnicodeProperties.getCategory(character.unicode);
                        if (cat === 'Lm' || cat === 'Sk' || cat.startsWith('P')) {
                            shouldVerticallyCenter = false;
                        }
                    } catch (e) { }
                }

                if (shouldVerticallyCenter) {
                    const contentCenterY = bbox.y + bbox.height / 2;
                    ty = canvasCenter - (contentCenterY * scale);
                } else {
                    ty = (size - (DRAWING_CANVAS_SIZE * scale)) / 2;
                }
            }

            ctx.save();
            ctx.translate(tx, ty);
            ctx.scale(scale, scale);
            
            renderPaths(ctx, glyphData!.paths, {
                strokeThickness,
                color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
            });
            ctx.restore();
        }
    }, [glyphData, strokeThickness, theme, size, character]);

    return (
        <div 
            onClick={onClick}
            style={{ width: size, height: size }}
            className="flex-shrink-0 flex flex-col items-center justify-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all p-1 group"
            title={character.name}
        >
            <canvas ref={canvasRef} width={size} height={size} />
        </div>
    );
});

const LinkedGlyphsStrip: React.FC<LinkedGlyphsStripProps> = ({ 
    title, items, glyphDataMap, settings, onSelect, variant,
    liveSourcePaths, sourceCharacter, allCharsByName, metrics, markAttachmentRules, characterSets, groups,
    kerningMap, markPositioningMap
}) => {
    const { visibility, handleScroll, scrollRef, checkVisibility } = useHorizontalScroll([items]);
    const [isExpanded, setIsExpanded] = useState(false);
    const virtuosoRef = useRef<any>(null);
    
    const useVirtuoso = items.length >= VIRTUOSO_THRESHOLD && !isExpanded;

    const getDisplayData = useCallback((char: Character): GlyphData | undefined => {
        // Create a rendering context that injects live data from the editor
        const renderCtx: UnifiedRenderContext = {
            glyphDataMap: new Proxy(glyphDataMap, {
                get(target, prop) {
                    if (prop === 'get') {
                        return (key: number) => {
                            if (key === sourceCharacter?.unicode && liveSourcePaths) {
                                return { paths: liveSourcePaths };
                            }
                            return target.get(key);
                        };
                    }
                    return (target as any)[prop];
                }
            }),
            allCharsByName: allCharsByName!,
            markPositioningMap: markPositioningMap!,
            kerningMap: kerningMap!,
            metrics: metrics!,
            markAttachmentRules: markAttachmentRules!,
            strokeThickness: settings.strokeThickness,
            characterSets: characterSets!,
            groups: groups || {}
        };

        // 1. Syllables / Kerned Pairs (Virtual Assembly)
        if (char.position || char.kern) {
            return { paths: getUnifiedPaths(char, renderCtx) };
        }

        // 2. Direct Drawing Link (Legacy Path Link)
        let displayData = char.unicode !== undefined ? glyphDataMap.get(char.unicode) : undefined;
        
        if (variant === 'dependents' && liveSourcePaths && sourceCharacter && displayData) {
            const components = char.link || char.composite || [];
            let currentPaths = [...displayData.paths];
            let pathsModified = false;

            if (currentPaths.length > 0) {
                components.forEach((compName, index) => {
                    if (compName === sourceCharacter.name) {
                        const updated = updateComponentInPaths(
                            currentPaths,
                            index,
                            liveSourcePaths,
                            settings.strokeThickness,
                            char.compositeTransform
                        );
                        if (updated) {
                            currentPaths = updated;
                            pathsModified = true;
                        }
                    }
                });
                if (pathsModified) {
                    displayData = { paths: currentPaths };
                }
            } 
            else if (allCharsByName && metrics && characterSets) {
                // If the target has no paths yet, regenerate it from components
                const liveComposite = generateCompositeGlyphData({
                    character: char,
                    allCharsByName: allCharsByName,
                    allGlyphData: renderCtx.glyphDataMap,
                    settings: settings,
                    metrics: metrics,
                    markAttachmentRules: markAttachmentRules || null,
                    allCharacterSets: characterSets,
                    groups: groups || {}
                });
                if (liveComposite) {
                    displayData = liveComposite;
                }
            }
        }
        return displayData;
    }, [glyphDataMap, liveSourcePaths, sourceCharacter, variant, settings, allCharsByName, metrics, characterSets, groups, kerningMap, markPositioningMap]);

    const renderThumb = (char: Character, size: number) => (
        <GlyphThumbnail 
            key={char.unicode || char.name}
            character={char}
            glyphData={getDisplayData(char)}
            strokeThickness={settings.strokeThickness}
            onClick={() => {
                if (isExpanded) setIsExpanded(false);
                onSelect(char);
            }}
            size={size}
        />
    );

    const expandedView = isExpanded ? (
        <div className="fixed inset-0 z-[200] bg-white dark:bg-gray-900 flex flex-col animate-fade-in-up">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md flex-shrink-0">
                 <div className="flex items-center gap-4">
                     <div className={`p-2 rounded-lg ${variant === 'sources' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-blue-300'}`}>
                        {variant === 'sources' ? <LinkIcon className="w-6 h-6" /> : <BrokenLinkIcon className="w-6 h-6" />}
                     </div>
                     <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {items.length} characters
                        </p>
                     </div>
                 </div>
                 <button 
                    onClick={() => setIsExpanded(false)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 transition-colors"
                >
                    <CloseIcon className="w-8 h-8" />
                </button>
            </div>
            <div className="flex-grow overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/50">
                 <div className="flex flex-wrap justify-center gap-4">
                    {items.map(char => renderThumb(char, 100))}
                 </div>
            </div>
        </div>
    ) : null;

    return (
        <>
            {expandedView && createPortal(expandedView, document.body)}

            <div className="w-full max-w-full flex flex-row border-t bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 p-2 animate-fade-in-up relative items-center overflow-hidden rounded-b-xl mx-auto">
                 <div className="flex flex-col items-center justify-center pr-3 border-r border-gray-300 dark:border-gray-600 mr-2 gap-2 flex-shrink-0 w-20">
                    <span className={`p-1.5 rounded-full ${variant === 'sources' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-blue-300'}`}>
                        {variant === 'sources' ? <LinkIcon className="w-4 h-4" /> : <BrokenLinkIcon className="w-4 h-4" />}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center leading-tight">
                        {title}<br/>
                        <span className="text-indigo-600 dark:text-indigo-400 text-xs">{items.length}</span>
                    </span>
                    <button 
                        onClick={() => setIsExpanded(true)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"
                        title="Expand"
                    >
                        <FoldIcon className="w-4 h-4 rotate-180" />
                    </button>
                 </div>

                 <div className="relative flex-grow overflow-hidden flex items-center h-[72px]">
                    {visibility.left && (
                        <button
                            onClick={() => handleScroll('left')}
                            className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-gradient-to-r from-gray-50 via-gray-50/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
                        >
                            <div className="p-0.5 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                <LeftArrowIcon className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                            </div>
                        </button>
                    )}

                    {useVirtuoso ? (
                        <Virtuoso
                            ref={virtuosoRef}
                            horizontal
                            data={items}
                            scrollerRef={scrollRef}
                            style={{ height: 68, width: '100%' }}
                            itemContent={(index, char) => (
                                <div className="pr-2 py-1">
                                    {renderThumb(char, 60)}
                                </div>
                            )}
                        />
                    ) : (
                        <div ref={scrollRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center scroll-smooth px-1 w-full">
                            {items.map((char) => renderThumb(char, 60))}
                        </div>
                    )}

                    {visibility.right && (
                        <button
                            onClick={() => handleScroll('right')}
                            className="absolute right-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-gradient-to-l from-gray-50 via-gray-50/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
                        >
                            <div className="p-0.5 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                <RightArrowIcon className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                            </div>
                        </button>
                    )}
                 </div>
            </div>
        </>
    );
};

export default React.memo(LinkedGlyphsStrip);