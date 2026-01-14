
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Character, CharacterSet } from '../types';
import CharacterGrid from './CharacterGrid';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import ProgressIndicator from './ProgressIndicator';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useProject } from '../contexts/ProjectContext';
import { useSettings } from '../contexts/SettingsContext';
import { useBatchOperations } from '../hooks/useBatchOperations';
import { filterAndSortCharacters } from '../utils/searchUtils';
import { sanitizeIdentifier } from '../utils/stringUtils';
import { useRules } from '../contexts/RulesContext';
import DrawingWorkspaceHeader from './drawing/DrawingWorkspaceHeader';
import DrawingBatchToolbar from './drawing/DrawingBatchToolbar';
import DrawingWorkspaceDialogs from './drawing/DrawingWorkspaceDialogs';

interface DrawingWorkspaceProps {
    characterSets: CharacterSet[];
    onSelectCharacter: (character: Character, rect: DOMRect) => void;
    onAddGlyph: (targetSet?: string) => void;
    onAddBlock: () => void;
    drawingProgress: { completed: number; total: number };
}

const DrawingWorkspace: React.FC<DrawingWorkspaceProps> = ({ characterSets, onSelectCharacter, onAddGlyph, onAddBlock, drawingProgress }) => {
    const { t } = useLocale();
    const { 
        activeTab, setActiveTab, showNotification, 
        metricsSelection, setMetricsSelection, isMetricsSelectionMode, setIsMetricsSelectionMode, 
        filterMode, setComparisonCharacters, setCurrentView,
        searchQuery
    } = useLayout();
    
    const { dispatch: characterDispatch, positioningGroupNames } = useProject();
    const { settings } = useSettings();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { state: rulesState } = useRules();
    const rulesGroups = rulesState.fontRules?.groups || {};

    const [contextMenu, setContextMenu] = useState({ x: 0, y: 0, index: -1, isOpen: false });
    const contextMenuRef = useRef<HTMLDivElement>(null);

    const [modalState, setModalState] = useState<{ type: 'create' | 'rename', index?: number, isOpen: boolean }>({ type: 'create', isOpen: false });
    const [modalInputValue, setModalInputValue] = useState('');
    const [showNamingHint, setShowNamingHint] = useState(false);

    const { handleBulkTransform, handleSaveMetrics, handleBulkDelete } = useBatchOperations();
    const [isTransformOpen, setIsTransformOpen] = useState(false);
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    const showHidden = settings?.showHiddenGlyphs ?? false;
    const isSearching = searchQuery.trim().length > 0;
    const isFiltered = filterMode !== 'none' || isSearching;

    const visibleCharacterSets = useMemo(() => {
        if (isFiltered) return [];
        return characterSets
            .map(set => ({
                ...set,
                characters: set.characters.filter(char => (!char.hidden || showHidden) && char.unicode !== 8205 && char.unicode !== 8204)
            }))
            .filter(set => set.nameKey !== 'dynamicLigatures');
    }, [characterSets, showHidden, isFiltered]);

    const filteredFlatList = useMemo(() => {
        if (!isFiltered) return [];
        let candidates = characterSets.flatMap(set => set.characters).filter(char => {
            if (char.unicode === 8205 || char.unicode === 8204) return false;
            const drawn = glyphDataMap.has(char.unicode!);
            const matchesStatus = filterMode === 'all' || filterMode === 'none' || (filterMode === 'completed' && drawn) || (filterMode === 'incomplete' && !drawn);
            if (!matchesStatus) return false;
            return (!char.hidden || showHidden);
        });
        return isSearching ? filterAndSortCharacters(candidates, searchQuery) : candidates.sort((a, b) => (a.unicode || 0) - (b.unicode || 0));
    }, [characterSets, glyphDataMap, filterMode, showHidden, isFiltered, searchQuery, isSearching]);

    const currentGridCharacters = isFiltered ? filteredFlatList : (visibleCharacterSets[activeTab]?.characters || []);

    const handleTabContextMenu = (e: React.MouseEvent | React.TouchEvent, index: number) => {
        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        setContextMenu({ x: Math.min(clientX, window.innerWidth - 160), y: Math.min(clientY, window.innerHeight - 100), index, isOpen: true });
    };

    const handleNameInput = (val: string) => {
        const sanitized = sanitizeIdentifier(val);
        setShowNamingHint(val.length > 0 && sanitized !== val.replace(/[\s-]+/g, '_'));
        setModalInputValue(sanitized);
    };

    const handleModalSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const name = modalInputValue.trim();
        if (!name) return;
        const lowerName = name.toLowerCase();
        
        if (modalState.type === 'create') {
             characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prev) => prev ? [...prev, { nameKey: name, characters: [] }] : [{ nameKey: name, characters: [] }] });
             setTimeout(() => setActiveTab(visibleCharacterSets.length), 50);
        } else if (modalState.type === 'rename' && modalState.index !== undefined) {
            const targetSet = visibleCharacterSets[modalState.index];
            const realIndex = characterSets.findIndex(s => s.nameKey === targetSet.nameKey);
            characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prev) => prev ? prev.map((set, i) => i === realIndex ? { ...set, nameKey: name } : set) : null });
        }
        setModalState(prev => ({ ...prev, isOpen: false }));
    };

    const handleBatchComplete = () => {
        setMetricsSelection(new Set());
        setIsMetricsSelectionMode(false);
        setIsPropertiesOpen(false);
        setIsTransformOpen(false);
        setIsDeleteOpen(false);
    };

    const getBannerText = () => {
        if (isSearching) return t('searchingFor', { query: searchQuery });
        switch(filterMode) {
            case 'completed': return t('filterCompleted');
            case 'incomplete': return t('filterIncomplete');
            case 'all': return t('filterAllFlat');
            default: return '';
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            <DrawingWorkspaceHeader 
                visibleCharacterSets={visibleCharacterSets}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                glyphDataMap={glyphDataMap}
                glyphVersion={glyphVersion}
                showHidden={showHidden}
                isFiltered={isFiltered}
                bannerText={getBannerText()}
                resultCount={filteredFlatList.length}
                onAddGroup={() => { setModalInputValue(''); setShowNamingHint(false); setModalState({ type: 'create', isOpen: true }); }}
                onTabContextMenu={handleTabContextMenu}
            />
            
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator completed={drawingProgress.completed} total={drawingProgress.total} progressTextKey="progressText" />
            </div>

            <div className="flex-grow overflow-hidden">
                {currentGridCharacters.length > 0 ? (
                    <CharacterGrid
                        key={isFiltered ? 'flat-list' : activeTab}
                        characters={currentGridCharacters}
                        onSelectCharacter={onSelectCharacter}
                        onAddGlyph={!isFiltered ? () => onAddGlyph(visibleCharacterSets[activeTab]?.nameKey) : () => {}}
                        onAddBlock={onAddBlock}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 italic">{isFiltered ? t('noMatchesFound') : t('noCharacters')}</div>
                )}
            </div>

            {isMetricsSelectionMode && (
                <DrawingBatchToolbar 
                    selectionSize={metricsSelection.size}
                    onSelectVisible={() => { const v = new Set<number>(); currentGridCharacters.forEach(c => c.unicode && v.add(c.unicode)); setMetricsSelection(v); }}
                    onSelectAll={() => { const a = new Set<number>(); characterSets.flatMap(s => s.characters).forEach(c => c.unicode && a.add(c.unicode)); setMetricsSelection(a); }}
                    onSelectNone={() => setMetricsSelection(new Set())}
                    onTransform={() => setIsTransformOpen(true)}
                    onProperties={() => setIsPropertiesOpen(true)}
                    onCompare={() => { setComparisonCharacters(visibleCharacterSets.flatMap(s => s.characters).filter(c => c.unicode && metricsSelection.has(c.unicode))); setIsMetricsSelectionMode(false); setCurrentView('comparison'); }}
                    onDelete={() => setIsDeleteOpen(true)}
                    onClose={() => { setIsMetricsSelectionMode(false); setMetricsSelection(new Set()); }}
                />
            )}

            <DrawingWorkspaceDialogs 
                modalState={modalState} setModalState={setModalState}
                modalInputValue={modalInputValue} setModalInputValue={handleNameInput}
                showNamingHint={showNamingHint} handleModalSubmit={handleModalSubmit}
                isTransformOpen={isTransformOpen} setIsTransformOpen={setIsTransformOpen}
                onBulkTransform={(sx, sy, r, fh, fv) => handleBulkTransform(metricsSelection, sx, sy, r, fh, fv, handleBatchComplete)}
                isPropertiesOpen={isPropertiesOpen} setIsPropertiesOpen={setIsPropertiesOpen}
                onBulkProperties={(l, r) => handleSaveMetrics(metricsSelection, l, r, handleBatchComplete)}
                isDeleteOpen={isDeleteOpen} setIsDeleteOpen={setIsDeleteOpen}
                onBulkDelete={() => handleBulkDelete(metricsSelection, handleBatchComplete)}
                selectionSize={metricsSelection.size}
            />

            {contextMenu.isOpen && (
                <div ref={contextMenuRef} className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-xl rounded-lg z-[100] py-2 w-48 text-sm animate-pop-in" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <button onClick={() => { const name = visibleCharacterSets[contextMenu.index].nameKey; setModalInputValue(t(name) === name ? name : t(name)); setModalState({ type: 'rename', index: contextMenu.index, isOpen: true }); setContextMenu({ ...contextMenu, isOpen: false }); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">Edit Name</button>
                    <button onClick={() => { if (visibleCharacterSets.length <= 1) { showNotification(t('cannotDeleteLastGroup'), 'error'); } else { const s = visibleCharacterSets[contextMenu.index]; if(window.confirm(t('confirmDeleteGroup', { name: t(s.nameKey) }))) characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (p) => p ? p.filter(x => x.nameKey !== s.nameKey) : null }); } setContextMenu({ ...contextMenu, isOpen: false }); }} className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-3">Delete Group</button>
                </div>
            )}
        </div>
    );
};

export default React.memo(DrawingWorkspace);
