
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Character, CharacterSet, GlyphData } from '../types';
import CharacterGrid from './CharacterGrid';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import ProgressIndicator from './ProgressIndicator';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useProject } from '../contexts/ProjectContext';
import { useSettings } from '../contexts/SettingsContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useBatchOperations } from '../hooks/useBatchOperations';
import { sanitizeIdentifier } from '../utils/stringUtils';
import { useRules } from '../contexts/RulesContext';
import DrawingWorkspaceHeader from './drawing/DrawingWorkspaceHeader';
import DrawingBatchToolbar from './drawing/DrawingBatchToolbar';
import DrawingWorkspaceDialogs from './drawing/DrawingWorkspaceDialogs';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { calculateDefaultMarkOffset, getAccurateGlyphBBox } from '../services/glyphRenderService';
import { expandMembers } from '../services/groupExpansionService';
import { deepClone } from '../utils/cloneUtils';
import { VirtuosoHandle } from 'react-virtuoso';
import ConfirmationModal from './ConfirmationModal';
import { useGlyphFilter } from '../hooks/useGlyphFilter';
import { useRefactoring } from '../hooks/useRefactoring';

interface DrawingWorkspaceProps {
    characterSets: CharacterSet[];
    onSelectCharacter: (character: Character, rect: DOMRect) => void;
    onAddGlyph: (targetSet?: string) => void;
    onAddBlock: () => void;
    drawingProgress: { completed: number; total: number };
    isCompactView?: boolean;
    isOverlayMode?: boolean;
}

