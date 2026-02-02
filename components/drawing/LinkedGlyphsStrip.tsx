
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { Character, GlyphData, AppSettings, CharacterSet, MarkAttachmentRules, Path, KerningMap, MarkPositioningMap, UnifiedRenderContext } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { renderPaths, getAccurateGlyphBBox, getUnifiedPaths } from '../../services/glyphRenderService';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';
import { LeftArrowIcon, RightArrowIcon, LinkIcon, BrokenLinkIcon, FoldIcon, CloseIcon, ChevronUpIcon, ChevronDownIcon } from '../../constants';
import { isGlyphDrawn as isDrawnUtil } from '../../utils/glyphUtils';

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
    
    // Collapse props
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

const DRAWING_CANVAS_SIZE = 1000;
const VIRTUOSO_THRESHOLD = 30; // Switch to virtual list if items exceed this count

declare var UnicodeProperties: any;

const GlyphThumbnail: React.FC<{
    character: Character;
    displayResult: { displayData: GlyphData | undefined, isAvailable: boolean };
    strokeThickness: number;
    onClick: () => void;
    size?: number; 
}> = React.memo(({ character, displayResult, strokeThickness, onClick, size = 60 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const { displayData, isAvailable } = displayResult;

    const isDrawn = isDrawnUtil(displayData);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isAvailable || !isDrawn) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, size, size);

        const bbox = getAccurateGlyphBBox(displayData!, strokeThickness);
        
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
        
        renderPaths(ctx, displayData!.paths, {
            strokeThickness,
            color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
        });
        ctx.restore();
    }, [displayData, strokeThickness, theme, size, character, isAvailable, isDrawn]);

    const effectiveOnClick = isAvailable ? onClick : () => {};
    const containerClasses = `flex-shrink-0 flex flex-col items-center justify-center bg-white dark:bg-gray-800 border rounded-lg shadow-sm transition-all p-1 group
        ${!isAvailable 
            ? 'opacity-50 grayscale cursor-not-allowed border-gray-200 dark:border-gray-700' 
            : 'cursor-pointer hover:ring-2 hover:ring-indigo-500 border-gray-200 dark:border-gray-700'}`;

    return (
        <div 
            onClick={effectiveOnClick}
            style={{ width: size, height: size }}
            className={containerClasses}
            title={character.name}
        >
            {isAvailable && isDrawn ? (
                <canvas ref={canvasRef} width={size} height={size} />
            ) : (
                 <div className="w-full h-full flex items-center justify-center">
                    <span 
                        className="text-gray-300 dark:text-gray-600 font-bold text-2xl truncate"
                        style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                    >
                        {character.label || character.name}
                    </span>
                </div>
            )}
        </div>
    );
});

