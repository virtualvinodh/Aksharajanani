
import React, { useState, useRef, useEffect } from 'react';
import { useLayout } from '../contexts/LayoutContext';
import { useLocale } from '../contexts/LocaleContext';
import { FilterIcon } from '../constants';
import { FilterMode } from '../types';

export const FilterMenu: React.FC = () => {
    const { t } = useLocale();
    const { 
        filterMode, setFilterMode, 
        searchQuery, setSearchQuery, 
        workspace 
    } = useLayout();
    
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const showFilter = workspace === 'drawing' || workspace === 'positioning' || workspace === 'kerning';
    const isDrawingMode = workspace === 'drawing';
    const isKerningMode = workspace === 'kerning';
    const isPositioningMode = workspace === 'positioning';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleFilterChange = (mode: FilterMode) => {
        setFilterMode(mode);
        setIsOpen(false);
    };

    if (!showFilter) return null;

    const isFilteredOrSearched = filterMode !== 'none' || searchQuery !== '';

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(p => !p)}
                className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base font-semibold transition-colors ${isFilteredOrSearched ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                title={t('filter')}
            >
                <FilterIcon />
                <span className="hidden md:inline">{t('filter')}</span>
            </button>
            
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-40 overflow-hidden">
                    <div className="p-2 border-b dark:border-gray-700">
                        <input 
                            ref={inputRef}
                            type="text" 
                            placeholder="Filter by name..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-2 text-sm border rounded bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>
                    <button onClick={() => handleFilterChange('none')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'none' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                        {isDrawingMode ? t('filterNone') : t('none')}
                    </button>
                    <button onClick={() => handleFilterChange('all')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'all' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                        {isDrawingMode ? t('filterAllFlat') : t('showAll')}
                    </button>
                    <button onClick={() => handleFilterChange('completed')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'completed' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                        {t('showCompleted')}
                    </button>
                    <button onClick={() => handleFilterChange('incomplete')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'incomplete' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                        {t('showIncomplete')}
                    </button>
                    {isKerningMode && (
                         <button onClick={() => handleFilterChange('ignored')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'ignored' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                            {t('filterIgnored')}
                        </button>
                    )}
                    {(isDrawingMode || isPositioningMode) && (
                        <button onClick={() => handleFilterChange('autoGenerated')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'autoGenerated' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                            {t('filterAutoGenerated')}
                        </button>
                    )}
                    {(isDrawingMode || isPositioningMode || isKerningMode) && (
                        <button onClick={() => handleFilterChange('toBeReviewed')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'toBeReviewed' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                            {t('filterToBeReviewed')}
                        </button>
                    )}
                    {isDrawingMode && (
                        <>
                            <button onClick={() => handleFilterChange('drawn')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'drawn' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {t('filterDrawn')}
                            </button>
                            <div className="border-t my-1 dark:border-gray-700"></div>
                            <button onClick={() => handleFilterChange('base')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'base' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {t('filterBase')}
                            </button>
                            <button onClick={() => handleFilterChange('ligature')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'ligature' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {t('filterLigature')}
                            </button>
                            <button onClick={() => handleFilterChange('mark')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${filterMode === 'mark' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {t('filterMark')}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
