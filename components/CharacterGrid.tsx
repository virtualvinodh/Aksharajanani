
import React from 'react';
import { Character } from '../types';
import CharacterCard from './CharacterCard';
import { useLocale } from '../contexts/LocaleContext';
import { AddIcon, SwitchScriptIcon } from '../constants';
import { useSettings } from '../contexts/SettingsContext';

interface CharacterGridProps {
  characters: Character[];
  onSelectCharacter: (character: Character, rect: DOMRect) => void;
  onAddGlyph: () => void;
  onAddBlock: () => void;
}

const CharacterGrid: React.FC<CharacterGridProps> = ({ characters, onSelectCharacter, onAddGlyph, onAddBlock }) => {
  const { t } = useLocale();
  const { settings } = useSettings();
  
  if (!settings) return null;

  const { editorMode } = settings;

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4 p-4">
      {characters.filter(char => !char.hidden).map(char => (
        <CharacterCard
          key={char.unicode}
          character={char}
          onSelect={onSelectCharacter}
        />
      ))}
      {editorMode === 'advanced' && (
        <>
          <div
            onClick={onAddGlyph}
            className="bg-gray-100 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500 cursor-pointer transition-all duration-200 aspect-square text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            title={t('addGlyph')}
          >
            <AddIcon />
            <p className="text-sm font-semibold mt-2 text-center">{t('addGlyph')}</p>
          </div>
          <div
            onClick={onAddBlock}
            className="bg-gray-100 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500 cursor-pointer transition-all duration-200 aspect-square text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            title={t('addBlock')}
          >
            <SwitchScriptIcon />
            <p className="text-sm font-semibold mt-2 text-center">{t('addBlock')}</p>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(CharacterGrid);