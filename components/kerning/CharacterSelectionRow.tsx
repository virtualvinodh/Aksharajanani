
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Character } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { LeftArrowIcon, RightArrowIcon } from '../../constants';
import CharacterChip from './CharacterChip';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';

interface CharacterSelectionRowProps {
    title: string;
    characters: Character[];
    selectedChars: Set<number>;
    onSelectionChange: (unicode: number, isSelected: boolean) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
}

const CharacterSelectionRow: React.FC<CharacterSelectionRowProps> = ({ title, characters, selectedChars, onSelectionChange, onSelectAll, onSelectNone }) => {
    const { t } = useLocale();
    const { visibility: showArrows, handleScroll, scrollRef, checkVisibility } = useHorizontalScroll();

    // Trigger check on data change
    useEffect(() => {
        checkVisibility();
        // Delay check to allow layout calculation
        const t = setTimeout(checkVisibility, 50);
        return () => clearTimeout(t);
    }, [characters, checkVisibility]);

    return (
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold text-gray-900 dark:text-white">{t(title)}</h3>
                <div className="flex items-center gap-2">
                    <button onClick={onSelectAll} className="px-3 py-1 text-xs bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors">{t('selectAll')}</button>
                    <button onClick={onSelectNone} className="px-3 py-1 text-xs bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors">{t('selectNone')}</button>
                </div>
            </div>
            <div className="relative">
                {showArrows.left && (
                    <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-900/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-900">
                        <LeftArrowIcon className="h-5 w-5"/>
                    </button>
                )}
                <div ref={scrollRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                    {characters.map(char => (
                        <CharacterChip key={char.unicode} char={char} isSelected={selectedChars.has(char.unicode)} onToggle={onSelectionChange} />
                    ))}
                </div>
                {showArrows.right && (
                    <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-900/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-900">
                        <RightArrowIcon className="h-5 w-5"/>
                    </button>
                )}
            </div>
        </div>
    );
};

export default React.memo(CharacterSelectionRow);
