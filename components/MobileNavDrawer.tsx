
import React, { useCallback, useState } from 'react';
import { Character, CharacterSet } from '../types';
import DrawingWorkspace from './DrawingWorkspace';
import { ExportIcon, CreatorIcon, TestIcon, SettingsIcon, SearchIcon, CompareIcon, BatchIcon } from '../constants';
import { useLocale } from '../contexts/LocaleContext';
import { FilterMenu } from './FilterMenu';

interface MobileNavDrawerProps {
  isAnimatingOut: boolean;
  onClose: () => void;
  characterSets: CharacterSet[];
  onSelectCharacter: (character: Character, rect?: DOMRect) => void;
  onAddGlyph: (targetSet?: string) => void;
  onAddBlock: () => void;
  drawingProgress: { completed: number; total: number };
  onExportClick: () => void;
  onCreatorClick: () => void;
  onTestClick: () => void;
  onSettingsClick: () => void;
  onCompareClick: () => void;
  toggleSelectionMode: () => void;
  isMetricsSelectionMode: boolean;
  setIsPaletteOpen: (isOpen: boolean) => void;
  exportingType: string | null;
}

const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  isAnimatingOut,
  onClose,
  characterSets,
  onSelectCharacter,
  onAddGlyph,
  onAddBlock,
  drawingProgress,
  onExportClick,
  onCreatorClick,
  onTestClick,
  onSettingsClick,
  onCompareClick,
  toggleSelectionMode,
  isMetricsSelectionMode,
  setIsPaletteOpen,
  exportingType
}) => {
  const { t } = useLocale();

  const handleSelect = useCallback((character: Character, rect?: DOMRect) => {
    onSelectCharacter(character, rect);
    onClose(); // This call will trigger the parent's animation logic
  }, [onSelectCharacter, onClose]);
  
  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300 ${isAnimatingOut ? 'opacity-0' : 'opacity-100'}`} 
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="mobile-nav-drawer"
        className={`fixed top-0 left-0 bottom-0 w-[60%] max-w-[280px] bg-gray-50 dark:bg-gray-900 z-[70] shadow-2xl flex flex-col ${isAnimatingOut ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => { onExportClick(); onClose(); }} disabled={exportingType !== null} className="flex flex-col items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <ExportIcon />
                    </button>
                    <button onClick={() => { onCreatorClick(); onClose(); }} disabled={exportingType !== null} className="flex flex-col items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <CreatorIcon />
                    </button>
                    <button onClick={() => { onTestClick(); onClose(); }} disabled={exportingType !== null} className="flex flex-col items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <TestIcon />
                    </button>
                    <button onClick={() => { onSettingsClick(); onClose(); }} className="flex flex-col items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <SettingsIcon />
                    </button>
                    <button onClick={() => setIsPaletteOpen(true)} className="flex flex-col items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <SearchIcon />
                    </button>
                    <FilterMenu />
                    <button onClick={() => { onCompareClick(); onClose(); }} className="flex flex-col items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <CompareIcon />
                    </button>
                    <button onClick={() => { toggleSelectionMode(); onClose(); }} className={`flex flex-col items-center gap-1 text-xs font-semibold ${isMetricsSelectionMode ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'} bg-gray-200 dark:bg-gray-700 rounded-lg p-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors`}>
                        <BatchIcon />
                    </button>
                </div>
            </div>
        </div>
        {/* We can reuse DrawingWorkspace as it already contains the grid and filtering logic */}
        <DrawingWorkspace
          characterSets={characterSets}
          onSelectCharacter={handleSelect}
          onAddGlyph={onAddGlyph}
          onAddBlock={onAddBlock}
          drawingProgress={drawingProgress}
          isOverlayMode={true}
        />
      </div>
    </>
  );
};

export default MobileNavDrawer;
