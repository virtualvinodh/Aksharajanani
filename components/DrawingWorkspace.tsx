
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Character, CharacterSet, GlyphData } from '../types';
import CharacterGrid from './CharacterGrid';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { LeftArrowIcon, RightArrowIcon, CheckCircleIcon, AddIcon, EditIcon, TrashIcon, SelectIcon, SettingsIcon, BatchIcon } from '../constants';
import ProgressIndicator from './ProgressIndicator';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { useProject } from '../contexts/ProjectContext';
import { useSettings } from '../contexts/SettingsContext';
import Modal from './Modal';
import { useBatchOperations } from '../hooks/useBatchOperations';

// Reusing modals from BulkEditWorkspace logic but integrated here
const BulkPropertiesModal: React.FC<{ isOpen: boolean, onClose: () => void, onSave: (l: string, r: string, w: string) => void, count: number }> = ({ isOpen, onClose, onSave, count }) => {
    const { t } = useLocale();
    const [lsb, setLsb] = useState('');
    const [rsb, setRsb] = useState('');
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${t('editProperties')} (${count})`} footer={<><button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button onClick={() => onSave(lsb, rsb, '')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">{t('save')}</button></>}>
            <div className="space-y-4"><p className="text-sm text-gray-500">Leave fields blank to keep existing values.</p><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1">{t('leftSpace')} (LSB)</label><input type="number" value={lsb} onChange={e => setLsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" /></div><div><label className="block text-sm font-medium mb-1">{t('rightSpace')} (RSB)</label><input type="number" value={rsb} onChange={e => setRsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" /></div></div></div>
        </Modal>
    );
};

const BulkTransformModal: React.FC<{ isOpen: boolean, onClose: () => void, onConfirm: (sx: number, sy: number, r: number, fh: boolean, fv: boolean) => void, count: number, selectedGlyphs: any[], glyphDataMap: any, strokeThickness: number }> = ({ isOpen, onClose, onConfirm, count, selectedGlyphs, glyphDataMap, strokeThickness }) => {
    const { t } = useLocale();
    const [scaleX, setScaleX] = useState('1.0');
    const [scaleY, setScaleY] = useState('1.0');
    const [rotation, setRotation] = useState('0');
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [lockAspect, setLockAspect] = useState(true);

    const handleScaleXChange = (val: string) => { setScaleX(val); if (lockAspect) setScaleY(val); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('transformGlyphsTitle', { count })} footer={<><button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button onClick={() => onConfirm(parseFloat(scaleX)||1, parseFloat(scaleY)||1, parseFloat(rotation)||0, flipH, flipV)} className="px-4 py-2 bg-green-600 text-white rounded-lg">{t('applyTransform')}</button></>}>
             <div className="space-y-6"><p className="text-xs text-gray-500 italic text-center">{t('transformOriginCenter')}</p><div className="grid grid-cols-2 gap-4"><div className="col-span-2 sm:col-span-1"><label className="block text-sm font-medium mb-1">{t('scaleX')}</label><input type="number" step="0.1" value={scaleX} onChange={e => handleScaleXChange(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" /></div><div className="col-span-2 sm:col-span-1"><label className="block text-sm font-medium mb-1">{t('scaleY')}</label><input type="number" step="0.1" value={scaleY} onChange={e => setScaleY(e.target.value)} disabled={lockAspect} className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50" /></div><div className="col-span-2 flex items-center"><input type="checkbox" id="lockAspect" checked={lockAspect} onChange={e => setLockAspect(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" /><label htmlFor="lockAspect" className="ml-2 text-sm">Lock Aspect Ratio</label></div></div><div><label className="block text-sm font-medium mb-1">{t('rotate')}</label><div className="flex items-center gap-2"><input type="range" min="-180" max="180" value={rotation} onChange={e => setRotation(e.target.value)} className="flex-grow" /><input type="number" value={rotation} onChange={e => setRotation(e.target.value)} className="w-16 p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-center" /></div></div><div className="flex gap-6 justify-center"><label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded border dark:border-gray-600"><input type="checkbox" checked={flipH} onChange={e => setFlipH(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" /><span>{t('flipHorizontal')}</span></label><label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded border dark:border-gray-600"><input type="checkbox" checked={flipV} onChange={e => setFlipV(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" /><span>{t('flipVertical')}</span></label></div></div>
        </Modal>
    );
};

interface DrawingWorkspaceProps {
    characterSets: CharacterSet[];
    onSelectCharacter: (character: Character, rect: DOMRect) => void;
    onAddGlyph: (targetSet?: string) => void;
    onAddBlock: () => void;
    drawingProgress: { completed: number; total: number };
}

interface ContextMenuState {
    x: number;
    y: number;
    index: number;
    isOpen: boolean;
}

const CharacterSetTab: React.FC<{
    set: CharacterSet;
    index: number;
    activeTab: number;
    setActiveTab: (index: number) => void;
    glyphDataMap: Map<number, GlyphData>;
    onContextMenu: (e: React.MouseEvent | React.TouchEvent, index: number) => void;
    showHidden: boolean;
    glyphVersion: number;
}> = ({ set, index, activeTab, setActiveTab, glyphDataMap, onContextMenu, showHidden, glyphVersion }) => {
    const { t } = useLocale();
    const [isAnimating, setIsAnimating] = useState(false);
    const wasComplete = useRef(false);
    const longPressTimer = useRef<number | null>(null);

    const isSetComplete = useMemo(() => {
        const visibleChars = set.characters.filter(char => !char.hidden || showHidden);
        if (!visibleChars || visibleChars.length === 0) return false;
        return visibleChars.every(char => isGlyphDrawn(glyphDataMap.get(char.unicode)));
    }, [set.characters, glyphDataMap, showHidden, glyphVersion]);

    useEffect(() => {
        if (isSetComplete && !wasComplete.current) {
            setIsAnimating(true);
            const timer = setTimeout(() => setIsAnimating(false), 600); // Match animation duration
            return () => clearTimeout(timer);
        }
        wasComplete.current = isSetComplete;
    }, [isSetComplete]);

    const handleTouchStart = (e: React.TouchEvent) => {
        longPressTimer.current = window.setTimeout(() => {
            onContextMenu(e, index);
        }, 500); // Long press duration
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const animationClass = isAnimating ? 'animate-pop-in' : '';

    return (
        <button
            key={set.nameKey}
            onClick={() => setActiveTab(index)}
            onContextMenu={(e) => onContextMenu(e, index)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onTouchMove={handleTouchEnd}
            className={`flex-shrink-0 flex items-center gap-1.5 py-3 px-3 sm:px-4 text-sm font-medium border-b-2 transition-colors select-none ${
                activeTab === index
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
        >
            <span>{t(set.nameKey)}</span>
            {isSetComplete && <CheckCircleIcon className={`h-4 w-4 text-green-500 ${animationClass}`} />}
        </button>
    );
};

