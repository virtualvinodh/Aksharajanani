
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Character, CharacterSet, GlyphData } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';
import CharacterCard from './CharacterCard';
import { LeftArrowIcon, RightArrowIcon, CheckCircleIcon } from '../constants';
import { isGlyphDrawn as isGlyphDrawnUtil } from '../utils/glyphUtils';
import { useGlyphData } from '../contexts/GlyphDataContext';

interface GlyphSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: Character) => void;
  characterSets: CharacterSet[];
  // Although we use context internally for version, we keep this prop for data access if passed from parent
  glyphDataMap: Map<number, GlyphData>;
}

const CharacterSetTab: React.FC<{
    set: CharacterSet;
    index: number;
    activeTab: number;
    setActiveTab: (index: number) => void;
    glyphDataMap: Map<number, GlyphData>;
    // Use version to force re-render of completion status
    glyphVersion: number;
}> = ({ set, index, activeTab, setActiveTab, glyphDataMap, glyphVersion }) => {
    const { t } = useLocale();
    const [isAnimating, setIsAnimating] = useState(false);
    const wasComplete = useRef(false);

    const isSetComplete = useMemo(() => {
        if (!set.characters || set.characters.length === 0) return false;
        return set.characters.every(char => isGlyphDrawnUtil(glyphDataMap.get(char.unicode)));
    }, [set.characters, glyphDataMap, glyphVersion]);

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
            className={`flex-shrink-0 flex items-center gap-1.5 py-3 px-3 sm:px-4 text-sm font-medium border-b-2 transition-colors select-none ${
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
  // Consume version from context to ensure modal updates when glyphs are drawn
  const { version: glyphVersion } = useGlyphData();
  
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Manual Scroll Logic (Ported from DrawingWorkspace for consistency)
  const navContainerRef = useRef<HTMLDivElement>(null);
  const [showNavArrows, setShowNavArrows] = useState({ left: false, right: false });

  const isGlyphDrawn = useCallback((char: Character): boolean => {
    return isGlyphDrawnUtil(glyphDataMap.get(char.unicode));
  }, [glyphDataMap, glyphVersion]);

  const drawnCharacterSets = useMemo(() => {
    if (!characterSets) return [];
    return characterSets
        .map(set => ({
            ...set,
            characters: set.characters.filter(char => !char.hidden && isGlyphDrawn(char))
        }))
        .filter(set => set.characters.length > 0);
  }, [characterSets, isGlyphDrawn, glyphVersion]);

  // Scroll Overflow Checker
  const checkNavOverflow = useCallback(() => {
      const c = navContainerRef.current;
      if (!c) return;
      const tol = 2; // Tolerance
      const isOverflowing = c.scrollWidth > c.clientWidth + tol;
      setShowNavArrows({
          left: isOverflowing && c.scrollLeft > tol,
          right: isOverflowing && c.scrollLeft < c.scrollWidth - c.clientWidth - tol,
      });
  }, []);

  // Attach ResizeObserver and Scroll Listeners
  useEffect(() => {
      const c = navContainerRef.current;
      if (!c) return;
      
      // Run immediately
      checkNavOverflow();
      
      const resizeObserver = new ResizeObserver(checkNavOverflow);
      resizeObserver.observe(c);
      c.addEventListener('scroll', checkNavOverflow);
      
      // Delay check slightly for modal animation to finish
      const timer = setTimeout(checkNavOverflow, 100);

      return () => {
          if(c) {
              resizeObserver.disconnect();
              c.removeEventListener('scroll', checkNavOverflow);
          }
          clearTimeout(timer);
      };
  }, [checkNavOverflow, drawnCharacterSets, isOpen]);

  const handleNavScroll = (dir: 'left' | 'right') => {
      const c = navContainerRef.current;
      if (c) c.scrollBy({ left: dir === 'left' ? -c.clientWidth * 0.75 : c.clientWidth * 0.75, behavior: 'smooth' });
  };

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
           {!searchTerm && (
               <div className="relative w-full flex items-center overflow-hidden bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                    {showNavArrows.left && (
                        <button
                            onClick={() => handleNavScroll('left')}
                            className="absolute left-0 z-10 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-r dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <LeftArrowIcon className="h-5 w-5" />
                        </button>
                    )}
                    
                    <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar px-2 sm:px-4 w-full items-center">
                        {drawnCharacterSets.map((set, index) => (
                            <CharacterSetTab
                                key={set.nameKey}
                                set={set}
                                index={index}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                glyphDataMap={glyphDataMap}
                                glyphVersion={glyphVersion}
                            />
                        ))}
                    </div>

                    {showNavArrows.right && (
                         <button
                            onClick={() => handleNavScroll('right')}
                            className="absolute right-0 z-10 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-l dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <RightArrowIcon className="h-5 w-5" />
                        </button>
                    )}
               </div>
           )}
            <input
                type="text"
                placeholder={t('searchChar')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm"
                autoFocus
            />
        </div>
        <div className="flex-grow overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/50">
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
