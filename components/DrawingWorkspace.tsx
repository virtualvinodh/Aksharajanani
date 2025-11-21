
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Character, CharacterSet, GlyphData } from '../types';
import CharacterGrid from './CharacterGrid';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { LeftArrowIcon, RightArrowIcon, CheckCircleIcon } from '../constants';
import ProgressIndicator from './ProgressIndicator';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { isGlyphDrawn } from '../utils/glyphUtils';

interface DrawingWorkspaceProps {
    characterSets: CharacterSet[];
    onSelectCharacter: (character: Character, rect: DOMRect) => void;
    onAddGlyph: () => void;
    onAddBlock: () => void;
    drawingProgress: { completed: number; total: number };
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
        const visibleChars = set.characters.filter(char => !char.hidden);
        if (!visibleChars || visibleChars.length === 0) return false;
        return visibleChars.every(char => isGlyphDrawn(glyphDataMap.get(char.unicode)));
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

const DrawingWorkspace: React.FC<DrawingWorkspaceProps> = ({ characterSets, onSelectCharacter, onAddGlyph, onAddBlock, drawingProgress }) => {
    const { t } = useLocale();
    const { activeTab, setActiveTab } = useLayout();
    const navContainerRef = useRef<HTMLDivElement>(null);
    const [showNavArrows, setShowNavArrows] = useState({ left: false, right: false });
    
    const { glyphDataMap } = useGlyphData();

    const visibleCharacterSets = useMemo(() => {
        return characterSets
            .map(set => ({
                ...set,
                characters: set.characters.filter(char => !char.hidden && char.unicode !== 8205 && char.unicode !== 8204)
            }))
            .filter(set => set.nameKey !== 'dynamicLigatures' && set.characters.length > 0);
    }, [characterSets]);

    useEffect(() => {
        if (activeTab >= visibleCharacterSets.length && visibleCharacterSets.length > 0) {
            setActiveTab(0);
        }
    }, [activeTab, setActiveTab, visibleCharacterSets.length]);

    const checkNavOverflow = useCallback(() => {
        const c = navContainerRef.current;
        if (!c) return;
        const tol = 2;
        const isOverflowing = c.scrollWidth > c.clientWidth + tol;
        setShowNavArrows({
            left: isOverflowing && c.scrollLeft > tol,
            right: isOverflowing && c.scrollLeft < c.scrollWidth - c.clientWidth - tol,
        });
    }, []);

    useEffect(() => {
        const c = navContainerRef.current;
        if (!c) return;
        checkNavOverflow();
        const resizeObserver = new ResizeObserver(checkNavOverflow);
        resizeObserver.observe(c);
        c.addEventListener('scroll', checkNavOverflow);
        return () => {
            if (c) {
                resizeObserver.disconnect();
                c.removeEventListener('scroll', checkNavOverflow);
            }
        };
    }, [checkNavOverflow, visibleCharacterSets]);

    const handleNavScroll = (dir: 'left' | 'right') => {
        const c = navContainerRef.current;
        if (c) {
            c.scrollBy({ left: dir === 'left' ? -c.clientWidth * 0.75 : c.clientWidth * 0.75, behavior: 'smooth' });
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 relative">
                {showNavArrows.left && (
                    <button
                        onClick={() => handleNavScroll('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md"
                    >
                        <LeftArrowIcon className="h-5 w-5" />
                    </button>
                )}
                <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar px-2 sm:px-4">
                    {visibleCharacterSets.map((set, index) => (
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
                {showNavArrows.right && (
                    <button
                        onClick={() => handleNavScroll('right')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md"
                    >
                        <RightArrowIcon className="h-5 w-5" />
                    </button>
                )}
            </div>
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator 
                    completed={drawingProgress.completed}
                    total={drawingProgress.total}
                    progressTextKey="progressText"
                />
            </div>
            <div className="flex-grow overflow-y-auto">
                <CharacterGrid
                    characters={visibleCharacterSets[activeTab]?.characters || []}
                    onSelectCharacter={onSelectCharacter}
                    onAddGlyph={onAddGlyph}
                    onAddBlock={onAddBlock}
                />
            </div>
        </div>
    );
};

export default React.memo(DrawingWorkspace);