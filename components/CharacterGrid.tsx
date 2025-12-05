
import React, { useMemo, forwardRef } from 'react';
import { Character } from '../types';
import CharacterCard from './CharacterCard';
import { useLocale } from '../contexts/LocaleContext';
import { AddIcon, SwitchScriptIcon } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { VirtuosoGrid } from 'react-virtuoso';

interface CharacterGridProps {
  characters: Character[];
  onSelectCharacter: (character: Character, rect: DOMRect) => void;
  onAddGlyph: () => void;
  onAddBlock: () => void;
}

type GridItem = 
  | { type: 'char'; data: Character }
  | { type: 'addGlyph' }
  | { type: 'addBlock' };

const ListContainer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div
      {...props}
      ref={ref}
      className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4 p-4 pb-24"
    />
));

// FIX: Ensure ItemContainer fills the grid cell space and handles sizing correctly
const ItemContainer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div {...props} ref={ref} className="min-w-0 w-full" />
));

const GridHeader = () => <div className="col-span-full h-8" />;

const CharacterGrid: React.FC<CharacterGridProps> = ({ characters, onSelectCharacter, onAddGlyph, onAddBlock }) => {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { glyphDataMap } = useGlyphData();
  
  const editorMode = settings?.editorMode || 'simple';
  const showHidden = settings?.showHiddenGlyphs ?? false;

  const gridItems = useMemo<GridItem[]>(() => {
    const items: GridItem[] = characters
      .filter(char => !char.hidden || showHidden)
      .map(char => ({ type: 'char', data: char }));
      
    if (editorMode === 'advanced') {
        items.push({ type: 'addGlyph' });
        items.push({ type: 'addBlock' });
    }
    return items;
  }, [characters, showHidden, editorMode]);

  const ItemContent = (index: number) => {
      const item = gridItems[index];
      
      if (item.type === 'char') {
          return (
            <CharacterCard
                key={item.data.unicode}
                character={item.data}
                glyphData={glyphDataMap.get(item.data.unicode!)}
                onSelect={onSelectCharacter}
            />
          );
      }
      
      if (item.type === 'addGlyph') {
          return (
            <div
                onClick={onAddGlyph}
                className="relative w-full h-full bg-gray-100 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500 cursor-pointer transition-all duration-200 aspect-square text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 h-full"
                title={t('addGlyph')}
            >
                <AddIcon />
                <p className="text-sm font-semibold mt-2 text-center">{t('addGlyph')}</p>
            </div>
          );
      }
      
      if (item.type === 'addBlock') {
          return (
            <div
                onClick={onAddBlock}
                className="relative w-full h-full bg-gray-100 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:border-indigo-500 cursor-pointer transition-all duration-200 aspect-square text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 h-full"
                title={t('addBlock')}
            >
                <SwitchScriptIcon />
                <p className="text-sm font-semibold mt-2 text-center">{t('addBlock')}</p>
            </div>
          );
      }
      return null;
  };

  if (!settings) return null;

  return (
      <VirtuosoGrid
        style={{ height: '100%' }}
        totalCount={gridItems.length}
        components={{
            List: ListContainer,
            Item: ItemContainer,
            Header: GridHeader
        }}
        itemContent={ItemContent}
        overscan={400}
      />
  );
};

export default React.memo(CharacterGrid);
