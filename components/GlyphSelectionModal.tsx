
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Character, CharacterSet, GlyphData } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';
import CharacterCard from './CharacterCard';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { LeftArrowIcon, RightArrowIcon, CheckCircleIcon } from '../constants';
import { isGlyphDrawn as isGlyphDrawnUtil } from '../utils/glyphUtils';

interface GlyphSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: Character) => void;
  characterSets: CharacterSet[];
  glyphDataMap: Map<number, GlyphData>;
}

const CharacterSetTab: React.FC<{
    set: CharacterSet;
    index: number;
    activeTab: number;
    setActiveTab: (index: number) => void;
    glyphDataMap: Map<number, GlyphData>;
}> = ({ set, index, activeTab, setActiveTab, glyphDataMap }) => {
    const { t } = useLocale();
    const [isAnimating, setIsAnimating] = useState(false);
    const wasComplete = useRef(false);

    const isSetComplete = useMemo(() => {
        if (!set.characters || set.characters.length === 0) return false;
        return set.characters.every(char => isGlyphDrawnUtil(glyphDataMap.get(char.unicode)));
    }, [set.characters, glyphDataMap]);

    useEffect(() => {
        if (isSetComplete && !wasComplete.current) {
            setIsAnimating(true);
            const timer = setTimeout(() => setIsAnimating(false), 600); // Match animation duration
            return () => clearTimeout(timer);
        }
        wasComplete.current = isSetComplete;
    }, [isSetComplete]);

    const animationClass = isAnimating ? 'animate-pop-in' : '';

    return (
        <button
            key={set.nameKey}
            onClick={() => setActiveTab(index)}
            className={`flex-shrink-0 flex items-center gap-1.5 py-3 px-3 sm:px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === index
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
        >
            <span>{t(set.nameKey)}</span>
            {isSetComplete && <CheckCircleIcon className={`h-4 w-4 text-green-500 ${animationClass}`} />}
        </button>
    );
};

const GlyphSelectionModal: React.FC<GlyphSelectionModalProps> = ({ isOpen, onClose, onSelect, characterSets, glyphDataMap }) => {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const navContainerRef = useRef<HTMLDivElement>(null);
  const { visibility: showNavArrows, handleScroll } = useHorizontalScroll(navContainerRef);

  const isGlyphDrawn = useCallback((char: Character): boolean => {
    return isGlyphDrawnUtil(glyphDataMap.get(char.unicode));
  }, [glyphDataMap]);

  const drawnCharacterSets = useMemo(() => {
    if (!characterSets) return [];
    return characterSets
        .map(set => ({
            ...set,
            characters: set.characters.filter(char => !char.hidden && isGlyphDrawn(char))
        }))
        .filter(set => set.characters.length > 0);
  }, [characterSets, isGlyphDrawn]);

  useEffect(() => {
    if (isOpen) {
        setActiveTab(0);
        setSearchTerm('');
    }
  }, [isOpen]);

  const currentCharacters = useMemo(() => {
    if (searchTerm) {
        // When searching, search across all characters from all visible sets.
        return drawnCharacterSets
            .flatMap(set => set.characters)
            .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    if (drawnCharacterSets.length === 0) return [];
    
    // When not searching, show drawn characters from the active tab.
    const currentActiveTab = Math.min(activeTab, drawnCharacterSets.length - 1);
    return drawnCharacterSets[currentActiveTab]?.characters || [];
  }, [drawnCharacterSets, activeTab, searchTerm]);

  const handleSelect = (char: Character) => {
    onSelect(char);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('select')}
      size="xl"
      footer={<button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">{t('cancel')}</button>}
    >
      <div className="flex flex-col h-[70vh]">
        <div className="flex-shrink-0 p-2 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
           <div className="relative w-full">
                {showNavArrows.left && (
                    <button
                        onClick={() => handleScroll('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md"
                    >
                        <LeftArrowIcon className="h-5 w-5" />
                    </button>
                )}
                {!searchTerm && (
                    <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar px-2 sm:px-4">
                        {drawnCharacterSets.map((set, index) => (
                            <CharacterSetTab
                                key={set.nameKey}
                                set={set}
                                index={index}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                glyphDataMap={glyphDataMap}
                            />
                        ))}
                    </div>
                )}
                {showNavArrows.right && (
                     <button
                        onClick={() => handleScroll('right')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md"
                    >
                        <RightArrowIcon className="h-5 w-5" />
                    </button>
                )}
           </div>
            <input
                type="text"
                placeholder={t('searchChar')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm"
                autoFocus
            />
        </div>
        <div className="flex-grow overflow-y-auto p-4">
             <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
              {currentCharacters.length > 0 ? currentCharacters.map(char => (
                <CharacterCard
                  key={char.unicode}
                  character={char}
                  glyphData={glyphDataMap.get(char.unicode!)}
                  onSelect={handleSelect}
                />
              )) : (
                <p className="col-span-full text-center text-gray-500">{t('noResultsFound')}</p>
              )}
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default React.memo(GlyphSelectionModal);