const DrawingWorkspace: React.FC<DrawingWorkspaceProps> = ({ characterSets, onSelectCharacter, onAddGlyph, onAddBlock, drawingProgress }) => {
    const { t } = useLocale();
    const { activeTab, setActiveTab, showNotification, metricsSelection, setMetricsSelection, isMetricsSelectionMode, setIsMetricsSelectionMode } = useLayout();
    const { dispatch: characterDispatch } = useProject();
    const { settings, metrics } = useSettings();
    const navContainerRef = useRef<HTMLDivElement>(null);
    const [showNavArrows, setShowNavArrows] = useState({ left: false, right: false });
    
    const { glyphDataMap, version: glyphVersion } = useGlyphData();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, index: -1, isOpen: false });
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Group Management Modal State
    const [modalState, setModalState] = useState<{ type: 'create' | 'rename', index?: number, isOpen: boolean }>({ type: 'create', isOpen: false });
    const [modalInputValue, setModalInputValue] = useState('');

    // Batch Operation States
    const { handleBulkTransform, handleSaveMetrics, handleBulkDelete } = useBatchOperations();
    const [isTransformModalOpen, setIsTransformModalOpen] = useState(false);
    const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const showHidden = settings?.showHiddenGlyphs ?? false;

    const visibleCharacterSets = useMemo(() => {
        return characterSets
            .map(set => ({
                ...set,
                characters: set.characters.filter(char => (!char.hidden || showHidden) && char.unicode !== 8205 && char.unicode !== 8204)
            }))
            .filter(set => set.nameKey !== 'dynamicLigatures');
    }, [characterSets, showHidden]);

    const drawnCharacters = useMemo(() => {
        if (!characterSets) return [];
        return characterSets
            .flatMap(set => set.characters)
            .filter(char => char.unicode !== undefined && !char.hidden && isGlyphDrawn(glyphDataMap.get(char.unicode)))
            .sort((a, b) => a.unicode! - b.unicode!);
    }, [characterSets, glyphDataMap, glyphVersion]);

    const selectedGlyphData = useMemo(() => {
        return drawnCharacters.filter(c => metricsSelection.has(c.unicode!));
    }, [drawnCharacters, metricsSelection]);

    // Ensure active tab logic...
    useEffect(() => {
        if (activeTab >= visibleCharacterSets.length && visibleCharacterSets.length > 0) {
            setActiveTab(visibleCharacterSets.length - 1);
        } else if (visibleCharacterSets.length === 0) {
            setActiveTab(0);
        }
    }, [activeTab, setActiveTab, visibleCharacterSets.length]);

    // Scroll Logic...
    const checkNavOverflow = useCallback(() => {
        const c = navContainerRef.current;
        if (!c) return;
        const tol = 2;
        const isOverflowing = c.scrollWidth > c.clientWidth + tol;
        setShowNavArrows({
            left: isOverflowing && c.scrollLeft > tol,
            right: isOverflowing && c.scrollLeft < c.scrollWidth - c.clientWidth - tol,
        });
    }, []);

    useEffect(() => {
        const c = navContainerRef.current;
        if (!c) return;
        checkNavOverflow();
        const resizeObserver = new ResizeObserver(checkNavOverflow);
        resizeObserver.observe(c);
        c.addEventListener('scroll', checkNavOverflow);
        return () => { if(c) { resizeObserver.disconnect(); c.removeEventListener('scroll', checkNavOverflow); } };
    }, [checkNavOverflow, visibleCharacterSets]);

    const handleNavScroll = (dir: 'left' | 'right') => {
        const c = navContainerRef.current;
        if (c) c.scrollBy({ left: dir === 'left' ? -c.clientWidth * 0.75 : c.clientWidth * 0.75, behavior: 'smooth' });
    };

    // Context Menu Logic...
    const handleContextMenu = (e: React.MouseEvent | React.TouchEvent, index: number) => {
        e.preventDefault();
        let clientX, clientY;
        if ('touches' in e) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } 
        else { clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY; }
        const menuWidth = 160; const menuHeight = 100;
        const x = Math.min(clientX, window.innerWidth - menuWidth);
        const y = Math.min(clientY, window.innerHeight - menuHeight);
        setContextMenu({ x, y, index, isOpen: true });
    };

    const closeContextMenu = () => setContextMenu(prev => ({ ...prev, isOpen: false }));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenu.isOpen && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                closeContextMenu();
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [contextMenu.isOpen]);

    // Group Management Handlers...
    const openCreateModal = () => { setModalInputValue(''); setModalState({ type: 'create', isOpen: true }); };
    const openRenameModal = () => {
        const currentName = visibleCharacterSets[contextMenu.index].nameKey;
        setModalInputValue(t(currentName) === currentName ? currentName : t(currentName));
        setModalState({ type: 'rename', index: contextMenu.index, isOpen: true });
        closeContextMenu();
    };
    const handleDeleteGroupHandler = () => {
        if (visibleCharacterSets.length <= 1) { showNotification(t('cannotDeleteLastGroup'), 'error'); closeContextMenu(); return; }
        const targetSet = visibleCharacterSets[contextMenu.index];
        const realIndex = characterSets.findIndex(s => s.nameKey === targetSet.nameKey);
        if (window.confirm(t('confirmDeleteGroup', { name: t(targetSet.nameKey) }))) {
             characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prev) => prev ? prev.filter((_, i) => i !== realIndex) : null });
        }
        closeContextMenu();
    };
    const handleModalSubmit = (e: React.FormEvent) => {
        e.preventDefault(); const name = modalInputValue.trim(); if (!name) return;
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

    // Batch Operations Helpers
    const handleBatchComplete = () => {
        setMetricsSelection(new Set());
        setIsMetricsSelectionMode(false);
        setIsPropertiesModalOpen(false);
        setIsTransformModalOpen(false);
        setIsDeleteConfirmOpen(false);
    };

    const toggleSelectionMode = () => {
        if (isMetricsSelectionMode) {
             setIsMetricsSelectionMode(false);
             setMetricsSelection(new Set());
        } else {
             setIsMetricsSelectionMode(true);
        }
    };
    
    const handleSelectAll = () => {
        const allUnicodes = new Set<number>();
        visibleCharacterSets.forEach(set => {
            set.characters.forEach(c => {
                if (c.unicode !== undefined) allUnicodes.add(c.unicode);
            });
        });
        setMetricsSelection(allUnicodes);
    };

    const handleSelectVisible = () => {
        const currentSet = visibleCharacterSets[activeTab];
        if (!currentSet) return;
        setMetricsSelection(prev => {
            const next = new Set(prev);
            currentSet.characters.forEach(c => {
                if (c.unicode !== undefined) next.add(c.unicode);
            });
            return next;
        });
    };

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center pr-2">
                
                {/* Scrollable Tabs Container */}
                <div className="flex-grow relative overflow-hidden flex items-center">
                    {showNavArrows.left && <button onClick={() => handleNavScroll('left')} className="absolute left-0 z-10 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-r dark:border-gray-700"><LeftArrowIcon className="h-5 w-5" /></button>}
                    
                    <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar px-2 sm:px-4 w-full items-center">
                        {visibleCharacterSets.map((set, index) => (
                            <CharacterSetTab key={set.nameKey} set={set} index={index} activeTab={activeTab} setActiveTab={setActiveTab} glyphDataMap={glyphDataMap} onContextMenu={handleContextMenu} showHidden={showHidden} glyphVersion={glyphVersion} />
                        ))}
                        <button onClick={openCreateModal} title={t('newGroup')} className="flex-shrink-0 flex items-center justify-center p-1.5 ml-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors"><AddIcon className="h-5 w-5" /></button>
                    </div>

                    {showNavArrows.right && <button onClick={() => handleNavScroll('right')} className="absolute right-0 z-10 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-l dark:border-gray-700"><RightArrowIcon className="h-5 w-5" /></button>}
                </div>
                
                {/* Removed Select Toggle from here (moved to AppHeader) */}
            </div>
            
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator completed={drawingProgress.completed} total={drawingProgress.total} progressTextKey="progressText" />
            </div>

            <div className="flex-grow overflow-hidden">
                <CharacterGrid
                    key={activeTab}
                    characters={visibleCharacterSets[activeTab]?.characters || []}
                    onSelectCharacter={onSelectCharacter}
                    onAddGlyph={() => onAddGlyph(visibleCharacterSets[activeTab]?.nameKey)}
                    onAddBlock={onAddBlock}
                />
            </div>
            
            {/* Contextual Action Bar for Selection */}
            {isMetricsSelectionMode && (
                <div className="fixed inset-x-0 bottom-0 md:top-0 md:bottom-auto p-4 bg-white dark:bg-gray-800 border-t md:border-b md:border-t-0 dark:border-gray-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-lg z-[60] animate-fade-in-up transition-all duration-300">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                        
                        {/* Left Side: Count & Selection Controls */}
                        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                             <div className="flex items-center gap-4">
                                 <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">
                                     <span className="font-bold text-sm">{metricsSelection.size}</span>
                                 </div>
                                 <span className="font-bold text-gray-900 dark:text-white hidden sm:inline">{t('metricsSelection', { count: metricsSelection.size })}</span>
                             </div>
                             
                             <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 hidden md:block"></div>
                             
                             <div className="flex gap-2">
                                <button onClick={handleSelectAll} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition-colors">{t('selectAll')}</button>
                                <button onClick={handleSelectVisible} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition-colors">{t('selectVisible')}</button>
                                <button onClick={() => setMetricsSelection(new Set())} disabled={metricsSelection.size === 0} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition-colors disabled:opacity-50">{t('selectNone')}</button>
                             </div>
                        </div>
                        
                        {/* Right Side: Actions */}
                        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar justify-start md:justify-end">
                             <button onClick={() => setIsTransformModalOpen(true)} disabled={metricsSelection.size === 0} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                <span className="hidden sm:inline">{t('transform')}</span>
                            </button>
                            <button onClick={() => setIsPropertiesModalOpen(true)} disabled={metricsSelection.size === 0} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm">
                                <SettingsIcon /> <span className="hidden sm:inline">{t('editProperties')}</span>
                            </button>
                            <button onClick={() => setIsDeleteConfirmOpen(true)} disabled={metricsSelection.size === 0} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm">
                                <TrashIcon /> <span className="hidden sm:inline">{t('delete')}</span>
                            </button>
                            
                             <div className="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2 hidden md:block"></div>
                             
                            <button onClick={toggleSelectionMode} className="px-6 py-2 bg-gray-800 dark:bg-white text-white dark:text-gray-900 font-bold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-200 shadow-sm whitespace-nowrap">
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu.isOpen && (
                <div ref={contextMenuRef} className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg rounded-md z-50 py-1 w-40 text-sm" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <button onClick={openRenameModal} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"><EditIcon /> {t('renameGroup')}</button>
                    <button onClick={handleDeleteGroupHandler} className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-2"><TrashIcon /> {t('deleteGroup')}</button>
                </div>
            )}

            {/* Modals */}
            <Modal isOpen={modalState.isOpen} onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))} title={modalState.type === 'create' ? t('newGroup') : t('renameGroup')} size="sm" footer={<><button onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">{t('cancel')}</button><button onClick={handleModalSubmit} disabled={!modalInputValue.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-indigo-400">{t('save')}</button></>}>
                <form onSubmit={handleModalSubmit}><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('groupName')}</label><input type="text" value={modalInputValue} onChange={e => setModalInputValue(e.target.value)} autoFocus className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"/></form>
            </Modal>
            
            <BulkPropertiesModal isOpen={isPropertiesModalOpen} onClose={() => setIsPropertiesModalOpen(false)} onSave={(l, r, w) => handleSaveMetrics(metricsSelection, l, r, handleBatchComplete)} count={metricsSelection.size} />
            <BulkTransformModal isOpen={isTransformModalOpen} onClose={() => setIsTransformModalOpen(false)} onConfirm={(sx, sy, r, fh, fv) => handleBulkTransform(metricsSelection, sx, sy, r, fh, fv, handleBatchComplete)} count={metricsSelection.size} selectedGlyphs={selectedGlyphData} glyphDataMap={glyphDataMap} strokeThickness={settings?.strokeThickness || 15} />
            <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title={t('confirmDeleteSelectedTitle')} titleClassName="text-red-600" footer={<><button onClick={() => setIsDeleteConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button onClick={() => handleBulkDelete(metricsSelection, handleBatchComplete)} className="px-4 py-2 bg-red-600 text-white rounded-lg">{t('delete')}</button></>}><p>{t('confirmDeleteSelectedMessage', { count: metricsSelection.size })}</p></Modal>
        </div>
    );
};

export default React.memo(DrawingWorkspace);
