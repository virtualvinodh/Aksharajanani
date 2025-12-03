
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Character, CharacterSet, GlyphData } from '../types';
import CharacterGrid from './CharacterGrid';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { LeftArrowIcon, RightArrowIcon, CheckCircleIcon, AddIcon, EditIcon, TrashIcon } from '../constants';
import ProgressIndicator from './ProgressIndicator';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { useProject } from '../contexts/ProjectContext';
import Modal from './Modal';

interface DrawingWorkspaceProps {
    characterSets: CharacterSet[];
    onSelectCharacter: (character: Character, rect: DOMRect) => void;
    onAddGlyph: () => void;
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
}> = ({ set, index, activeTab, setActiveTab, glyphDataMap, onContextMenu }) => {
    const { t } = useLocale();
    const [isAnimating, setIsAnimating] = useState(false);
    const wasComplete = useRef(false);
    const longPressTimer = useRef<number | null>(null);

    const isSetComplete = useMemo(() => {
        const visibleChars = set.characters.filter(char => !char.hidden);
        if (!visibleChars || visibleChars.length === 0) return false;
        return visibleChars.every(char => isGlyphDrawn(glyphDataMap.get(char.unicode)));
    }, [set.characters, glyphDataMap]);

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
            onTouchMove={handleTouchEnd} // Cancel on scroll
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
    const { activeTab, setActiveTab, showNotification } = useLayout();
    const { dispatch: characterDispatch } = useProject();
    const navContainerRef = useRef<HTMLDivElement>(null);
    const [showNavArrows, setShowNavArrows] = useState({ left: false, right: false });
    
    const { glyphDataMap } = useGlyphData();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, index: -1, isOpen: false });
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Group Management Modal State
    const [modalState, setModalState] = useState<{ type: 'create' | 'rename', index?: number, isOpen: boolean }>({ type: 'create', isOpen: false });
    const [modalInputValue, setModalInputValue] = useState('');

    const visibleCharacterSets = useMemo(() => {
        return characterSets
            .map(set => ({
                ...set,
                characters: set.characters.filter(char => !char.hidden && char.unicode !== 8205 && char.unicode !== 8204)
            }))
            // Show all groups, even empty ones, so user can add to them
            .filter(set => set.nameKey !== 'dynamicLigatures');
    }, [characterSets]);

    useEffect(() => {
        // Ensure active tab is valid after deletions
        if (activeTab >= visibleCharacterSets.length && visibleCharacterSets.length > 0) {
            setActiveTab(visibleCharacterSets.length - 1);
        } else if (visibleCharacterSets.length === 0) {
            setActiveTab(0); // Reset if empty, though app should usually prevent 0 tabs
        }
    }, [activeTab, setActiveTab, visibleCharacterSets.length]);

    // --- Scroll Logic ---
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
        return () => {
            if (c) {
                resizeObserver.disconnect();
                c.removeEventListener('scroll', checkNavOverflow);
            }
        };
    }, [checkNavOverflow, visibleCharacterSets]);

    const handleNavScroll = (dir: 'left' | 'right') => {
        const c = navContainerRef.current;
        if (c) {
            c.scrollBy({ left: dir === 'left' ? -c.clientWidth * 0.75 : c.clientWidth * 0.75, behavior: 'smooth' });
        }
    };

    // --- Context Menu Logic ---
    const handleContextMenu = (e: React.MouseEvent | React.TouchEvent, index: number) => {
        e.preventDefault();
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }
        
        // Adjust position to stay on screen
        const menuWidth = 160; 
        const menuHeight = 100;
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

    // --- Group Management Handlers ---

    const openCreateModal = () => {
        setModalInputValue('');
        setModalState({ type: 'create', isOpen: true });
    };

    const openRenameModal = () => {
        const currentName = visibleCharacterSets[contextMenu.index].nameKey;
        setModalInputValue(t(currentName) === currentName ? currentName : t(currentName)); // Use raw key if translated, or fallback
        setModalState({ type: 'rename', index: contextMenu.index, isOpen: true });
        closeContextMenu();
    };

    const handleDeleteGroup = () => {
        if (visibleCharacterSets.length <= 1) {
            showNotification(t('cannotDeleteLastGroup'), 'error');
            closeContextMenu();
            return;
        }
        
        const targetSet = visibleCharacterSets[contextMenu.index];
        // Map visual index back to real index in characterSets
        // We assume characterSets order matches visibleCharacterSets order for the filtered items.
        // A robust way is to find by nameKey.
        const realIndex = characterSets.findIndex(s => s.nameKey === targetSet.nameKey);

        if (window.confirm(t('confirmDeleteGroup', { name: t(targetSet.nameKey) }))) {
             characterDispatch({ 
                 type: 'UPDATE_CHARACTER_SETS', 
                 payload: (prev) => {
                     if (!prev) return null;
                     return prev.filter((_, i) => i !== realIndex);
                 }
             });
        }
        closeContextMenu();
    };

    const handleModalSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const name = modalInputValue.trim();
        if (!name) return;

        if (modalState.type === 'create') {
             characterDispatch({ 
                 type: 'UPDATE_CHARACTER_SETS', 
                 payload: (prev) => {
                     const newSet = { nameKey: name, characters: [] };
                     return prev ? [...prev, newSet] : [newSet];
                 }
             });
             // Switch to new tab
             setTimeout(() => setActiveTab(visibleCharacterSets.length), 50);
        } else if (modalState.type === 'rename' && modalState.index !== undefined) {
            const targetSet = visibleCharacterSets[modalState.index];
            const realIndex = characterSets.findIndex(s => s.nameKey === targetSet.nameKey);
            
             characterDispatch({ 
                 type: 'UPDATE_CHARACTER_SETS', 
                 payload: (prev) => {
                     if (!prev) return null;
                     return prev.map((set, i) => i === realIndex ? { ...set, nameKey: name } : set);
                 }
             });
        }
        setModalState(prev => ({ ...prev, isOpen: false }));
    };


    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center">
                
                {/* Scrollable Tabs Container */}
                <div className="flex-grow relative overflow-hidden flex items-center">
                    {showNavArrows.left && (
                        <button
                            onClick={() => handleNavScroll('left')}
                            className="absolute left-0 z-10 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-r dark:border-gray-700"
                        >
                            <LeftArrowIcon className="h-5 w-5" />
                        </button>
                    )}
                    
                    <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar px-2 sm:px-4 w-full items-center">
                        {visibleCharacterSets.map((set, index) => (
                            <CharacterSetTab
                                key={set.nameKey}
                                set={set}
                                index={index}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                glyphDataMap={glyphDataMap}
                                onContextMenu={handleContextMenu}
                            />
                        ))}

                        <button
                            onClick={openCreateModal}
                            title={t('newGroup')}
                            className="flex-shrink-0 flex items-center justify-center p-1.5 ml-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors"
                        >
                            <AddIcon className="h-5 w-5" />
                        </button>
                    </div>

                    {showNavArrows.right && (
                        <button
                            onClick={() => handleNavScroll('right')}
                            className="absolute right-0 z-10 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-l dark:border-gray-700"
                        >
                            <RightArrowIcon className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>
            
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator 
                    completed={drawingProgress.completed}
                    total={drawingProgress.total}
                    progressTextKey="progressText"
                />
            </div>
            <div className="flex-grow overflow-y-auto">
                <CharacterGrid
                    characters={visibleCharacterSets[activeTab]?.characters || []}
                    onSelectCharacter={onSelectCharacter}
                    onAddGlyph={onAddGlyph}
                    onAddBlock={onAddBlock}
                />
            </div>

            {/* Context Menu */}
            {contextMenu.isOpen && (
                <div 
                    ref={contextMenuRef}
                    className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg rounded-md z-50 py-1 w-40 text-sm"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button 
                        onClick={openRenameModal}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
                    >
                        <EditIcon /> {t('renameGroup')}
                    </button>
                    <button 
                        onClick={handleDeleteGroup}
                        className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-2"
                    >
                        <TrashIcon /> {t('deleteGroup')}
                    </button>
                </div>
            )}

            {/* Add/Rename Modal */}
            <Modal
                isOpen={modalState.isOpen}
                onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                title={modalState.type === 'create' ? t('newGroup') : t('renameGroup')}
                size="sm"
                footer={
                    <>
                        <button 
                            onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))} 
                            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                            {t('cancel')}
                        </button>
                        <button 
                            onClick={handleModalSubmit} 
                            disabled={!modalInputValue.trim()}
                            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-indigo-400"
                        >
                            {t('save')}
                        </button>
                    </>
                }
            >
                <form onSubmit={handleModalSubmit}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('groupName')}
                    </label>
                    <input 
                        type="text" 
                        value={modalInputValue} 
                        onChange={e => setModalInputValue(e.target.value)} 
                        autoFocus
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </form>
            </Modal>
        </div>
    );
};

export default React.memo(DrawingWorkspace);
