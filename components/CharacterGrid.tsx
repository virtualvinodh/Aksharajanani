
import React, { useMemo, forwardRef } from 'react';
import { Character } from '../types';
import CharacterCard from './CharacterCard';
import { useLocale } from '../contexts/LocaleContext';
import { AddIcon, SwitchScriptIcon } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useLayout } from '../contexts/LayoutContext';
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
      className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 p-2 sm:gap-4 sm:p-4"
    />
));

const ItemContainer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div {...props} ref={ref} className="min-w-0 w-full" />
));

const GridHeader = () => <div className="col-span-full h-6" />;
const GridFooter = () => <div className="col-span-full h-24" />; // Extra padding for bottom bar

const CharacterGrid: React.FC<CharacterGridProps> = ({ characters, onSelectCharacter, onAddGlyph, onAddBlock }) => {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { glyphDataMap } = useGlyphData();
  const { metricsSelection, setMetricsSelection, isMetricsSelectionMode, setIsMetricsSelectionMode, filterMode } = useLayout();
  
  const showHidden = settings?.showHiddenGlyphs ?? false;

  const gridItems = useMemo<GridItem[]>(() => {
    const items: GridItem[] = characters
      .filter(char => !char.hidden || showHidden)
      .map(char => ({ type: 'char', data: char }));
      
    // Only show Add buttons if we are viewing "None" (Standard Mode)
    // In "Completed", "Incomplete", or "All" (Flat list) modes, these are distracting.
    if (filterMode === 'none') {
        items.push({ type: 'addGlyph' });
        items.push({ type: 'addBlock' });
    }
    
    return items;
  }, [characters, showHidden, filterMode]);

  const toggleSelection = (character: Character) => {
      if (!character.unicode) return;
      
      // If we are toggling, we implicitly enter selection mode if not already active
      if (!isMetricsSelectionMode) {
          setIsMetricsSelectionMode(true);
      }

      setMetricsSelection(prev => {
          const newSet = new Set(prev);
          if (newSet.has(character.unicode!)) {
              newSet.delete(character.unicode!);
          } else {
              newSet.add(character.unicode!);
          }
          
          return newSet;
      });
  };

  const ItemContent = (index: number) => {
      const item = gridItems[index];
      
      if (item.type === 'char') {
          return (
            <CharacterCard
                key={item.data.unicode}
                character={item.data}
                glyphData={glyphDataMap.get(item.data.unicode!)}
                onSelect={onSelectCharacter}
                isSelectionMode={isMetricsSelectionMode}
                isSelected={item.data.unicode !== undefined && metricsSelection.has(item.data.unicode)}
                onToggleSelect={toggleSelection}
            />
          );
      }
      
      // Ghost Button Styling for Progressive Discovery
      const ghostButtonClass = "relative w-full h-full rounded-lg p-2 sm:p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 aspect-square h-full border border-transparent text-gray-400 dark:text-gray-600 hover:bg-white dark:hover:bg-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:text-indigo-600 dark:hover:text-indigo-400 hover:shadow-sm";
      
      if (item.type === 'addGlyph') {
          return (
            <div
                onClick={() => onAddGlyph()}
                className={ghostButtonClass}
                title={t('addGlyph')}
            >
                <AddIcon className="w-8 h-8 opacity-60" />
                <p className="text-xs font-medium mt-2 text-center opacity-60">{t('addGlyph')}</p>
            </div>
          );
      }
      
      if (item.type === 'addBlock') {
          return (
            <div
                onClick={onAddBlock}
                className={ghostButtonClass}
                title={t('addBlock')}
            >
                <SwitchScriptIcon className="w-8 h-8 opacity-60" />
                <p className="text-xs font-medium mt-2 text-center opacity-60">{t('addBlock')}</p>
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
            Header: GridHeader,
            Footer: GridFooter
        }}
        itemContent={ItemContent}
        overscan={400}
      />
  );
};

export default React.memo(CharacterGrid);