const LinkedGlyphsStrip: React.FC<LinkedGlyphsStripProps> = ({ 
    title, items, glyphDataMap, settings, onSelect, variant,
    liveSourcePaths, sourceCharacter, allCharsByName, metrics, markAttachmentRules, characterSets, groups,
    kerningMap, markPositioningMap, isCollapsed: propCollapsed, onToggleCollapse
}) => {
    const { visibility, handleScroll, scrollRef } = useHorizontalScroll([items]);
    const [isExpanded, setIsExpanded] = useState(false); // Fullscreen
    const [internalCollapsed, setInternalCollapsed] = useState(false); // Minimize

    const collapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed;
    const toggleCollapse = onToggleCollapse || (() => setInternalCollapsed(p => !p));
    
    const virtuosoRef = useRef<any>(null);
    const useVirtuoso = items.length >= VIRTUOSO_THRESHOLD && !isExpanded;

    const getDisplayData = useCallback((char: Character): { displayData: GlyphData | undefined, isAvailable: boolean } => {
        // Build the render context that injects live data from the editor for real-time previews.
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

        // Availability check: Sources are always available. Dependents must have all their sources drawn.
        let isAvailable = true;
        if (variant === 'dependents') {
            const sourceNames = char.link || char.composite || char.position || char.kern;
            if (sourceNames && allCharsByName) {
                isAvailable = (sourceNames as string[]).every((name: string) => {
                    const sourceChar = allCharsByName.get(name);
                    if (!sourceChar || sourceChar.unicode === undefined) return false;
                    // For live updates, check against the proxy map.
                    return isDrawnUtil(renderCtx.glyphDataMap.get(sourceChar.unicode));
                });
            }
        }

        if (!isAvailable) {
            return { displayData: undefined, isAvailable: false };
        }
        
        // If available, compute the paths using the unified renderer.
        const resolvedPaths = getUnifiedPaths(char, renderCtx);
        const hasPaths = resolvedPaths.length > 0 && resolvedPaths.some(p => p.points.length > 0 || (p.segmentGroups && p.segmentGroups.length > 0));

        return { displayData: hasPaths ? { paths: resolvedPaths } : undefined, isAvailable: true };
    }, [
        glyphDataMap, liveSourcePaths, sourceCharacter, variant, settings, allCharsByName, 
        metrics, characterSets, groups, kerningMap, markPositioningMap, markAttachmentRules
    ]);

    const renderThumb = (char: Character, size: number) => (
        <GlyphThumbnail 
            key={char.unicode || char.name}
            character={char}
            displayResult={getDisplayData(char)}
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

            <div className={`w-full max-w-full flex flex-row border-t bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 p-2 animate-fade-in-up relative items-center overflow-hidden rounded-b-xl mx-auto transition-all duration-300 ${collapsed ? 'h-12' : ''}`}>
                 
                 {/* Left Control Column - Re-orients based on collapse state */}
                 <div className={`flex items-center transition-all duration-300 ${collapsed ? 'flex-row w-full justify-between px-2 border-r-0' : 'flex-col justify-center pr-3 border-r border-gray-300 dark:border-gray-600 mr-2 gap-2 flex-shrink-0 w-20'}`}>
                    
                    {/* Icon - Hide when collapsed */}
                    <span className={`p-1.5 rounded-full ${variant === 'sources' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-blue-300'} ${collapsed ? 'hidden' : 'block'}`}>
                        {variant === 'sources' ? <LinkIcon className="w-4 h-4" /> : <BrokenLinkIcon className="w-4 h-4" />}
                    </span>

                    {/* Text Label - Re-aligns when collapsed */}
                    <span className={`text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight ${collapsed ? 'text-left flex gap-2 items-center' : 'text-center'}`}>
                        {title}
                        {collapsed && <span className="text-gray-300 dark:text-gray-600">•</span>}
                        <span className="text-indigo-600 dark:text-indigo-400 text-xs block sm:inline">{items.length} {collapsed ? 'items' : ''}</span>
                    </span>
                    
                    {/* Buttons - Always visible */}
                    <div className="flex gap-1">
                        <button 
                            onClick={toggleCollapse}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"
                            title={collapsed ? "Expand" : "Minimize"}
                        >
                            {collapsed ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                        </button>
                        <button 
                            onClick={() => setIsExpanded(true)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"
                            title="Fullscreen"
                        >
                            <FoldIcon className="w-4 h-4 rotate-180" />
                        </button>
                    </div>
                 </div>

                 {/* Thumbnails Container - Completely hidden when collapsed to allow left col to expand */}
                 <div 
                    className={`relative flex-grow overflow-hidden flex items-center transition-all duration-300 ease-in-out origin-top ${collapsed ? 'hidden' : 'w-full opacity-100 h-[72px]'}`}
                 >
                    {visibility.left && !collapsed && (
                        <button
                            onClick={() => handleScroll('left')}
                            className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-gradient-to-r from-gray-50 via-gray-50/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
                        >
                            <div className="p-0.5 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                <LeftArrowIcon className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                            </div>
                        </button>
                    )}

                    {useVirtuoso && !collapsed ? (
                        <Virtuoso
                            ref={virtuosoRef}
                            data={items}
                            scrollerRef={scrollRef}
                            style={{ height: 68, width: '100%' }}
                            // FIX: Added 'any' type to the props of the List component to resolve TypeScript error.
                            components={{
                                List: React.forwardRef(({ style, children }: any, ref) => (
                                    <div
                                        ref={ref as React.Ref<HTMLDivElement>}
                                        style={{
                                            ...style,
                                            display: 'flex',
                                            flexDirection: 'row',
                                        }}
                                    >
                                        {children}
                                    </div>
                                )),
                            }}
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

                    {visibility.right && !collapsed && (
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
