
import React, { useMemo, useState } from 'react';
import { Character } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';

interface CharacterSelectionPanelProps {
    title: string;
    characters: Character[];
    selectedChars: Set<number>;
    onSelectionChange: (unicode: number, isSelected: boolean) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
}

const CharacterSelectionPanel: React.FC<CharacterSelectionPanelProps> = ({ title, characters, selectedChars, onSelectionChange, onSelectAll, onSelectNone }) => {
    const { t } = useLocale();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCharacters = useMemo(() => {
        if (!searchTerm) return characters;
        const lowerTerm = searchTerm.toLowerCase();
        return characters.filter(c => 
            c.name.toLowerCase().includes(lowerTerm) || 
            (c.label && c.label.toLowerCase().includes(lowerTerm))
        );
    }, [characters, searchTerm]);

    return (
        <div className="bg-gray-100 dark:bg-gray-800 p-4 flex flex-col h-full border-r dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t(title)}</h3>
            <div className="flex items-center gap-2 mb-2">
                <button onClick={onSelectAll} className="w-full text-center px-3 py-1.5 text-xs bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors">{t('selectAll')}</button>
                <button onClick={onSelectNone} className="w-full text-center px-3 py-1.5 text-xs bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors">{t('selectNone')}</button>
            </div>
            <input
                type="text"
                placeholder={t('searchChar')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 mb-2 text-sm"
            />
            <div className="flex-grow overflow-y-auto">
                {filteredCharacters.map(char => (
                    <label key={char.unicode} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-sm">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500 accent-indigo-500"
                            checked={selectedChars.has(char.unicode)}
                            onChange={(e) => onSelectionChange(char.unicode, e.target.checked)}
                        />
                        <span className="text-lg font-semibold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                            {char.label || char.name}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
};

export default React.memo(CharacterSelectionPanel);
