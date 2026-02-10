
import React, { useState, useMemo, useCallback } from 'react';
import { Character, GlyphData, FontMetrics, RecommendedKerning, KerningMap } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { SparklesIcon, UndoIcon, CheckCircleIcon, SearchIcon, GridViewIcon } from '../../constants';
import { calculateAutoKerning } from '../../services/kerningService';
import PairCard from '../PairCard';
import CharacterSelectionPanel from './CharacterSelectionPanel';
import CharacterSelectionRow from './CharacterSelectionRow';
import { useKerning } from '../../contexts/KerningContext';
import { useProject } from '../../contexts/ProjectContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useLayout } from '../../contexts/LayoutContext';
import AutoKerningProgressModal from '../AutoKerningProgressModal';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Modal from '../Modal';

interface KerningSelectionViewProps {
    filteredPairs: { left: Character, right: Character }[];
    onEditPair: (pair: { left: Character, right: Character }) => void;
    selectedLeftChars: Set<number>;
    setSelectedLeftChars: React.Dispatch<React.SetStateAction<Set<number>>>;
    selectedRightChars: Set<number>;
    setSelectedRightChars: React.Dispatch<React.SetStateAction<Set<number>>>;
    mode: 'recommended' | 'all' | 'spaced';
    showRecommendedLabel: boolean;
    hasHiddenRecommended?: boolean;
    kerningMap: KerningMap;
    suggestedKerningMap: KerningMap;
    onAcceptSuggestions: (keys: string[]) => void;
    onSwitchToAllPairs?: () => void;
    emptyStateTitle?: string;
    emptyStateMessage?: string;
}

