
import React, { useMemo, forwardRef, useCallback, useState } from 'react';
import { Character, CharacterSet } from '../types';
import UnifiedCard from './UnifiedCard';
import { useLocale } from '../contexts/LocaleContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { VirtuosoGrid, Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { AddIcon, SwitchScriptIcon, CheckCircleIcon, EditIcon, CloseIcon, TrashIcon } from '../constants';
import { isGlyphComplete } from '../utils/glyphUtils';
import { useProject } from '../contexts/ProjectContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';

interface CharacterGridProps {
  characters?: Character[]; // For Flat View
  characterSets?: CharacterSet[]; // For Grouped View
  onSelectCharacter: (character: Character, rect: DOMRect) => void;
  onAddGlyph: (targetSet?: string) => void;
  onAddBlock: () => void;
  isFiltered: boolean;
  virtuosoRef?: React.RefObject<VirtuosoHandle>;
  onSectionVisibilityChange?: (index: number) => void;
  variant?: 'default' | 'compact' | 'overlay';
  
  // Group Management Props
  onRenameGroup?: (index: number, newName: string) => void;
  onDeleteGroup?: (index: number) => void;
  onAddGroup?: () => void;
}

// --- Components for Flat Grid View ---
const ItemContainer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div {...props} ref={ref} className="min-w-0 w-full" />
));

const GridHeader = () => <div className="col-span-full h-6" />;
const GridFooter = () => <div className="col-span-full h-24" />;

