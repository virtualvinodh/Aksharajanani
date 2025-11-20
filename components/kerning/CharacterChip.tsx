import React from 'react';
import { Character } from '../../types';

interface CharacterChipProps {
    char: Character;
    isSelected: boolean;
    onToggle: (unicode: number, isSelected: boolean) => void;
}

const CharacterChip: React.FC<CharacterChipProps> = ({ char, isSelected, onToggle }) => {
    return (
        <label className={`flex-shrink-0 flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors whitespace-nowrap border ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
            <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onToggle(char.unicode, e.target.checked)}
                className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500 accent-indigo-500"
            />
            <span style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                {char.name}
            </span>
        </label>
    );
};

export default React.memo(CharacterChip);