const DrawingWorkspace: React.FC<DrawingWorkspaceProps> = ({ characterSets, onSelectCharacter, onAddGlyph, onAddBlock, drawingProgress, isCompactView, isOverlayMode = false }) => {
    const { t } = useLocale();
    const { 
        activeTab, setActiveTab, showNotification, 
        metricsSelection, setMetricsSelection, isMetricsSelectionMode, setIsMetricsSelectionMode, 
        filterMode, setComparisonCharacters, setCurrentView,
        searchQuery, selectedCharacter, triggerActiveEditorUpdate,
        setWorkspace
    } = useLayout();
    
    const { dispatch: characterDispatch, positioningGroupNames, allCharsByName, allCharsByUnicode, markAttachmentRules, positioningRules } = useProject();
    const { settings, metrics } = useSettings();
    const { glyphDataMap, version: glyphVersion, dispatch: glyphDataDispatch } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { state: rulesState } = useRules();
    const rulesGroups = rulesState.fontRules?.groups || {};
    
    const { renameGroup } = useRefactoring();

    const [modalState, setModalState] = useState<{ type: 'create' | 'rename', index?: number, isOpen: boolean }>({ type: 'create', isOpen: false });
    const [modalInputValue, setModalInputValue] = useState('');
    const [showNamingHint, setShowNamingHint] = useState(false);
    
    const [groupToDelete, setGroupToDelete] = useState<{ index: number, name: string } | null>(null);

    const { handleBulkTransform, handleSaveMetrics, handleBulkDelete } = useBatchOperations();
    const [isTransformOpen, setIsTransformOpen] = useState(false);
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    const showHidden = settings?.showHiddenGlyphs ?? false;
    const isSearching = searchQuery.trim().length > 0;
    
    const allCharacters = useMemo(() => characterSets.flatMap(set => set.characters), [characterSets]);
    const { filteredList: filteredFlatList, isFiltered } = useGlyphFilter({
        characters: allCharacters,
        glyphDataMap,
        markPositioningMap,
        kerningMap,
        allCharsByName,
        showHidden
    });

    const previewUnicode = useMemo(() => {
        if (metricsSelection.size === 0) return undefined;
        return metricsSelection.values().next().value;
    }, [metricsSelection]);

    const previewSample = useMemo(() => {
        return previewUnicode !== undefined ? glyphDataMap.get(previewUnicode) : undefined;
    }, [previewUnicode, glyphDataMap, glyphVersion]);

    const visibleCharacterSets = useMemo(() => {
        if (isFiltered) return [];
        return characterSets
            .map(set => ({
                ...set,
                characters: set.characters.filter(char => char.unicode !== 8205 && char.unicode !== 8204)
            }))
            .filter(set => set.nameKey !== 'dynamicLigatures');
    }, [characterSets, isFiltered]); 

    const autoGeneratedActionableCount = useMemo(() => {
        if (filterMode !== 'autoGenerated' && filterMode !== 'toBeReviewed') return 0;
        
        return filteredFlatList.filter(char => {
            if (char.position) {
                 const [base, mark] = char.position;
                 const baseC = allCharsByName.get(base);
                 const markC = allCharsByName.get(mark);
                 if (baseC?.unicode !== undefined && markC?.unicode !== undefined) {
                     const key = `${baseC.unicode}-${markC.unicode}`;
                     if (markPositioningMap.has(key)) return false;
                     const baseDrawn = isGlyphDrawn(glyphDataMap.get(baseC.unicode));
                     const markDrawn = isGlyphDrawn(glyphDataMap.get(markC.unicode));
                     return baseDrawn && markDrawn;
                 }
            }
            if (char.kern) {
                 const [left, right] = char.kern;
                 const leftC = allCharsByName.get(left);
                 const rightC = allCharsByName.get(right);
                 if (leftC?.unicode !== undefined && rightC?.unicode !== undefined) {
                     const key = `${leftC.unicode}-${rightC.unicode}`;
                     if (kerningMap.has(key)) return false;
                     const leftDrawn = isGlyphDrawn(glyphDataMap.get(leftC.unicode));
                     const rightDrawn = isGlyphDrawn(glyphDataMap.get(rightC.unicode));
                     return leftDrawn && rightDrawn;
                 }
            }
            return false;
        }).length;
    }, [filteredFlatList, filterMode, allCharsByName, markPositioningMap, kerningMap, glyphDataMap]);

    const isSelectionVirtual = useMemo(() => {
        if (metricsSelection.size === 0) return false;
        for (const unicode of metricsSelection) {
            const char = allCharsByUnicode.get(unicode);
            if (!char) return false;
            if (!char.position && !char.kern) return false;
        }
        return true;
    }, [metricsSelection, allCharsByUnicode]);

    const isSelectionTransformable = useMemo(() => {
        if (metricsSelection.size === 0) return false;
        for (const unicode of metricsSelection) {
            const char = allCharsByUnicode.get(unicode);
            if (!char) return false;
            if (char.position || char.kern) return false;
        }
        return true;
    }, [metricsSelection, allCharsByUnicode]);

    const handleAcceptAll = useCallback(() => {
        if ((filterMode !== 'autoGenerated' && filterMode !== 'toBeReviewed') || filteredFlatList.length === 0 || !metrics || !settings) return;
    
        const newMarkPositioningMap = new Map(markPositioningMap);
        const newKerningMap = new Map(kerningMap);
        const glyphUpdates: [number, GlyphData][] = [];
        let count = 0;
    
        filteredFlatList.forEach(char => {
            if (char.position) {
                const [baseName, markName] = char.position;
                const baseChar = allCharsByName.get(baseName);
                const markChar = allCharsByName.get(markName);
    
                if (baseChar && markChar && baseChar.unicode !== undefined && markChar.unicode !== undefined) {
                    const key = `${baseChar.unicode}-${markChar.unicode}`;
                    
                    if (!markPositioningMap.has(key)) {
                        const baseGlyph = glyphDataMap.get(baseChar.unicode);
                        const markGlyph = glyphDataMap.get(markChar.unicode);

                        if (isGlyphDrawn(baseGlyph) && isGlyphDrawn(markGlyph)) {
                            const baseBbox = getAccurateGlyphBBox(baseGlyph!.paths, settings.strokeThickness);
                            const markBbox = getAccurateGlyphBBox(markGlyph!.paths, settings.strokeThickness);

                            let constraint: 'horizontal' | 'vertical' | 'none' = 'none';
                            const rule = positioningRules?.find(r => 
                                expandMembers(r.base, rulesGroups, characterSets).includes(baseChar.name) && 
                                expandMembers(r.mark || [], rulesGroups, characterSets).includes(markChar.name)
                            );
                            if (rule?.movement) constraint = rule.movement;

                            const offset = calculateDefaultMarkOffset(
                                baseChar, markChar, baseBbox, markBbox, 
                                markAttachmentRules, 
                                metrics, characterSets, false, rulesGroups, constraint
                            );

                            newMarkPositioningMap.set(key, offset);

                            if (rule?.gsub && char.unicode !== undefined) {
                                const transformedMarkPaths = deepClone(markGlyph!.paths).map((p: any) => ({
                                    ...p,
                                    points: p.points.map((pt: any) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
                                    segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: any) => group.map((seg: any) => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
                                }));
                                
                                const combinedPaths = [...baseGlyph!.paths, ...transformedMarkPaths];
                                glyphUpdates.push([char.unicode, { paths: combinedPaths }]);
                            }
                            count++;
                        }
                    }
                }
            }
            
            if (char.kern) {
                 const [leftName, rightName] = char.kern;
                 const leftChar = allCharsByName.get(leftName);
                 const rightChar = allCharsByName.get(rightName);
                 
                 if (leftChar && rightChar && leftChar.unicode !== undefined && rightChar.unicode !== undefined) {
                     const key = `${leftChar.unicode}-${rightChar.unicode}`;
                     
                     if (!kerningMap.has(key)) {
                        const leftGlyph = glyphDataMap.get(leftChar.unicode);
                        const rightGlyph = glyphDataMap.get(rightChar.unicode);
                        
                        if (isGlyphDrawn(leftGlyph) && isGlyphDrawn(rightGlyph)) {
                            newKerningMap.set(key, 0);
                            count++;
                        }
                     }
                 }
            }
        });
    
        if (count > 0) {
            positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
            kerningDispatch({ type: 'SET_MAP', payload: newKerningMap });
            if (glyphUpdates.length > 0) {
                glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: glyphUpdates });
            }
            showNotification(t('acceptedAutoGenerated', { count }), 'success');
        } else {
            showNotification(t('noUnpositionedPairs'), 'info');
        }
    }, [filteredFlatList, filterMode, markPositioningMap, kerningMap, glyphDataMap, allCharsByName, settings, metrics, markAttachmentRules, positioningRules, rulesGroups, characterSets, positioningDispatch, kerningDispatch, glyphDataDispatch, showNotification, t]);

    const handleSelectionAccept = useCallback(() => {
         if (metricsSelection.size === 0 || !metrics || !settings) return;
    
        const newMarkPositioningMap = new Map(markPositioningMap);
        const newKerningMap = new Map(kerningMap);
        const glyphUpdates: [number, GlyphData][] = [];
        let count = 0;
    
        metricsSelection.forEach(unicode => {
            const char = allCharsByUnicode.get(unicode);
            if (!char) return;

            if (char.position) {
                const [baseName, markName] = char.position;
                const baseChar = allCharsByName.get(baseName);
                const markChar = allCharsByName.get(markName);
    
                if (baseChar && markChar && baseChar.unicode !== undefined && markChar.unicode !== undefined) {
                    const key = `${baseChar.unicode}-${markChar.unicode}`;
                    
                    const baseGlyph = glyphDataMap.get(baseChar.unicode);
                    const markGlyph = glyphDataMap.get(markChar.unicode);

                    if (isGlyphDrawn(baseGlyph) && isGlyphDrawn(markGlyph)) {
                        const baseBbox = getAccurateGlyphBBox(baseGlyph!.paths, settings.strokeThickness);
                        const markBbox = getAccurateGlyphBBox(markGlyph!.paths, settings.strokeThickness);

                        let constraint: 'horizontal' | 'vertical' | 'none' = 'none';
                        const rule = positioningRules?.find(r => 
                            expandMembers(r.base, rulesGroups, characterSets).includes(baseChar.name) && 
                            expandMembers(r.mark || [], rulesGroups, characterSets).includes(markChar.name)
                        );
                        if (rule?.movement) constraint = rule.movement;

                        const offset = calculateDefaultMarkOffset(
                            baseChar, markChar, baseBbox, markBbox, 
                            markAttachmentRules, 
                            metrics, characterSets, false, rulesGroups, constraint
                        );

                        newMarkPositioningMap.set(key, offset);

                        if (rule?.gsub && char.unicode !== undefined) {
                            const transformedMarkPaths = deepClone(markGlyph!.paths).map((p: any) => ({
                                ...p,
                                points: p.points.map((pt: any) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
                                segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: any) => group.map((seg: any) => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
                            }));
                            
                            const combinedPaths = [...baseGlyph!.paths, ...transformedMarkPaths];
                            glyphUpdates.push([char.unicode, { paths: combinedPaths }]);
                        }
                        count++;
                    }
                }
            }
            
            if (char.kern) {
                 const [leftName, rightName] = char.kern;
                 const leftChar = allCharsByName.get(leftName);
                 const rightChar = allCharsByName.get(rightName);
                 
                 if (leftChar && rightChar && leftChar.unicode !== undefined && rightChar.unicode !== undefined) {
                     const key = `${leftChar.unicode}-${rightChar.unicode}`;
                     
                    const leftGlyph = glyphDataMap.get(leftChar.unicode);
                    const rightGlyph = glyphDataMap.get(rightChar.unicode);
                    
                    if (isGlyphDrawn(leftGlyph) && isGlyphDrawn(rightGlyph)) {
                        newKerningMap.set(key, 0);
                        count++;
                    }
                 }
            }
        });
    
        if (count > 0) {
            positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
            kerningDispatch({ type: 'SET_MAP', payload: newKerningMap });
            if (glyphUpdates.length > 0) {
                glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: glyphUpdates });
            }
            showNotification(t('acceptedAutoGenerated', { count }), 'success');
        }
    }, [metricsSelection, markPositioningMap, kerningMap, glyphDataMap, allCharsByUnicode, allCharsByName, settings, metrics, markAttachmentRules, positioningRules, rulesGroups, characterSets, positioningDispatch, kerningDispatch, glyphDataDispatch, showNotification, t]);

    const handleNameInput = (val: string) => {
        const sanitized = sanitizeIdentifier(val);
        setShowNamingHint(val.length > 0 && sanitized !== val.replace(/[\s-]+/g, '_'));
        setModalInputValue(sanitized);
    };

    const handleModalSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const name = modalInputValue.trim();
        if (!name) return;
        
        if (modalState.type === 'create') {
             characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prev) => prev ? [...prev, { nameKey: name, characters: [] }] : [{ nameKey: name, characters: [] }] });
             setTimeout(() => setActiveTab(visibleCharacterSets.length), 50);
        } 
        setModalState(prev => ({ ...prev, isOpen: false }));
    };

    const handleRenameGroup = useCallback((index: number, newName: string) => {
        const targetSet = visibleCharacterSets[index];
        if (!targetSet) return;
        
        renameGroup(targetSet.nameKey, newName.trim(), 'set');

    }, [visibleCharacterSets, renameGroup]);

    const handleRequestDeleteGroup = useCallback((index: number) => {
        const targetSet = visibleCharacterSets[index];
        if (!targetSet) return;
        
        if (visibleCharacterSets.length <= 1) {
            showNotification(t('cannotDeleteLastGroup'), 'error');
            return;
        }
        
        setGroupToDelete({ index, name: t(targetSet.nameKey) });
    }, [visibleCharacterSets, showNotification, t]);

    const handleConfirmDeleteGroup = useCallback(() => {
        if (!groupToDelete) return;
        
        const targetSet = visibleCharacterSets[groupToDelete.index];
        if (targetSet) {
             characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (p) => p ? p.filter(x => x.nameKey !== targetSet.nameKey) : null });
             if (groupToDelete.index >= visibleCharacterSets.length - 1) {
                setActiveTab(Math.max(0, visibleCharacterSets.length - 2));
             }
        }
        setGroupToDelete(null);
    }, [groupToDelete, visibleCharacterSets, characterDispatch, setActiveTab]);
    
    const handleAddGroup = useCallback(() => {
        setModalInputValue('');
        setShowNamingHint(false);
        setModalState({ type: 'create', isOpen: true });
    }, []);

    const handleBatchComplete = () => {
        if (selectedCharacter && metricsSelection.has(selectedCharacter.unicode!)) {
            triggerActiveEditorUpdate();
        }

        setMetricsSelection(new Set());
        setIsMetricsSelectionMode(false);
        setIsPropertiesOpen(false);
        setIsTransformOpen(false);
        setIsDeleteOpen(false);
    };
    
    const handleScrollToSection = (index: number) => {
        if (virtuosoRef.current) {
            virtuosoRef.current.scrollToIndex({ index, align: 'start', behavior: 'smooth' });
        }
        setActiveTab(index);
    };

    const getBannerText = () => {
        if (isSearching) return t('searchingFor', { query: searchQuery });
        switch(filterMode) {
            case 'completed': return t('filterCompleted');
            case 'incomplete': return t('filterIncomplete');
            case 'all': return t('filterAllFlat');
            case 'autoGenerated': return t('filterAutoGenerated');
            case 'toBeReviewed': return t('filterToBeReviewed');
            case 'drawn': return t('filterDrawn');
            default: return '';
        }
    };
    
    const showEmptyState = isFiltered && filteredFlatList.length === 0;

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            {!isCompactView && !isOverlayMode && (
                <>
                    <DrawingWorkspaceHeader 
                        visibleCharacterSets={visibleCharacterSets}
                        activeTab={activeTab}
                        setActiveTab={handleScrollToSection}
                        glyphDataMap={glyphDataMap}
                        glyphVersion={glyphVersion}
                        showHidden={showHidden}
                        isFiltered={isFiltered}
                        bannerText={getBannerText()}
                        resultCount={filteredFlatList.length}
                        actionableCount={autoGeneratedActionableCount}
                        filterMode={filterMode}
                        onAcceptAll={handleAcceptAll}
                    />
                    
                    <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <ProgressIndicator completed={drawingProgress.completed} total={drawingProgress.total} progressTextKey="progressText" />
                    </div>
                </>
            )}

            <div className="flex-grow overflow-hidden">
                {showEmptyState ? (
                    <div className="flex items-center justify-center h-full text-gray-500 italic">{t('noMatchesFound')}</div>
                ) : (
                    <CharacterGrid
                        key={isFiltered ? 'flat-list' : 'grouped-list'}
                        characters={isFiltered ? filteredFlatList : undefined}
                        characterSets={!isFiltered ? visibleCharacterSets : undefined}
                        isFiltered={isFiltered}
                        onSelectCharacter={onSelectCharacter}
                        onAddGlyph={!isFiltered ? onAddGlyph : () => {}}
                        onAddBlock={onAddBlock}
                        virtuosoRef={virtuosoRef}
                        onSectionVisibilityChange={setActiveTab}
                        variant={isOverlayMode ? 'overlay' : (isCompactView ? 'compact' : 'default')}
                        onRenameGroup={!isFiltered ? handleRenameGroup : undefined}
                        onDeleteGroup={!isFiltered ? handleRequestDeleteGroup : undefined}
                        onAddGroup={!isFiltered ? handleAddGroup : undefined}
                    />
                )}
            </div>

            {isMetricsSelectionMode && !isOverlayMode && (
                <DrawingBatchToolbar 
                    selectionSize={metricsSelection.size}
                    onSelectAll={() => { 
                        const newSelection = new Set<number>();
                        
                        if (isFiltered) {
                            filteredFlatList.forEach(c => {
                                if (c.unicode !== undefined) newSelection.add(c.unicode);
                            });
                        } else {
                            visibleCharacterSets.forEach(set => {
                                set.characters.forEach(c => {
                                    const isVisible = !c.hidden || showHidden;
                                    if (isVisible && c.unicode !== undefined) {
                                        newSelection.add(c.unicode);
                                    }
                                });
                            });
                        }
                        
                        setMetricsSelection(newSelection); 
                    }}
                    onSelectNone={() => setMetricsSelection(new Set())}
                    onTransform={() => setIsTransformOpen(true)}
                    onProperties={() => setIsPropertiesOpen(true)}
                    onDelete={() => setIsDeleteOpen(true)}
                    onClose={() => { setIsMetricsSelectionMode(false); setMetricsSelection(new Set()); }}
                    showAccept={isSelectionVirtual}
                    onAccept={handleSelectionAccept}
                    showTransform={isSelectionTransformable}
                />
            )}

            {!isOverlayMode && (
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
                    previewSample={previewSample}
                    strokeThickness={settings?.strokeThickness}
                />
            )}

            <ConfirmationModal 
                isOpen={!!groupToDelete} 
                onClose={() => setGroupToDelete(null)} 
                onConfirm={handleConfirmDeleteGroup} 
                title={t('deleteGroup')} 
                message={t('confirmDeleteGroup', { name: groupToDelete?.name })}
                confirmActionText={t('delete')}
            />
        </div>
    );
};

export default React.memo(DrawingWorkspace);