const CharacterGrid: React.FC<CharacterGridProps> = ({ 
    characters, 
    characterSets: propCharacterSets, 
    onSelectCharacter, 
    onAddGlyph,
    onAddBlock,
    isFiltered,
    virtuosoRef,
    onSectionVisibilityChange,
    variant,
    onRenameGroup,
    onDeleteGroup,
    onAddGroup
}) => {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { metricsSelection, setMetricsSelection, isMetricsSelectionMode, setIsMetricsSelectionMode } = useLayout();
  const { glyphDataMap } = useGlyphData();
  const { characterSets: projectCharacterSets, allCharsByName } = useProject();
  const { kerningMap } = useKerning();
  const { markPositioningMap } = usePositioning();

  const characterSets = propCharacterSets || projectCharacterSets;
  
  // Local state for inline editing
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const ListContainer = useMemo(() => forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => {
    const gridClasses = variant === 'overlay'
        ? "grid grid-cols-2 gap-2 p-2"
        : (variant === 'compact' 
            ? "grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2 p-2"
            : "grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 p-2 sm:gap-4 sm:p-4");
    return <div {...props} ref={ref} className={gridClasses} />;
  }), [variant]);
  
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

  const startEditing = (index: number, currentName: string) => {
      setEditingGroupIndex(index);
      setEditValue(t(currentName) === currentName ? currentName : t(currentName)); // Use resolved name
  };

  const cancelEditing = () => {
      setEditingGroupIndex(null);
      setEditValue('');
  };

  const saveEditing = (index: number) => {
      if (onRenameGroup && editValue.trim()) {
          onRenameGroup(index, editValue.trim());
      }
      setEditingGroupIndex(null);
  };
  
  const handleDelete = (index: number) => {
      if (onDeleteGroup) {
          onDeleteGroup(index);
      }
      // Note: We don't close edit mode immediately here because the modal in parent handles confirmation.
      // If we close it, the UI might jump. We can leave it or close it. 
      // Closing it is safer in case the modal cancels.
      setEditingGroupIndex(null);
  };

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
                    <div className="tutorial-glyph-item" data-tour={index === 0 ? "grid-item-0" : undefined}>
                        <UnifiedCard
                            key={char.unicode || char.name}
                            character={char}
                            onSelect={onSelectCharacter}
                            isSelectionMode={isMetricsSelectionMode}
                            isSelected={char.unicode !== undefined && metricsSelection.has(char.unicode)}
                            onToggleSelect={toggleSelection}
                            variant={variant}
                        />
                    </div>
                );
            }}
            overscan={400}
          />
      );
  }

  // --- Render Mode 2: Grouped List (Default View) ---
  if (characterSets) {
      const ghostButtonClass = "relative rounded-lg p-2 sm:p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 aspect-square h-full border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 bg-gray-50 dark:bg-gray-800/40 group";
      
      const gridClasses = variant === 'overlay'
        ? "grid grid-cols-2 gap-2 p-2"
        : (variant === 'compact'
            ? "grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2 px-4"
            : "grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 p-2 px-4 sm:gap-4 sm:px-6");

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
                if (visibleChars.length === 0 && group.characters.length > 0) return null; // Don't render empty hidden groups
                
                const requiredChars = visibleChars.filter(char => !char.optional);
                const isGroupComplete = requiredChars.length > 0 && requiredChars.every(char => {
                    return isGlyphComplete(char, glyphDataMap, markPositioningMap, kerningMap, allCharsByName);
                });
                
                const isEditing = editingGroupIndex === index;
                // Identify the very first item of the first group for the tutorial
                const isFirstGroup = index === 0;

                return (
                    <div className="pb-6" id={`section-${index}`}>
                         {/* Sticky Header */}
                        <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur py-2 px-6 border-b border-gray-200 dark:border-gray-700 shadow-sm mb-2 flex justify-between items-center h-14">
                            <div className="flex items-center gap-2 flex-grow">
                                {isEditing ? (
                                    <div className="flex items-center gap-2 w-full max-w-md animate-fade-in-up">
                                        <input 
                                            type="text" 
                                            value={editValue} 
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={(e) => { if(e.key === 'Enter') saveEditing(index); if(e.key === 'Escape') cancelEditing(); }}
                                            autoFocus
                                            className="px-2 py-1 text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                                        />
                                        <button onClick={() => saveEditing(index)} className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors" title="Save Name">
                                            <CheckCircleIcon className="w-5 h-5"/>
                                        </button>
                                        <button onClick={() => handleDelete(index)} className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors" title="Delete Group">
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                        <button onClick={cancelEditing} className="p-1.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Cancel">
                                            <CloseIcon className="w-5 h-5"/>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group/header">
                                        <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{t(group.nameKey)}</h3>
                                        {isGroupComplete && <CheckCircleIcon className="w-5 h-5 text-green-500 animate-pop-in" />}
                                        {onRenameGroup && (
                                            <button 
                                                onClick={() => startEditing(index, group.nameKey)}
                                                className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/header:opacity-100 transition-opacity"
                                                title="Edit Group Name"
                                            >
                                                <EditIcon className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full flex-shrink-0">{visibleChars.length}</span>
                        </div>
                        
                        {/* Internal Grid */}
                        <div className={gridClasses}>
                            {visibleChars.map((char, charIndex) => (
                                <div 
                                    key={char.unicode || char.name} 
                                    className="tutorial-glyph-item"
                                    data-tour={isFirstGroup && charIndex <= 1 ? `grid-item-${charIndex}` : undefined}
                                >
                                    <UnifiedCard
                                        character={char}
                                        onSelect={onSelectCharacter}
                                        isSelectionMode={isMetricsSelectionMode}
                                        isSelected={char.unicode !== undefined && metricsSelection.has(char.unicode)}
                                        onToggleSelect={toggleSelection}
                                        variant={variant}
                                    />
                                </div>
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

                            {/* Ghost Button: Add Block (Only in last group) */}
                            {index === (characterSets.length - 1) && (
                                <div
                                    onClick={onAddBlock}
                                    className={ghostButtonClass}
                                    title={t('addBlock')}
                                >
                                    <SwitchScriptIcon className="w-8 h-8 mb-1 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-50 group-hover:opacity-100 text-center transition-opacity">{t('addBlock')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            }}
            components={{
                Footer: () => (
                    <div className="pb-24 px-6 pt-4 flex flex-col items-center gap-4">
                        {onAddGroup && (
                            <button
                                onClick={onAddGroup}
                                className="w-full max-w-md py-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all group"
                            >
                                <AddIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                <span className="font-bold uppercase tracking-widest text-sm">{t('newGroup')}</span>
                            </button>
                        )}
                        <div className="h-12"/> {/* Extra padding */}
                    </div>
                )
            }}
          />
      );
  }

  return null;
};

export default React.memo(CharacterGrid);
