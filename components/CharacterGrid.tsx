
import React, { useMemo, forwardRef, useCallback } from 'react';
import { Character, CharacterSet } from '../types';
import UnifiedCard from './UnifiedCard';
import { useLocale } from '../contexts/LocaleContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { VirtuosoGrid, Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { AddIcon, SwitchScriptIcon } from '../constants';

interface CharacterGridProps {
  characters?: Character[]; // For Flat View
  characterSets?: CharacterSet[]; // For Grouped View
  onSelectCharacter: (character: Character, rect: DOMRect) => void;
  onAddGlyph: (targetSet?: string) => void;
  onAddBlock: () => void;
  isFiltered: boolean;
  virtuosoRef?: React.RefObject<VirtuosoHandle>;
  onSectionVisibilityChange?: (index: number) => void;
}

// --- Components for Flat Grid View ---
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
const GridFooter = () => <div className="col-span-full h-24" />;

const CharacterGrid: React.FC<CharacterGridProps> = ({ 
    characters, 
    characterSets, 
    onSelectCharacter, 
    onAddGlyph,
    onAddBlock,
    isFiltered,
    virtuosoRef,
    onSectionVisibilityChange
}) => {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { metricsSelection, setMetricsSelection, isMetricsSelectionMode, setIsMetricsSelectionMode } = useLayout();
  
  const toggleSelection = useCallback((character: Character) => {
      if (character.unicode === undefined) return;
      
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
  }, [isMetricsSelectionMode, setIsMetricsSelectionMode, setMetricsSelection]);

  if (!settings) return null;

  // --- Render Mode 1: Flat Grid (Filtered/Search Results) ---
  if (isFiltered && characters) {
      return (
          <VirtuosoGrid
            style={{ height: '100%' }}
            totalCount={characters.length}
            components={{
                List: ListContainer,
                Item: ItemContainer,
                Header: GridHeader,
                Footer: GridFooter
            }}
            itemContent={(index) => {
                const char = characters[index];
                return (
                    <UnifiedCard
                        key={char.unicode || char.name}
                        character={char}
                        onSelect={onSelectCharacter}
                        isSelectionMode={isMetricsSelectionMode}
                        isSelected={char.unicode !== undefined && metricsSelection.has(char.unicode)}
                        onToggleSelect={toggleSelection}
                    />
                );
            }}
            overscan={400}
          />
      );
  }

  // --- Render Mode 2: Grouped List (Default View) ---
  if (characterSets) {
      const ghostButtonClass = "relative rounded-lg p-2 sm:p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 aspect-square h-full border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 bg-gray-50 dark:bg-gray-800/40 group";

      return (
          <Virtuoso
            ref={virtuosoRef}
            data={characterSets}
            style={{ height: '100%' }}
            rangeChanged={(range) => {
                if (onSectionVisibilityChange) {
                    onSectionVisibilityChange(range.startIndex);
                }
            }}
            itemContent={(index, group) => {
                const visibleChars = group.characters.filter(char => !char.hidden || settings.showHiddenGlyphs);
                
                return (
                    <div className="pb-6" id={`section-${index}`}>
                         {/* Sticky Header */}
                        <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur py-2 px-6 border-b border-gray-200 dark:border-gray-700 shadow-sm mb-2 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{t(group.nameKey)}</h3>
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{visibleChars.length}</span>
                        </div>
                        
                        {/* Internal Grid */}
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 p-2 px-4 sm:gap-4 sm:px-6">
                            {visibleChars.map(char => (
                                <UnifiedCard
                                    key={char.unicode || char.name}
                                    character={char}
                                    onSelect={onSelectCharacter}
                                    isSelectionMode={isMetricsSelectionMode}
                                    isSelected={char.unicode !== undefined && metricsSelection.has(char.unicode)}
                                    onToggleSelect={toggleSelection}
                                />
                            ))}
                            
                            {/* Ghost Button: Add Glyph */}
                            <div
                                onClick={() => onAddGlyph(group.nameKey)}
                                className={ghostButtonClass}
                                title={t('addGlyph')}
                            >
                                <AddIcon className="w-8 h-8 mb-1 opacity-50 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[10px] font-bold uppercase tracking-wide opacity-50 group-hover:opacity-100 text-center transition-opacity">{t('addGlyph')}</span>
                            </div>

                            {/* Ghost Button: Add Block */}
                            <div
                                onClick={onAddBlock}
                                className={ghostButtonClass}
                                title={t('addBlock')}
                            >
                                <SwitchScriptIcon className="w-8 h-8 mb-1 opacity-50 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[10px] font-bold uppercase tracking-wide opacity-50 group-hover:opacity-100 text-center transition-opacity">{t('addBlock')}</span>
                            </div>
                        </div>
                    </div>
                );
            }}
            components={{
                Footer: () => <div className="pb-24" /> // Just padding for floating batch toolbar
            }}
          />
      );
  }

  return null;
};

export default React.memo(CharacterGrid);