const KerningSelectionView: React.FC<KerningSelectionViewProps> = ({ 
    filteredPairs, onEditPair, selectedLeftChars, setSelectedLeftChars, selectedRightChars, setSelectedRightChars, mode, showRecommendedLabel,
    hasHiddenRecommended, kerningMap, suggestedKerningMap, onAcceptSuggestions, onSwitchToAllPairs,
    emptyStateTitle, emptyStateMessage
}) => {
    const { t } = useLocale();
    const { showNotification, filterMode, searchQuery, setFilterMode } = useLayout();
    const { queueAutoKern, dispatch: kerningDispatch, discoverKerning } = useKerning();
    const { characterSets, allCharsByUnicode, setRecommendedKerning, recommendedKerning } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { settings, metrics } = useSettings();

    const [isAutoKerning, setIsAutoKerning] = useState(false);
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [kerningProgressValue, setKerningProgressValue] = useState(0);
    const [isResetVisibleConfirmOpen, setIsResetVisibleConfirmOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const isLargeScreen = useMediaQuery('(min-width: 1024px)');
    const PAGE_SIZE = isLargeScreen ? 100 : 20;

    const drawnCharacters = useMemo(() => {
        return characterSets?.flatMap(s => s.characters)
            .filter(c => !c.hidden && c.unicode !== undefined && glyphDataMap.has(c.unicode))
            .sort((a,b) => a.unicode! - b.unicode!) || [];
    }, [characterSets, glyphDataMap, glyphVersion]);

    const totalPages = Math.ceil(filteredPairs.length / PAGE_SIZE);
    const paginatedPairs = filteredPairs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handleAutoKern = async () => {
        if (!metrics || !settings) return;
        setIsAutoKerning(true);
        const pairsToKern = filteredPairs.filter(p => !kerningMap.has(`${p.left.unicode}-${p.right.unicode}`));
        
        if (pairsToKern.length === 0) {
            showNotification(t('noPairsToKern'), 'info');
            setIsAutoKerning(false);
            return;
        }

        setIsProgressModalOpen(true);
        const results = await calculateAutoKerning(pairsToKern, glyphDataMap, metrics, settings.strokeThickness, setKerningProgressValue, recommendedKerning);
        if (results.size > 0) {
            kerningDispatch({ type: 'SET_SUGGESTIONS', payload: results });
            showNotification(t('autoKerningComplete', { count: results.size }), 'success');
        }
        setIsProgressModalOpen(false);
        setIsAutoKerning(false);
    };
    
    const handleDiscoverKerning = async () => {
        setIsAutoKerning(true);
        setIsProgressModalOpen(true);
        setKerningProgressValue(0);

        // Determine calculation mode based on settings
        const shouldCalculateValues = settings?.isBackgroundAutoKerningEnabled ?? false;

        const resultsMap = await discoverKerning((progress) => {
            setKerningProgressValue(progress);
        }, shouldCalculateValues, true); // Return results, do NOT dispatch to suggestions

        setIsProgressModalOpen(false);
        setIsAutoKerning(false);
        
        if (resultsMap.size > 0) {
            // Merge results into recommendedKerning list
            const newPairs: RecommendedKerning[] = [];
            const existingSet = new Set(recommendedKerning?.map(r => `${r[0]}-${r[1]}`));

            resultsMap.forEach((val, key) => {
                 const [lUni, rUni] = key.split('-').map(Number);
                 const lChar = allCharsByUnicode.get(lUni);
                 const rChar = allCharsByUnicode.get(rUni);
                 
                 if (lChar && rChar) {
                     const pairKey = `${lChar.name}-${rChar.name}`;
                     if (!existingSet.has(pairKey)) {
                         newPairs.push([lChar.name, rChar.name]);
                         existingSet.add(pairKey);
                     }
                 }
            });

            if (newPairs.length > 0) {
                setRecommendedKerning([...(recommendedKerning || []), ...newPairs]);
                showNotification(`Scan complete. ${newPairs.length} new pairs added to Recommendations.`, 'success');
            } else {
                showNotification("Scan complete. All colliding pairs are already in recommendations.", 'info');
            }

        } else {
            showNotification("Scan complete. No new collisions found.", 'info');
        }
    };

    const handleResetVisible = () => {
        const newMap = new Map(kerningMap);
        const keysToRemove: string[] = [];
        let count = 0;
        
        filteredPairs.forEach(p => {
            const key = `${p.left.unicode}-${p.right.unicode}`;
            let modified = false;

            // 1. Remove from saved map
            if (newMap.has(key)) { 
                newMap.delete(key); 
                modified = true; 
            }
            
            // 2. Remove from suggestions map
            if (suggestedKerningMap.has(key)) {
                keysToRemove.push(key);
                modified = true;
            }

            if (modified) count++;
        });

        kerningDispatch({ type: 'SET_MAP', payload: newMap });
        
        if (keysToRemove.length > 0) {
            kerningDispatch({ type: 'REMOVE_SUGGESTIONS', payload: keysToRemove });
        }
        
        showNotification(t('kerningResetSuccess', { count }), 'success');
        setIsResetVisibleConfirmOpen(false);
    };

    const isSearching = searchQuery.trim().length > 0;
    const isFiltered = filterMode !== 'none' || isSearching;

    // Use "Filter" title for both Recommended and Spaced modes
    const leftTitle = mode === 'all' ? "kerningSelectLeftChars" : "kerningFilterLeftChars";
    const rightTitle = mode === 'all' ? "kerningSelectRightChars" : "kerningFilterRightChars";

    const unreviewedCount = useMemo(() => {
        let count = 0;
        for (const p of filteredPairs) {
            const key = `${p.left.unicode}-${p.right.unicode}`;
            // It matches if it has a suggestion but no manual kerning
            if (suggestedKerningMap.has(key) && !kerningMap.has(key)) {
                count++;
            }
        }
        return count;
    }, [filteredPairs, suggestedKerningMap, kerningMap]);
    
    const handleAcceptVisibleSuggestions = () => {
        const keysToAccept: string[] = [];
        for (const p of filteredPairs) {
            const key = `${p.left.unicode}-${p.right.unicode}`;
            if (suggestedKerningMap.has(key) && !kerningMap.has(key)) {
                keysToAccept.push(key);
            }
        }
        if (keysToAccept.length > 0) {
            onAcceptSuggestions(keysToAccept);
        }
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-1 overflow-hidden">
                {isLargeScreen && (
                    <div className="w-64 flex-shrink-0 h-full border-r dark:border-gray-700">
                        <CharacterSelectionPanel title={leftTitle} characters={drawnCharacters} selectedChars={selectedLeftChars} onSelectionChange={(u, s) => setSelectedLeftChars(prev => { const n = new Set(prev); s ? n.add(u) : n.delete(u); return n; })} onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode!)))} onSelectNone={() => setSelectedLeftChars(new Set())} />
                    </div>
                )}
                
                <main className="flex-1 flex flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                    {mode === 'recommended' && hasHiddenRecommended && !isFiltered && (
                        <div className="flex-shrink-0 m-4 p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-blue-700 dark:text-blue-300">
                            {t('kerningShowOnlyComplete')}
                        </div>
                    )}

                    {!isLargeScreen && (
                        <div className="p-4 space-y-4 border-b dark:border-gray-700">
                             <CharacterSelectionRow title={leftTitle} characters={drawnCharacters} selectedChars={selectedLeftChars} onSelectionChange={(u, s) => setSelectedLeftChars(prev => { const n = new Set(prev); s ? n.add(u) : n.delete(u); return n; })} onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode!)))} onSelectNone={() => setSelectedLeftChars(new Set())} />
                             <CharacterSelectionRow title={rightTitle} characters={drawnCharacters} selectedChars={selectedRightChars} onSelectionChange={(u, s) => setSelectedRightChars(prev => { const n = new Set(prev); s ? n.add(u) : n.delete(u); return n; })} onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode!)))} onSelectNone={() => setSelectedRightChars(new Set())} />
                        </div>
                    )}

                    <div className="p-4 border-b dark:border-gray-700 flex items-center gap-4 flex-wrap bg-white dark:bg-gray-800">
                        <button onClick={handleAutoKern} disabled={isAutoKerning} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"><SparklesIcon /> {t('autoKern')}</button>
                        
                        <button onClick={handleDiscoverKerning} disabled={isAutoKerning} className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors" title="Scan all characters for geometric collisions">
                             <SearchIcon className="w-4 h-4" />
                             <span>Detect new pairs</span>
                        </button>

                        {unreviewedCount > 0 && (
                            <button onClick={handleAcceptVisibleSuggestions} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                                <CheckCircleIcon className="w-4 h-4" />
                                Accept Suggestions ({unreviewedCount})
                            </button>
                        )}
                        <button onClick={() => setIsResetVisibleConfirmOpen(true)} disabled={kerningMap.size === 0 && suggestedKerningMap.size === 0} className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors"><UndoIcon /> {t('resetVisible')}</button>
                    </div>

                    <div className="flex-grow">
                        {paginatedPairs.length > 0 ? (
                            <div className="p-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
                                {paginatedPairs.map(p => {
                                    const key = `${p.left.unicode}-${p.right.unicode}`;
                                    const savedValue = kerningMap.get(key);
                                    const suggestedValue = suggestedKerningMap.get(key);
                                    const isSuggested = savedValue === undefined && suggestedValue !== undefined;

                                    return (
                                        <PairCard 
                                            key={key} 
                                            pair={p} 
                                            onClick={() => onEditPair(p)} 
                                            isRecommended={mode === 'recommended'} 
                                            showRecommendedLabel={showRecommendedLabel} 
                                            kerningValue={savedValue ?? suggestedValue}
                                            isSuggested={isSuggested}
                                            glyphDataMap={glyphDataMap} 
                                            strokeThickness={settings!.strokeThickness} 
                                            metrics={metrics!} 
                                            glyphVersion={glyphVersion} 
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-20 text-gray-400 dark:text-gray-500 text-center h-full">
                                {emptyStateMessage ? (
                                     <>
                                        <div className="mb-4 opacity-10">
                                            <GridViewIcon className="w-24 h-24" />
                                        </div> 
                                        {emptyStateTitle && <h3 className="text-xl font-bold mb-2 text-gray-600 dark:text-gray-300">{emptyStateTitle}</h3>}
                                        <p className="text-lg max-w-md mx-auto">{emptyStateMessage}</p>
                                     </>
                                ) : (
                                     mode === 'spaced' ? (
                                          <p className="italic text-lg">No manually spaced pairs yet.</p>
                                     ) : (
                                          <span className="italic text-lg">{t('noResultsFound')}</span>
                                     )
                                )}
                            </div>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div className="p-6 border-t dark:border-gray-700 flex justify-center gap-4">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg disabled:opacity-50">Prev</button>
                            <span className="self-center">Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg disabled:opacity-50">Next</button>
                        </div>
                    )}
                </main>

                {isLargeScreen && (
                    <div className="w-64 flex-shrink-0 h-full border-l dark:border-gray-700">
                        <CharacterSelectionPanel title={rightTitle} characters={drawnCharacters} selectedChars={selectedRightChars} onSelectionChange={(u, s) => setSelectedRightChars(prev => { const n = new Set(prev); s ? n.add(u) : n.delete(u); return n; })} onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode!)))} onSelectNone={() => setSelectedRightChars(new Set())} />
                    </div>
                )}
            </div>

            <AutoKerningProgressModal isOpen={isProgressModalOpen} progress={kerningProgressValue} />
            <Modal isOpen={isResetVisibleConfirmOpen} onClose={() => setIsResetVisibleConfirmOpen(false)} title={t('resetVisibleTitle')} footer={<><button onClick={() => setIsResetVisibleConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={handleResetVisible} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button></>}><p>{t('resetVisibleMessage', { count: filteredPairs.length })}</p></Modal>
        </div>
    );
};

export default React.memo(KerningSelectionView);
