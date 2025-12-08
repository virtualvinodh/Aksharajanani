
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon, SaveIcon, PropertiesIcon, LeftArrowIcon, RightArrowIcon, UndoIcon } from '../constants';
import DrawingCanvas from './DrawingCanvas';
import { AppSettings, Character, FontMetrics, GlyphData, MarkAttachmentRules, MarkPositioningMap, Path, Point, PositioningRules, CharacterSet } from '../types';
import { calculateDefaultMarkOffset, getAccurateGlyphBBox } from '../services/glyphRenderService';
import ReusePreviewCard from './ReusePreviewCard';
import UnsavedChangesModal from './UnsavedChangesModal';
import { VEC } from '../utils/vectorUtils';
// FIX: Import the missing GlyphPropertiesPanel component.
import GlyphPropertiesPanel from './GlyphPropertiesPanel';
import PositioningToolbar from './PositioningToolbar';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Modal from './Modal';
import { deepClone } from '../utils/cloneUtils';


interface PositioningEditorPageProps {
    baseChar: Character;
    markChar: Character;
    targetLigature: Character;
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    onSave: (targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newBearings: { lsb?: number, rsb?: number }, isAutosave?: boolean) => void;
    onClose: () => void;
    onReset: (baseChar: Character, markChar: Character, targetLigature: Character) => void;
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    positioningRules: PositioningRules[] | null;
    allChars: Map<string, Character>;
    allPairs: { base: Character, mark: Character, ligature: Character }[];
    currentIndex: number | null;
    onNavigate: (newIndex: number) => void;
    characterSets: CharacterSet[];
    glyphVersion: number;
}

