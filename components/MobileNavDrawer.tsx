import React, { useCallback, useState } from 'react';
import { Character, CharacterSet } from '../types';
import DrawingWorkspace from './DrawingWorkspace';

interface MobileNavDrawerProps {
  isAnimatingOut: boolean;
  onClose: () => void;
  characterSets: CharacterSet[];
  onSelectCharacter: (character: Character, rect?: DOMRect) => void;
  onAddGlyph: (targetSet?: string) => void;
  onAddBlock: () => void;
  drawingProgress: { completed: number; total: number };
}

const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  isAnimatingOut,
  onClose,
  characterSets,
  onSelectCharacter,
  onAddGlyph,
  onAddBlock,
  drawingProgress
}) => {

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
        className={`fixed top-0 left-0 bottom-0 w-[60%] max-w-[280px] bg-gray-50 dark:bg-gray-900 z-[70] shadow-2xl flex flex-col ${isAnimatingOut ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
        role="dialog"
        aria-modal="true"
      >
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