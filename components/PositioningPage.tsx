
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { AppSettings, Character, CharacterSet, FontMetrics, GlyphData, MarkAttachmentRules, PositioningRules, AttachmentClass, Point } from '../types';
import PositioningEditorPage from './PositioningEditorPage';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useProject } from '../contexts/ProjectContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useRules } from '../contexts/RulesContext';
import Modal from './Modal';
import { usePositioningData } from '../hooks/positioning/usePositioningData';
import { usePositioningActions } from '../hooks/positioning/usePositioningActions';
import PositioningHeader from './positioning/PositioningHeader';
import PositioningRulesView from './positioning/PositioningRulesView';
import PositioningGridView from './positioning/PositioningGridView';
import { usePositioning } from '../contexts/PositioningContext';
import { expandMembers } from '../services/groupExpansionService';

// Main Positioning Page Component
interface PositioningPageProps {
    positioningRules: PositioningRules[] | null;
    markAttachmentRules: MarkAttachmentRules | null;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    fontRules: any;
}

const PositioningPage: React.FC<PositioningPageProps> = ({
    positioningRules, markAttachmentRules, fontRules, markAttachmentClasses, baseAttachmentClasses
}) => {
    const { t } = useLocale();
    const { filterMode, searchQuery, showNotification, pendingNavigationTarget, setPendingNavigationTarget } = useLayout();
    const { glyphDataMap, version: glyphVersion, dispatch: glyphDataDispatch } = useGlyphData();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { characterSets, allCharsByName: allChars } = useProject();
    const { settings, metrics } = useSettings();
    const { state: rulesState } = useRules();
    
    const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);

    // View Mode State: 'rules' (New Default) | 'base' | 'mark'
    const [viewMode, setViewMode] = useState<'rules' | 'base' | 'mark'>('rules');
    
    // Rule Drill-Down State
    const [selectedRuleGroupId, setSelectedRuleGroupId] = useState<number | null>(null);
    const [rulePage, setRulePage] = useState(1);
    const ITEMS_PER_PAGE = 36;
    
    // For 'base'/'mark' modes (Grid View)
    const [activeTab, setActiveTab] = useState(0);
    
    // Shared Editing State
    const [editingPair, setEditingPair] = useState<{ base: Character, mark: Character, ligature: Character } | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    
    // We need to know WHICH list we are editing (Grid or Rule) to support navigation properly
    const [editingContextList, setEditingContextList] = useState<{ base: Character, mark: Character, ligature: Character }[]>([]);

    const [isReuseModalOpen, setIsReuseModalOpen] = useState(false);
    const [reuseSourceItem, setReuseSourceItem] = useState<Character | null>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    
    // Ref map to scroll cards into view
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    
    const isSearching = searchQuery.trim().length > 0;
    const isFiltered = filterMode !== 'none' || isSearching;

    // --- HOOKS ---
    const { 
        positioningData, 
        ruleGroups, 
        activeRuleGroup, 
        getPairClassKey, 
        classCounts, 
        uniqueRepPairs, 
        pagedRulePairs, 
        ruleTotalPages, 
        navItems, 
        activeItem, 
        displayedCombinations,
        hasIncompleteData 
    } = usePositioningData({
        positioningRules,
        fontRules,
        characterSets,
        glyphDataMap,
        allChars,
        groups,
        baseAttachmentClasses,
        markAttachmentClasses,
        markPositioningMap,
        filterMode,
        searchQuery,
        viewMode,
        activeTab,
        selectedRuleGroupId,
        rulePage,
        ITEMS_PER_PAGE
    });

    const {
        savePositioningUpdate,
        handleConfirmPosition,
        handleAcceptAllDefaults,
        handleCopyPositions,
        handleResetPositions,
        handleResetSinglePair
    } = usePositioningActions({
        glyphDataMap,
        markPositioningMap,
        characterSets: characterSets!,
        positioningRules,
        markAttachmentRules,
        markAttachmentClasses,
        baseAttachmentClasses,
        groups,
        settings,
        metrics: metrics!,
        allChars,
        allLigaturesByKey: positioningData.allLigaturesByKey,
        displayedCombinations,
        viewMode
    });
    
    // Fix for Tab Overflow Regression: Auto-clamp activeTab if list shrinks
    useEffect(() => {
        if (activeTab >= navItems.length && navItems.length > 0) {
            setActiveTab(navItems.length - 1);
        } else if (navItems.length === 0) {
            setActiveTab(0);
        }
    }, [navItems.length, activeTab]);
    
    // Deep Linking Handler
    useEffect(() => {
        if (pendingNavigationTarget && !editingPair) {
            // Check if target exists in currently displayed combinations
            const target = displayedCombinations.find(c => `${c.base.unicode}-${c.mark.unicode}` === pendingNavigationTarget);
            
            if (target) {
                // Determine context list index
                const index = displayedCombinations.indexOf(target);
                setEditingPair(target);
                setEditingIndex(index);
                setEditingContextList(displayedCombinations);
                setPendingNavigationTarget(null);
            } else {
                // If not found in current view, check rule groups if in rule view
                if (viewMode === 'rules') {
                    for (const group of ruleGroups) {
                         const match = group.pairs.find(p => `${p.base.unicode}-${p.mark.unicode}` === pendingNavigationTarget);
                         if (match) {
                             setSelectedRuleGroupId(group.id);
                             // Need to wait for drill-down render? Or just set editing pair directly?
                             // Direct set is safer as drill-down just renders grid.
                             setEditingPair(match);
                             // Calculate index within that group
                             const groupIndex = group.pairs.indexOf(match);
                             const classKey = getPairClassKey(match);
                             const filteredContext = group.pairs.filter((p: any) => getPairClassKey(p) === classKey);
                             const filteredIndex = filteredContext.findIndex((p: any) => p.base.unicode === match.base.unicode && p.mark.unicode === match.mark.unicode);

                             setEditingIndex(filteredIndex);
                             setEditingContextList(filteredContext);
                             setPendingNavigationTarget(null);
                             break;
                         }
                    }
                }
            }
        }
    }, [pendingNavigationTarget, displayedCombinations, ruleGroups, viewMode, editingPair, setPendingNavigationTarget, getPairClassKey]);

    const handleSavePair = (base: Character, mark: Character, targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newMetadata: any, isAutosave?: boolean, isManual?: boolean) => {
        savePositioningUpdate(base, mark, targetLigature, newGlyphData, newOffset, newMetadata, isAutosave, isManual);
    };

    const handleNavigatePair = (direction: 'prev' | 'next') => {
        if (editingIndex === null) return;
        const newIndex = direction === 'prev' ? editingIndex - 1 : editingIndex + 1;
        if (newIndex >= 0 && newIndex < editingContextList.length) {
            setEditingPair(editingContextList[newIndex]);
            setEditingIndex(newIndex);
        }
    };
    
    // Explicit handler to change pair from within the editor (e.g. via strip)
    const handleSetEditingPair = (pair: { base: Character, mark: Character, ligature: Character }) => {
        setEditingPair(pair);
        // We attempt to find the index in the current context list.
        // If the context list (e.g. filtered class members) contains it, we update the index.
        const index = editingContextList.findIndex(p => p.base.unicode === pair.base.unicode && p.mark.unicode === pair.mark.unicode);
        if (index !== -1) {
            setEditingIndex(index);
        } else {
             // If navigating to a sibling that wasn't in the original filtered view (edge case),
             // we might lose next/prev button functionality until we close/reopen, 
             // but editing will work.
             setEditingIndex(null); 
        }
    };
    
    // Helper to check eligibility (duplicated from hook for UI consistency)
    const isPairEligibleForAutoPos = useCallback((base: Character, mark: Character) => {
        if (!characterSets) return false;
        const pairKey = `${base.name}-${mark.name}`;

        // Check Mark Classes
        if (markAttachmentClasses) {
            const mClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(mark.name));
            if (mClass) {
                let applies = true;
                if (mClass.applies && !expandMembers(mClass.applies, groups, characterSets).includes(base.name)) applies = false;
                if (mClass.exceptions && expandMembers(mClass.exceptions, groups, characterSets).includes(base.name)) applies = false;
                
                if (applies) {
                    if (mClass.exceptPairs?.includes(pairKey)) return true; // Exception = Independent = Eligible
                    
                    const members = expandMembers(mClass.members, groups, characterSets);
                    // Leader is first member
                    if (members[0] !== mark.name) return false; // Is Sibling = Not Eligible
                }
            }
        }

        // Check Base Classes
        if (baseAttachmentClasses) {
            const bClass = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(base.name));
            if (bClass) {
                let applies = true;
                if (bClass.applies && !expandMembers(bClass.applies, groups, characterSets).includes(mark.name)) applies = false;
                if (bClass.exceptions && expandMembers(bClass.exceptions, groups, characterSets).includes(base.name)) applies = false;
                
                if (applies) {
                    if (bClass.exceptPairs?.includes(pairKey)) return true; // Exception = Independent = Eligible
                    
                    const members = expandMembers(bClass.members, groups, characterSets);
                    // Leader is first member
                    if (members[0] !== base.name) return false; // Is Sibling = Not Eligible
                }
            }
        }
        return true;
    }, [markAttachmentClasses, baseAttachmentClasses, groups, characterSets]);

    const unpositionedCount = useMemo(() => {
        const listToCheck = viewMode === 'rules' ? [] : displayedCombinations;
        return listToCheck.filter(combo => {
            const isPositioned = markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`);
            if (isPositioned) return false;
            
            return isPairEligibleForAutoPos(combo.base, combo.mark);
        }).length;
    }, [displayedCombinations, markPositioningMap, viewMode, isPairEligibleForAutoPos]);

    const hasManuallyPositioned = useMemo(() => {
        if (viewMode === 'rules') return false;
        return displayedCombinations.some(combo => 
            markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`)
        );
    }, [displayedCombinations, markPositioningMap, viewMode]);

    const fullyPositionedItems = useMemo(() => {
        if (isFiltered || !characterSets || viewMode === 'rules') return []; 
        return navItems.filter(item => {
             // Logic simplified for performance. In a full implementation, check if all required marks for this base are positioned.
             return true;
        }).filter(item => item.unicode !== reuseSourceItem?.unicode);
    }, [navItems, isFiltered, viewMode, reuseSourceItem]);

    const handleOpenReuseModal = (sourceItem: Character) => {
        setReuseSourceItem(sourceItem);
        setIsReuseModalOpen(true);
    };

    const getBannerText = () => {
        if (isSearching) {
            return t('searchingFor', { query: searchQuery });
        }
        switch(filterMode) {
            case 'completed': return t('filterCompleted');
            case 'incomplete': return t('filterIncomplete');
            case 'all': return t('filterAllFlat');
            default: return '';
        }
    };
    
    // Check content validity for banner display
    const hasVisibleContent = viewMode === 'rules' 
        ? ruleGroups.length > 0 
        : displayedCombinations.length > 0;
    
    const showIncompleteBanner = hasIncompleteData && !isFiltered && hasVisibleContent;

    // FIX: Added a delete handler for the PositioningEditorPage.
    const handleDeletePair = useCallback(() => {
        if (!editingPair) return;

        const { base, mark, ligature } = editingPair;
        if (ligature.unicode === undefined) return;

        const key = `${base.unicode}-${mark.unicode}`;

        // 1. Remove from GPOS map
        const newPositioningMap = new Map(markPositioningMap);
        if (newPositioningMap.has(key)) {
            newPositioningMap.delete(key);
            positioningDispatch({ type: 'SET_MAP', payload: newPositioningMap });
        }
        
        const rule = positioningRules?.find(r => 
            expandMembers(r.base, groups, characterSets).includes(base.name) && 
            expandMembers(r.mark || [], groups, characterSets).includes(mark.name)
        );

        // 2. If it was a GSUB pair that was baked, clear its paths
        if (rule?.gsub) {
            glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode: ligature.unicode } });
        }
        
        showNotification(t('positioningPairDeleted', { name: ligature.name }), 'success');
        setEditingPair(null);
        setEditingIndex(null);

    }, [editingPair, markPositioningMap, positioningDispatch, positioningRules, groups, characterSets, glyphDataDispatch, showNotification, t]);

    // --- RENDER ---
    if (!settings || !metrics || !characterSets) return null;

    if (editingPair) {
        return (
            <PositioningEditorPage
                baseChar={editingPair.base}
                markChar={editingPair.mark}
                targetLigature={editingPair.ligature}
                glyphDataMap={glyphDataMap}
                markPositioningMap={markPositioningMap}
                onSave={handleSavePair}
                onConfirmPosition={handleConfirmPosition}
                onClose={() => { setEditingPair(null); setEditingIndex(null); }}
                onDelete={handleDeletePair}
                onReset={handleResetSinglePair}
                settings={settings}
                metrics={metrics}
                markAttachmentRules={markAttachmentRules}
                positioningRules={positioningRules}
                allChars={allChars}
                onNavigate={handleNavigatePair}
                hasPrev={editingIndex !== null && editingIndex > 0}
                hasNext={editingIndex !== null && editingIndex < editingContextList.length - 1}
                characterSets={characterSets}
                glyphVersion={glyphVersion}
                setEditingPair={handleSetEditingPair}
                allLigaturesByKey={positioningData.allLigaturesByKey}
                groups={groups}
                markAttachmentClasses={markAttachmentClasses}
                baseAttachmentClasses={baseAttachmentClasses}
            />
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            <PositioningHeader 
                viewMode={viewMode} setViewMode={setViewMode}
                isFiltered={isFiltered} getBannerText={getBannerText}
                navItems={navItems} activeTab={activeTab} setActiveTab={setActiveTab}
                isGridView={viewMode === 'base' || viewMode === 'mark'}
            />

            <div className="flex-grow overflow-hidden bg-gray-50 dark:bg-gray-900/50 flex flex-col">
                {showIncompleteBanner && (
                    <div className="flex-shrink-0 m-4 p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-blue-700 dark:text-blue-300">
                        {t('positioningShowOnlyComplete')}
                    </div>
                )}

                {viewMode === 'rules' && !isFiltered ? (
                     <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        <PositioningRulesView 
                            ruleGroups={ruleGroups} selectedRuleGroupId={selectedRuleGroupId} setSelectedRuleGroupId={setSelectedRuleGroupId}
                            activeRuleGroup={activeRuleGroup} pagedRulePairs={pagedRulePairs} rulePage={rulePage} setRulePage={setRulePage}
                            ruleTotalPages={ruleTotalPages} markPositioningMap={markPositioningMap} getPairClassKey={getPairClassKey}
                            classCounts={classCounts} setEditingPair={setEditingPair} setEditingIndex={setEditingIndex}
                            setEditingContextList={setEditingContextList} handleConfirmPosition={handleConfirmPosition}
                            glyphDataMap={glyphDataMap} strokeThickness={settings.strokeThickness} markAttachmentRules={markAttachmentRules}
                            positioningRules={positioningRules}
                            characterSets={characterSets} groups={groups} glyphVersion={glyphVersion} metrics={metrics} ITEMS_PER_PAGE={ITEMS_PER_PAGE}
                            handleAcceptAllDefaults={handleAcceptAllDefaults}
                            handleResetPage={(pairs) => handleResetPositions(pairs, undefined, () => {})}
                            uniqueRepPairs={uniqueRepPairs}
                            isPairEligible={isPairEligibleForAutoPos}
                        />
                    </div>
                ) : (
                     <div className="flex-1 overflow-hidden p-4 sm:p-6">
                        <PositioningGridView 
                            displayedCombinations={displayedCombinations} markPositioningMap={markPositioningMap}
                            glyphDataMap={glyphDataMap} strokeThickness={settings.strokeThickness} markAttachmentRules={markAttachmentRules}
                            positioningRules={positioningRules}
                            characterSets={characterSets} glyphVersion={glyphVersion} groups={groups}
                            setEditingPair={setEditingPair} setEditingIndex={setEditingIndex} setEditingContextList={setEditingContextList}
                            handleConfirmPosition={handleConfirmPosition} cardRefs={cardRefs} activeItem={activeItem} isFiltered={isFiltered}
                            viewMode={viewMode === 'rules' ? 'base' : viewMode} // Fallback to base if rules but filtered
                            handleOpenReuseModal={handleOpenReuseModal} handleAcceptAllDefaults={() => handleAcceptAllDefaults()}
                            unpositionedCount={unpositionedCount} setIsResetConfirmOpen={setIsResetConfirmOpen} hasManuallyPositioned={hasManuallyPositioned}
                            navItemsLength={navItems.length} t={t}
                            markAttachmentClasses={markAttachmentClasses}
                            baseAttachmentClasses={baseAttachmentClasses}
                        />
                    </div>
                )}
            </div>
            
            {isReuseModalOpen && reuseSourceItem && (
                <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4" onClick={() => setIsReuseModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                        <header className="p-4 border-b dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('copyFrom', { consonantName: reuseSourceItem.name })}</h3>
                        </header>
                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            {/* Simplified list for now as calculating 'fullyPositionedItems' is heavy. 
                                In real implementation, pass 'navItems' and calculate on the fly or inside component */}
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                                {navItems.map(item => (
                                    <div key={item.unicode} onClick={() => { handleCopyPositions(item, reuseSourceItem, navItems); setIsReuseModalOpen(false); }} className="p-2 flex flex-col items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors">
                                        <div className="w-16 h-16 text-4xl flex items-center justify-center font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                            {item.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <footer className="p-4 border-t dark:border-gray-700 flex justify-end">
                            <button onClick={() => setIsReuseModalOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">{t('cancel')}</button>
                        </footer>
                    </div>
                </div>
            )}
             {isResetConfirmOpen && (
                <Modal
                    isOpen={isResetConfirmOpen}
                    onClose={() => setIsResetConfirmOpen(false)}
                    title={t('confirmResetTitle')}
                    footer={<>
                        <button onClick={() => setIsResetConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button>
                        <button onClick={() => handleResetPositions(displayedCombinations, activeItem?.name, () => setIsResetConfirmOpen(false))} className="px-4 py-2 bg-red-600 text-white rounded">{t('reset')}</button>
                    </>}
                >
                    <p>{t('confirmResetMessage', { name: activeItem ? activeItem.name : t('selectedItems') })}</p>
                </Modal>
            )}
        </div>
    );
};

export default React.memo(PositioningPage);