const PositioningEditorPage: React.FC<PositioningEditorPageProps> = ({
    baseChar, markChar, targetLigature, glyphDataMap, markPositioningMap, onSave, onClose, onReset, settings, metrics, markAttachmentRules, positioningRules, allChars,
    allPairs, currentIndex, onNavigate, characterSets, glyphVersion
}) => {
    const { t } = useLocale();
    const [markPaths, setMarkPaths] = useState<Path[]>([]);
    const [initialMarkPaths, setInitialMarkPaths] = useState<Path[]>([]);
    const [isReusePanelOpen, setIsReusePanelOpen] = useState(false);
    const autosaveTimeout = useRef<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
    const [pageTool, setPageTool] = useState<'select' | 'pan'>('select');
    
    const [lsb, setLsb] = useState<number | undefined>(targetLigature.lsb);
    const [rsb, setRsb] = useState<number | undefined>(targetLigature.rsb);
    const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
    const propertiesPanelRef = useRef<HTMLDivElement>(null);

    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | 'back' | null>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    const pairIdentifier = `${baseChar.unicode}-${markChar.unicode}`;
    const lastPairIdentifierRef = useRef<string | null>(null);
    
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    const isPositioned = useMemo(() => markPositioningMap.has(pairIdentifier), [markPositioningMap, pairIdentifier]);
    
    const isGsubPair = useMemo(() => {
        if (!positioningRules) return false;
        for (const rule of positioningRules) {
            if (rule.gsub && rule.base.includes(baseChar.name) && rule.mark?.includes(markChar.name)) {
                return true;
            }
        }
        return false;
    }, [positioningRules, baseChar, markChar]);

    const movementConstraint = useMemo(() => {
        if (!positioningRules) return 'none';
        for (const rule of positioningRules) {
            if (rule.base.includes(baseChar.name) && rule.mark?.includes(markChar.name)) {
                if (rule.movement === 'horizontal' || rule.movement === 'vertical') {
                    return rule.movement;
                }
            }
        }
        return 'none';
    }, [positioningRules, baseChar, markChar]);

    const baseGlyph = glyphDataMap.get(baseChar.unicode);
    const baseBbox = useMemo(() => getAccurateGlyphBBox(baseGlyph?.paths ?? [], settings.strokeThickness), [baseGlyph, settings.strokeThickness]);

    useEffect(() => {
        const key = `${baseChar.unicode}-${markChar.unicode}`;
        let offset = markPositioningMap.get(key);
        
        if (!offset && baseBbox) {
            const markGlyph = glyphDataMap.get(markChar.unicode);
            const markBbox = getAccurateGlyphBBox(markGlyph?.paths ?? [], settings.strokeThickness);
            offset = calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets);
        }
        
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        // OPTIMIZATION: Use deepClone
        const newMarkPaths = deepClone(originalMarkPaths);
        if (offset) {
            newMarkPaths.forEach((p: Path) => {
                p.points = p.points.map(pt => ({ x: pt.x + offset!.x, y: pt.y + offset!.y }));
                if (p.segmentGroups) {
                    p.segmentGroups = p.segmentGroups.map(group =>
                        group.map(seg => ({
                            ...seg,
                            point: { x: seg.point.x + offset!.x, y: seg.point.y + offset!.y }
                        }))
                    );
                }
            });
        }
        setMarkPaths(newMarkPaths);
        // OPTIMIZATION: Use deepClone
        setInitialMarkPaths(deepClone(newMarkPaths)); // Save initial state for change detection
        setLsb(targetLigature.lsb);
        setRsb(targetLigature.rsb);
        setIsPropertiesPanelOpen(false);

        if (lastPairIdentifierRef.current !== pairIdentifier) {
            // Auto-scale and center the canvas view to fit both glyphs
            const allPaths = [...(baseGlyph?.paths || []), ...newMarkPaths];
            const hasDrawableContent = allPaths.some(p => (p.points?.length || 0) > 0 || (p.segmentGroups?.length || 0) > 0);

            if (allPaths.length === 0 || !hasDrawableContent) {
                setZoom(1);
                setViewOffset({ x: 0, y: 0 });
                lastPairIdentifierRef.current = pairIdentifier;
                return;
            }
        
            const CANVAS_DIM = 700; // The fixed size of the positioning canvas
            const PADDING = 100; // Add some padding around the glyphs
        
            const bbox = getAccurateGlyphBBox(allPaths, settings.strokeThickness);
            if (!bbox) {
                lastPairIdentifierRef.current = pairIdentifier;
                return;
            }
        
            const requiredWidth = bbox.width + PADDING * 2;
            const requiredHeight = bbox.height + PADDING * 2;
        
            if (requiredWidth <= 0 || requiredHeight <= 0) {
                lastPairIdentifierRef.current = pairIdentifier;
                return;
            }
        
            const newZoom = Math.min(
                CANVAS_DIM / requiredWidth,
                CANVAS_DIM / requiredHeight
            );
        
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
        
            const newViewOffset = {
                x: (CANVAS_DIM / 2) - (centerX * newZoom),
                y: (CANVAS_DIM / 2) - (centerY * newZoom)
            };
        
            setZoom(newZoom);
            setViewOffset(newViewOffset);
            lastPairIdentifierRef.current = pairIdentifier;
        }

    }, [baseChar, markChar, targetLigature, markPositioningMap, glyphDataMap, markAttachmentRules, baseBbox, metrics, baseGlyph, settings.strokeThickness, characterSets, pairIdentifier]);

     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (propertiesPanelRef.current && !propertiesPanelRef.current.contains(event.target as Node)) {
                const propertiesButton = document.getElementById('pos-properties-button');
                if (propertiesButton && propertiesButton.contains(event.target as Node)) {
                    return;
                }
                setIsPropertiesPanelOpen(false);
            }
        };
        if (isPropertiesPanelOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
      }, [isPropertiesPanelOpen]);
    
    const handleSave = useCallback((pathsToSave: Path[], isAutosave: boolean = false) => {
        const originalMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
        const originalBbox = getAccurateGlyphBBox(originalMarkPaths, settings.strokeThickness);
        const finalBbox = getAccurateGlyphBBox(pathsToSave, settings.strokeThickness);

        let finalOffset: Point = { x: 0, y: 0 };
        if (originalBbox && finalBbox) {
            finalOffset = {
                x: finalBbox.x - originalBbox.x,
                y: finalBbox.y - originalBbox.y
            };
        }
        
        const combinedPaths = [...(baseGlyph?.paths ?? []), ...pathsToSave];
        onSave(targetLigature, { paths: combinedPaths }, finalOffset, { lsb, rsb }, isAutosave);
        // OPTIMIZATION: Use deepClone
        setInitialMarkPaths(deepClone(pathsToSave)); // After saving, update initial state
    }, [glyphDataMap, markChar.unicode, baseGlyph?.paths, onSave, targetLigature, lsb, rsb, settings.strokeThickness]);

    useEffect(() => {
        return () => {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
        };
    }, []);
    
    const hasPathChanges = JSON.stringify(markPaths) !== JSON.stringify(initialMarkPaths);
    const hasBearingChanges = lsb !== targetLigature.lsb || rsb !== targetLigature.rsb;
    const hasUnsavedChanges = hasPathChanges || hasBearingChanges;

    const handlePathsChange = useCallback((newPaths: Path[]) => {
        setMarkPaths(newPaths);

        if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
            autosaveTimeout.current = window.setTimeout(() => {
                handleSave(newPaths, true);
            }, 500);
        }
    }, [settings.isAutosaveEnabled, handleSave]);

    useEffect(() => {
        if (settings.isAutosaveEnabled && hasBearingChanges) {
             if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
            autosaveTimeout.current = window.setTimeout(() => {
                handleSave(markPaths, true);
            }, 500);
        }
    }, [lsb, rsb, settings.isAutosaveEnabled, hasBearingChanges, handleSave, markPaths]);


    const otherAlignedMarksForBase = useMemo(() => {
        if (!positioningRules) return [];
        const markNames = new Set<string>();
        for (const rule of positioningRules) {
            if (rule.base.includes(baseChar.name)) {
                (rule.mark || []).forEach(m => markNames.add(m));
            }
        }

        return Array.from(markNames)
            .map(name => allChars.get(name))
            .filter((mc): mc is Character => !!mc && mc.unicode !== markChar.unicode)
            .filter(mc => markPositioningMap.has(`${baseChar.unicode}-${mc.unicode}`));
    }, [positioningRules, allChars, baseChar, markChar, markPositioningMap]);

    const handleReuse = (sourceMarkChar: Character) => {
        const sourceKey = `${baseChar.unicode}-${sourceMarkChar.unicode}`;
        const sourceOffset = markPositioningMap.get(sourceKey);

        if (sourceOffset) {
            const originalCurrentMarkPaths = glyphDataMap.get(markChar.unicode)?.paths ?? [];
            // OPTIMIZATION: Use deepClone
            const newMarkPaths = deepClone(originalCurrentMarkPaths);
            newMarkPaths.forEach((p: Path) => {
                p.points = p.points.map(pt => ({ x: pt.x + sourceOffset!.x, y: pt.y + sourceOffset!.y }));
                if (p.segmentGroups) {
                    p.segmentGroups = p.segmentGroups.map(group =>
                        group.map(seg => ({
                            ...seg,
                            point: { x: seg.point.x + sourceOffset!.x, y: seg.point.y + sourceOffset!.y }
                        }))
                    );
                }
            });
            handlePathsChange(newMarkPaths);
        }
        setIsReusePanelOpen(false);
    };

    const handleSelectionChange = useCallback((ids: Set<string>) => {
        setSelectedPathIds(ids);
    }, []);
    
    const [selectedPathIds, setSelectedPathIds] = useState(new Set<string>());
    useEffect(() => {
        setSelectedPathIds(new Set(markPaths.map(p => p.id)));
    }, [markPaths]);

    const handleZoom = (factor: number) => {
        const newZoom = Math.max(0.1, Math.min(10, zoom * factor));
        const center = { x: 700 / 2, y: 700 / 2 };
        const newOffset = {
            x: center.x - (center.x - viewOffset.x) * (newZoom / zoom),
            y: center.y - (center.y - viewOffset.y) * (newZoom / zoom)
        };
        setZoom(newZoom);
        setViewOffset(newOffset);
    };

    const executeNavigation = useCallback((direction: 'prev' | 'next' | 'back') => {
        if (direction === 'back') {
            onClose();
        } else if (direction === 'prev' && currentIndex !== null && currentIndex > 0) {
            onNavigate(currentIndex - 1);
        } else if (direction === 'next' && currentIndex !== null && currentIndex < allPairs.length - 1) {
            onNavigate(currentIndex + 1);
        }
    }, [onClose, currentIndex, onNavigate, allPairs.length]);

    const handleNavigationAttempt = useCallback((direction: 'prev' | 'next' | 'back') => {
        if (!settings.isAutosaveEnabled && hasUnsavedChanges) {
            setPendingNavigation(direction);
            setIsUnsavedModalOpen(true);
        } else {
            if (hasUnsavedChanges) {
                handleSave(markPaths);
            }
            executeNavigation(direction);
        }
    }, [settings.isAutosaveEnabled, hasUnsavedChanges, handleSave, markPaths, executeNavigation]);
    
    const handleConfirmSave = () => {
        handleSave(markPaths);
        if (pendingNavigation) {
            executeNavigation(pendingNavigation);
        }
        setIsUnsavedModalOpen(false);
        setPendingNavigation(null);
    };

    const handleConfirmDiscard = () => {
        if (pendingNavigation) {
            executeNavigation(pendingNavigation);
        }
        setIsUnsavedModalOpen(false);
        setPendingNavigation(null);
    };

    const handleCloseUnsavedModal = () => {
        setIsUnsavedModalOpen(false);
        setPendingNavigation(null);
    };

    const handleConfirmReset = useCallback(() => {
        onReset(baseChar, markChar, targetLigature);
        setIsResetConfirmOpen(false);
    }, [onReset, baseChar, markChar, targetLigature]);

    const prevPair = currentIndex !== null && currentIndex > 0 ? allPairs[currentIndex - 1] : null;
    const nextPair = currentIndex !== null && currentIndex < allPairs.length - 1 ? allPairs[currentIndex + 1] : null;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                return;
            }
      
            let handled = false;
      
            switch (e.key) {
                case 'ArrowLeft':
                    if (prevPair) {
                        handleNavigationAttempt('prev');
                        handled = true;
                    }
                    break;
                case 'ArrowRight':
                    if (nextPair) {
                        handleNavigationAttempt('next');
                        handled = true;
                    }
                    break;
            }
      
            if (handled) {
                e.preventDefault();
            }
        };
      
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [prevPair, nextPair, handleNavigationAttempt]);

    return (
        <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 relative">
            <header className="p-4 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0">
                 <div className="flex-1 flex justify-start">
                    <button
                        onClick={() => handleNavigationAttempt('back')}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                    >
                        <BackIcon />
                        <span className="hidden sm:inline">{t('back')}</span>
                    </button>
                </div>

                <div className="flex-1 flex justify-center items-center gap-2 sm:gap-4">
                    <button
                        onClick={() => handleNavigationAttempt('prev')}
                        disabled={!prevPair}
                        title={t('prevGlyph')}
                        className="flex items-center gap-2 p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <LeftArrowIcon />
                        <span className="hidden sm:inline text-xs lg:text-sm" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>{prevPair?.ligature.name}</span>
                    </button>
                    <div className="text-center">
                        <h2
                            className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white"
                            style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                        >
                            {targetLigature.name}
                        </h2>
                    </div>
                    <button
                        onClick={() => handleNavigationAttempt('next')}
                        disabled={!nextPair}
                        title={t('nextGlyph')}
                        className="flex items-center gap-2 p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <span className="hidden sm:inline text-xs lg:text-sm" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>{nextPair?.ligature.name}</span>
                        <RightArrowIcon />
                    </button>
                </div>
                
                 <div className="flex-1 flex justify-end items-center gap-2">
                    <button
                        onClick={() => setIsResetConfirmOpen(true)}
                        title={t('resetPosition')}
                        disabled={!isPositioned}
                        className="flex items-center gap-2 justify-center px-4 py-2 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        <UndoIcon />
                        <span className="hidden sm:inline">{t('resetPosition')}</span>
                    </button>
                    {isGsubPair && (
                        <div className="relative">
                            <button
                                id="pos-properties-button"
                                onClick={() => setIsPropertiesPanelOpen(p => !p)}
                                title={t('glyphProperties')}
                                className="flex items-center gap-2 justify-center p-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                                <PropertiesIcon />
                            </button>
                            {isPropertiesPanelOpen && (
                                <GlyphPropertiesPanel
                                  lsb={lsb}
                                  setLsb={setLsb}
                                  rsb={rsb}
                                  setRsb={setRsb}
                                  metrics={metrics}
                                  onClose={() => setIsPropertiesPanelOpen(false)}
                                />
                            )}
                        </div>
                    )}
                    {!settings.isAutosaveEnabled && (
                        <button onClick={() => handleSave(markPaths)} title={t('save')} className="p-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
                            <SaveIcon />
                        </button>
                    )}
                </div>
            </header>
            
            {/* Main Content Area: Centered, no forced flex-1 expansion on desktop to group tightly */}
            <main className={`flex-grow p-4 overflow-hidden flex flex-col-reverse lg:flex-row lg:justify-center lg:items-center gap-4 bg-gray-100 dark:bg-gray-900`}>
                <div className="flex-shrink-0 flex lg:flex-col justify-center">
                    <PositioningToolbar
                        onReuseClick={() => setIsReusePanelOpen(p => !p)}
                        pageTool={pageTool}
                        onToggleTool={() => setPageTool(t => t === 'select' ? 'pan' : 'select')}
                        onZoom={handleZoom}
                        isLargeScreen={isLargeScreen}
                    />
                </div>
                <div className={`min-w-0 min-h-0 flex justify-center items-center relative ${isLargeScreen ? 'lg:flex-none lg:h-full aspect-square' : 'flex-1 w-full'}`}>
                    {isReusePanelOpen && (
                        <div className="absolute top-0 left-4 z-20 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
                            <h4 className="font-bold text-gray-900 dark:text-white mb-2">{t('copyPositionFrom')}</h4>
                            {otherAlignedMarksForBase.length > 0 ? (
                                <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                                    {otherAlignedMarksForBase.map(mc => (
                                        <ReusePreviewCard
                                            key={mc.unicode}
                                            baseChar={baseChar}
                                            markChar={mc}
                                            onClick={() => handleReuse(mc)}
                                            glyphDataMap={glyphDataMap}
                                            strokeThickness={settings.strokeThickness}
                                            markPositioningMap={markPositioningMap}
                                            glyphVersion={glyphVersion}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">{t('noPositionsToCopy')}</p>
                            )}
                        </div>
                    )}
                    <div className={`shadow-lg rounded-md overflow-hidden aspect-square relative ${isLargeScreen ? 'w-full h-full' : 'max-w-full max-h-full'}`}>
                        <DrawingCanvas
                            width={700}
                            height={700}
                            paths={markPaths}
                            onPathsChange={handlePathsChange}
                            backgroundPaths={baseGlyph?.paths ?? []}
                            metrics={metrics}
                            tool={pageTool}
                            zoom={zoom}
                            setZoom={setZoom}
                            viewOffset={viewOffset}
                            setViewOffset={setViewOffset}
                            settings={settings}
                            allGlyphData={new Map()}
                            allCharacterSets={[]}
                            currentCharacter={targetLigature}
                            gridConfig={{ characterNameSize: 450 }}
                            backgroundImage={null}
                            backgroundImageOpacity={1}
                            imageTransform={null}
                            onImageTransformChange={() => {}}
                            selectedPathIds={selectedPathIds}
                            onSelectionChange={handleSelectionChange}
                            isImageSelected={false}
                            onImageSelectionChange={() => {}}
                            lsb={lsb}
                            rsb={rsb}
                            showBearingGuides={true}
                            disableTransformations={false}
                            transformMode="move-only"
                            movementConstraint={movementConstraint}
                            isInitiallyDrawn={true}
                        />
                    </div>
                </div>
            </main>
            <UnsavedChangesModal
                isOpen={isUnsavedModalOpen}
                onClose={handleCloseUnsavedModal}
                onSave={handleConfirmSave}
                onDiscard={handleConfirmDiscard}
            />
            <Modal
                isOpen={isResetConfirmOpen}
                onClose={() => setIsResetConfirmOpen(false)}
                title={t('confirmResetTitle')}
                footer={<>
                    <button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">{t('cancel')}</button>
                    <button onClick={handleConfirmReset} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">{t('reset')}</button>
                </>}
            >
                <p>{t('confirmResetSingleMessage', { name: targetLigature.name })}</p>
            </Modal>
        </div>
    );
};

export default React.memo(PositioningEditorPage);
