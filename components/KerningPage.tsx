
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Character, GlyphData, FontMetrics, CharacterSet, KerningMap, RecommendedKerning, AppSettings } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { SparklesIcon, LeftArrowIcon, RightArrowIcon, UndoIcon } from '../constants';
import { calculateAutoKerning } from '../services/kerningService';
import PairCard from './PairCard';
import CharacterSelectionPanel from './kerning/CharacterSelectionPanel';
import CharacterSelectionRow from './kerning/CharacterSelectionRow';
import { useKerning } from '../contexts/KerningContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { isGlyphDrawn as isGlyphDrawnUtil } from '../utils/glyphUtils';
import AutoKerningProgressModal from './AutoKerningProgressModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Modal from './Modal';
import KerningEditorPage from './KerningEditorPage';

interface KerningPageProps {
  recommendedKerning: RecommendedKerning[] | null;
  editorMode: 'simple' | 'advanced';
  mode: 'recommended' | 'all';
  showRecommendedLabel: boolean;
}

const KerningPage: React.FC<KerningPageProps> = ({ recommendedKerning, editorMode, mode, showRecommendedLabel }) => {
    const { t } = useLocale();
    const { showNotification, pendingNavigationTarget, setPendingNavigationTarget } = useLayout();
    const { characterSets, allCharsByName } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { settings, metrics } = useSettings();
    
    // Changed: Track index in filtered list instead of object
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    
    const [selectedLeftChars, setSelectedLeftChars] = useState(new Set<number>());
    const [selectedRightChars, setSelectedRightChars] = useState(new Set<number>());
    const [isAutoKerning, setIsAutoKerning] = useState(false);
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [kerningProgressValue, setKerningProgressValue] = useState(0);
    const [showOnlyUnkerned, setShowOnlyUnkerned] = useState(false);
    const [isResetVisibleConfirmOpen, setIsResetVisibleConfirmOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');
    const PAGE_SIZE = isLargeScreen ? 100 : 20;

    const allCharsByUnicode = useMemo(() => {
        const map = new Map<number, Character>();
        characterSets!.flatMap(set => set.characters).forEach(char => {
            if (char.unicode) {
              map.set(char.unicode, char);
            }
        });
        return map;
    }, [characterSets]);
    
    const isGlyphDrawn = useCallback((char: Character): boolean => {
        if (!char || char.unicode === undefined) return false;
        return isGlyphDrawnUtil(glyphDataMap.get(char.unicode));
    }, [glyphDataMap, glyphVersion]);

    const drawnCharacters = useMemo(() => {
        return Array.from(allCharsByUnicode.values())
            .filter((char: Character) => !char.hidden && isGlyphDrawn(char))
            .sort((a: Character, b: Character) => (a.unicode || 0) - (b.unicode || 0));
    }, [allCharsByUnicode, isGlyphDrawn]);
    
    const areAllRecGlyphsDrawn = useMemo(() => {
        if (!recommendedKerning) return true;
        for (const [leftName, rightName] of recommendedKerning) {
            const leftChar = allCharsByName.get(leftName);
            const rightChar = allCharsByName.get(rightName);
            if (!leftChar || !rightChar || !isGlyphDrawn(leftChar) || !isGlyphDrawn(rightChar)) {
                return false; // Found a recommended pair with undrawn glyphs
            }
        }
        return true; // All recommended pairs have drawn glyphs
    }, [recommendedKerning, isGlyphDrawn, allCharsByName]);
    
    const drawnRecommendedKerning = useMemo(() => {
        if (!recommendedKerning) return [];
        return recommendedKerning.filter(([left, right]) => {
            const leftChar = allCharsByName.get(left);
            const rightChar = allCharsByName.get(right);
            return !!(leftChar && rightChar && isGlyphDrawn(leftChar) && isGlyphDrawn(rightChar));
        });
    }, [recommendedKerning, isGlyphDrawn, allCharsByName]);

    const allPairsToDisplay = useMemo(() => {
        if (mode === 'recommended') {
            let pairs = drawnRecommendedKerning.map(([left, right]) => ({
                left: allCharsByName.get(left)!,
                right: allCharsByName.get(right)!,
            }));
            if (selectedLeftChars.size > 0 || selectedRightChars.size > 0) {
                pairs = pairs.filter(pair => {
                    const leftMatch = selectedLeftChars.size === 0 || selectedLeftChars.has(pair.left.unicode!);
                    const rightMatch = selectedRightChars.size === 0 || selectedRightChars.has(pair.right.unicode!);
                    return leftMatch && rightMatch;
                });
            }
            return pairs;
        } else { // 'all' mode
            const combinedList: { left: Character, right: Character }[] = [];
            
            if (selectedLeftChars.size === 0 && selectedRightChars.size === 0) {
                // REVIEW MODE: No selection, show all currently kerned pairs
                kerningMap.forEach((_, key) => {
                    const [leftUnicode, rightUnicode] = key.split('-').map(Number);
                    const leftChar = allCharsByUnicode.get(leftUnicode);
                    const rightChar = allCharsByUnicode.get(rightUnicode);
                    // Only include if the characters still exist in the project
                    if (leftChar && rightChar) {
                         combinedList.push({ left: leftChar, right: rightChar });
                    }
                });
            } else if (selectedLeftChars.size > 0 && selectedRightChars.size > 0) {
                // GENERATOR MODE: Both sides selected, generate cross-product
                for (const leftUnicode of selectedLeftChars) {
                    for (const rightUnicode of selectedRightChars) {
                        const leftChar = allCharsByUnicode.get(leftUnicode);
                        const rightChar = allCharsByUnicode.get(rightUnicode);
                        if (leftChar && rightChar && isGlyphDrawn(leftChar) && isGlyphDrawn(rightChar)) {
                            combinedList.push({ left: leftChar, right: rightChar });
                        }
                    }
                }
            }
            return combinedList.sort((a,b) => a.left.name.localeCompare(b.left.name) || a.right.name.localeCompare(b.right.name));
        }
    }, [mode, drawnRecommendedKerning, allCharsByName, selectedLeftChars, selectedRightChars, allCharsByUnicode, isGlyphDrawn, kerningMap]);

    const filteredPairsToDisplay = useMemo(() => {
        if (!showOnlyUnkerned) {
            return allPairsToDisplay;
        }
        return allPairsToDisplay.filter(pair => {
            if (!pair.left || !pair.right) return false;
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            return !kerningMap.has(key);
        });
    }, [allPairsToDisplay, showOnlyUnkerned, kerningMap]);
    
    const visibleKernedCount = useMemo(() => {
        return filteredPairsToDisplay.reduce((count, pair) => {
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            return kerningMap.has(key) ? count + 1 : count;
        }, 0);
    }, [filteredPairsToDisplay, kerningMap]);

    const totalPages = useMemo(() => Math.ceil(filteredPairsToDisplay.length / PAGE_SIZE), [filteredPairsToDisplay.length, PAGE_SIZE]);

    useEffect(() => {
        // Don't reset page if we are returning from editor (preserving context)
        if (editingIndex === null) {
             setCurrentPage(1);
        }
    }, [filteredPairsToDisplay.length, mode, selectedLeftChars, selectedRightChars, showOnlyUnkerned]); 

    const paginatedPairs = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return filteredPairsToDisplay.slice(startIndex, startIndex + PAGE_SIZE);
    }, [currentPage, PAGE_SIZE, filteredPairsToDisplay]);

    // --- Deep Linking Handling ---
    useEffect(() => {
        if (!pendingNavigationTarget) return;
        
        const [leftId, rightId] = pendingNavigationTarget.split('-').map(Number);
        // Find index in current list (might need to switch view/filters if not found, but basic handling first)
        const index = filteredPairsToDisplay.findIndex(p => p.left.unicode === leftId && p.right.unicode === rightId);
        
        if (index !== -1) {
            setEditingIndex(index);
            setPendingNavigationTarget(null);
        } else {
             // If not in current view, maybe we need to switch modes? 
             // For now, simple deep linking assumes user can find it via search which sets correct workspace state.
        }
    }, [pendingNavigationTarget, filteredPairsToDisplay, setPendingNavigationTarget]);


    const handleSaveKerning = (pair: {left: Character, right: Character}, value: number) => {
        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        const newMap = new Map(kerningMap);
        newMap.set(key, value);
        kerningDispatch({ type: 'SET_MAP', payload: newMap });
    };

    const handleRemoveKerning = (pair: {left: Character, right: Character}) => {
        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        const newMap = new Map(kerningMap);
        if (newMap.has(key)) {
            newMap.delete(key);
            kerningDispatch({ type: 'SET_MAP', payload: newMap });
        }
    };

    const handleLeftSelectionChange = useCallback((unicode: number, isSelected: boolean) => {
        setSelectedLeftChars(prev => {
            const newSet = new Set(prev);
            isSelected ? newSet.add(unicode) : newSet.delete(unicode);
            return newSet;
        });
    }, []);

    const handleRightSelectionChange = useCallback((unicode: number, isSelected: boolean) => {
        setSelectedRightChars(prev => {
            const newSet = new Set(prev);
            isSelected ? newSet.add(unicode) : newSet.delete(unicode);
            return newSet;
        });
    }, []);

    const handleAutoKern = async () => {
        if (!metrics || !settings) return;
        setIsAutoKerning(true);
    
        const pairsToKern = allPairsToDisplay.filter(pair => {
            if (!pair.left || !pair.right) return false;
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            return !kerningMap.has(key) && isGlyphDrawn(pair.left) && isGlyphDrawn(pair.right);
        });
        
        if (pairsToKern.length === 0) {
            showNotification(t('noPairsToKern'), 'info');
            setIsAutoKerning(false);
            return;
        }

        setKerningProgressValue(0);
        setIsProgressModalOpen(true);
    
        const onProgressUpdate = (progress: number) => {
            setKerningProgressValue(progress);
        };
    
        const newKerningValues = await calculateAutoKerning(
            pairsToKern,
            glyphDataMap,
            metrics,
            settings.strokeThickness,
            onProgressUpdate,
            recommendedKerning
        );
    
        if (newKerningValues.size > 0) {
            kerningDispatch({ type: 'SET_MAP', payload: new Map([...kerningMap, ...newKerningValues]) });
            showNotification(t('autoKerningComplete', { count: newKerningValues.size }), 'success');
        } else {
            showNotification(t('autoKerningNoChange'), 'info');
        }
        
        setIsProgressModalOpen(false);
        setIsAutoKerning(false);
    };
    
    const handleResetVisibleKerning = () => {
        const newMap = new Map(kerningMap);
        let count = 0;
        filteredPairsToDisplay.forEach(pair => {
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            if (newMap.has(key)) {
                newMap.delete(key);
                count++;
            }
        });
    
        if (count > 0) {
            kerningDispatch({ type: 'SET_MAP', payload: newMap });
            showNotification(t('kerningResetSuccess', { count }), 'success');
        }
        setIsResetVisibleConfirmOpen(false);
    };

    const handleNavigateEditor = (direction: 'prev' | 'next') => {
        if (editingIndex === null) return;
        if (direction === 'prev' && editingIndex > 0) setEditingIndex(editingIndex - 1);
        if (direction === 'next' && editingIndex < filteredPairsToDisplay.length - 1) setEditingIndex(editingIndex + 1);
    };

    if (!settings || !metrics) return null;

    const noCharsDrawnText = editorMode === 'simple' ? t('spacingNoCharsDrawn') : t('kerningNoCharsDrawn');
    const showOnlyCompleteText = editorMode === 'simple' ? t('spacingShowOnlyComplete') : t('kerningShowOnlyComplete');

    const leftTitleKey = mode === 'recommended' ? 'kerningFilterLeftChars' : 'kerningSelectLeftChars';
    const rightTitleKey = mode === 'recommended' ? 'kerningFilterRightChars' : 'kerningSelectRightChars';

    // --- Render Editor ---
    if (editingIndex !== null) {
        const pair = filteredPairsToDisplay[editingIndex];
        if (!pair) { setEditingIndex(null); return null; } // Safety check

        const key = `${pair.left.unicode}-${pair.right.unicode}`;
        const initialValue = kerningMap.get(key) ?? 0;

        return (
            <KerningEditorPage
                pair={pair}
                initialValue={initialValue}
                glyphDataMap={glyphDataMap}
                strokeThickness={settings.strokeThickness}
                metrics={metrics}
                settings={settings}
                recommendedKerning={recommendedKerning}
                onSave={(val) => handleSaveKerning(pair, val)}
                onRemove={() => { handleRemoveKerning(pair); setEditingIndex(null); }}
                onClose={() => setEditingIndex(null)}
                onNavigate={handleNavigateEditor}
                hasPrev={editingIndex > 0}
                hasNext={editingIndex < filteredPairsToDisplay.length - 1}
                glyphVersion={glyphVersion}
            />
        );
    }

    // --- Render Grid ---
    const renderContent = () => {
        if (drawnCharacters.length === 0) {
            return (
                <div className="flex-grow text-center p-8 bg-gray-100 dark:bg-gray-800 rounded-lg m-4">
                    <p className="text-gray-600 dark:text-gray-400">{noCharsDrawnText}</p>
                </div>
            );
        }

        if (filteredPairsToDisplay.length > 0) {
             return (
                    <>
                        <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
                            {paginatedPairs.map((pair, index) => {
                                if (!pair.left || !pair.right) return null;
                                const key = `${pair.left.unicode}-${pair.right.unicode}`;
                                const isRec = recommendedKerning?.some(rec => rec[0] === pair.left.name && rec[1] === pair.right.name);
                                // Calculate actual index in full list for click handler
                                const realIndex = ((currentPage - 1) * PAGE_SIZE) + index;
                                
                                return (
                                    <PairCard
                                        key={key + index}
                                        pair={pair}
                                        onClick={() => setEditingIndex(realIndex)}
                                        isRecommended={!!isRec}
                                        showRecommendedLabel={showRecommendedLabel}
                                        kerningValue={kerningMap.get(key)}
                                        glyphDataMap={glyphDataMap}
                                        strokeThickness={settings.strokeThickness}
                                        metrics={metrics}
                                        glyphVersion={glyphVersion}
                                    />
                                );
                            })}
                        </div>
                        {totalPages > 1 && (
                            <div className="p-4 flex justify-center items-center gap-4 text-sm">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <LeftArrowIcon className="h-4 w-4" />
                                    <span>{t('previous')}</span>
                                </button>
                                <span>
                                    {t('page')} {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>{t('next')}</span>
                                    <RightArrowIcon className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </>
                );
        }

        // If no pairs are displayed, determine the appropriate empty state message.
        if (mode === 'all') {
            const isReviewMode = selectedLeftChars.size === 0 && selectedRightChars.size === 0;
            const isPartialSelection = !isReviewMode && (selectedLeftChars.size === 0 || selectedRightChars.size === 0);

            if (isReviewMode) {
                if (kerningMap.size === 0) {
                    return (
                        <div className="flex-grow flex items-center justify-center text-center p-8">
                            <div className="max-w-md">
                                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">{t('kerningGeneratePairsTitle')}</h3>
                                <p className="text-gray-600 dark:text-gray-400">{t('kerningGeneratePairsBody')}</p>
                            </div>
                        </div>
                    );
                } else {
                    return (
                        <div className="flex-grow flex items-center justify-center text-center p-8">
                             <p className="text-gray-500 dark:text-gray-400">{t('noResultsFound')}</p>
                        </div>
                    );
                }
            }
            
            if (isPartialSelection) {
                 return (
                    <div className="flex-grow flex items-center justify-center text-center p-8">
                        <div className="max-w-md">
                            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">{t('kerningGeneratePairsTitle')}</h3>
                            <p className="text-gray-600 dark:text-gray-400">{t('kerningGeneratePairsBody')}</p>
                        </div>
                    </div>
                );
            }
        }

        return (
             <div className="flex-grow flex items-center justify-center text-center p-8">
                <p className="text-gray-500 dark:text-gray-400">
                   {t('noResultsFound')}
                </p>
             </div>
        );
    };
    
    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-1 overflow-hidden">
                {/* Desktop Left Panel */}
                <div className="hidden lg:flex lg:w-64 flex-shrink-0 h-full">
                    <CharacterSelectionPanel
                        title={leftTitleKey}
                        characters={drawnCharacters}
                        selectedChars={selectedLeftChars}
                        onSelectionChange={handleLeftSelectionChange}
                        onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode!)))}
                        onSelectNone={() => setSelectedLeftChars(new Set())}
                    />
                </div>
                <main className="flex-1 flex flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                    {/* Mobile Selection Rows */}
                    <div className="block lg:hidden p-4 space-y-4 border-b dark:border-gray-700">
                        <CharacterSelectionRow
                            title={leftTitleKey}
                            characters={drawnCharacters}
                            selectedChars={selectedLeftChars}
                            onSelectionChange={handleLeftSelectionChange}
                            onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode!)))}
                            onSelectNone={() => setSelectedLeftChars(new Set())}
                        />
                        <CharacterSelectionRow
                            title={rightTitleKey}
                            characters={drawnCharacters}
                            selectedChars={selectedRightChars}
                            onSelectionChange={handleRightSelectionChange}
                            onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode!)))}
                            onSelectNone={() => setSelectedRightChars(new Set())}
                        />
                    </div>
                     {/* Main Grid */}
                    <div className="flex-grow flex flex-col">
                         <div className="p-4 border-b dark:border-gray-700 flex items-center gap-4 flex-wrap">
                            <button 
                                onClick={handleAutoKern} 
                                disabled={isAutoKerning}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-wait transition-colors"
                            >
                                <SparklesIcon />
                                {isAutoKerning ? t('autoKerningInProgress') : t('autoKern')} 
                            </button>
                            
                            <button 
                                onClick={() => setIsResetVisibleConfirmOpen(true)}
                                disabled={visibleKernedCount === 0}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 disabled:bg-yellow-400 disabled:cursor-not-allowed transition-colors"
                            >
                                <UndoIcon />
                                {t('resetVisible')}
                            </button>

                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                                <span>{t('kerningShowUnkernedOnly')}</span>
                                <div className="relative inline-flex items-center">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        id="unkerned-toggle"
                                        checked={showOnlyUnkerned}
                                        onChange={(e) => setShowOnlyUnkerned(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                </div>
                            </label>
                        </div>
                        {!areAllRecGlyphsDrawn && mode === 'recommended' && (
                            <div className="mx-4 mt-4 p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-blue-700 dark:text-blue-300">
                                {showOnlyCompleteText}
                            </div>
                        )}
                        {renderContent()}
                    </div>
                </main>
                {/* Desktop Right Panel */}
                <div className="hidden lg:flex lg:w-64 flex-shrink-0 h-full">
                    <CharacterSelectionPanel
                        title={rightTitleKey}
                        characters={drawnCharacters}
                        selectedChars={selectedRightChars}
                        onSelectionChange={handleRightSelectionChange}
                        onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode!)))}
                        onSelectNone={() => setSelectedRightChars(new Set())}
                    />
                </div>
            </div>
            {isProgressModalOpen && (
                <AutoKerningProgressModal isOpen={isProgressModalOpen} progress={kerningProgressValue} />
            )}
            <Modal
                isOpen={isResetVisibleConfirmOpen}
                onClose={() => setIsResetVisibleConfirmOpen(false)}
                title={t('resetVisibleTitle')}
                footer={
                    <>
                        <button onClick={() => setIsResetVisibleConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">{t('cancel')}</button>
                        <button onClick={handleResetVisibleKerning} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">{t('reset')}</button>
                    </>
                }
            >
                <p>{t('resetVisibleMessage', { count: visibleKernedCount })}</p>
            </Modal>
        </div>
    );
};


export default React.memo(KerningPage);
