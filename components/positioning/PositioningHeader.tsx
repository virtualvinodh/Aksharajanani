
import React, { useEffect } from 'react';
import { Character } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { RulesIcon, SaveIcon, BackIcon, LeftArrowIcon, RightArrowIcon } from '../../constants';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';

interface PositioningHeaderProps {
    viewMode: 'rules' | 'base' | 'mark';
    setViewMode: (mode: 'rules' | 'base' | 'mark') => void;
    isFiltered: boolean;
    getBannerText: () => string;
    isRulesManagerOpen: boolean;
    setIsRulesManagerOpen: (isOpen: boolean) => void;
    saveManagerChanges: () => void;
    settingsAutosaveEnabled: boolean;
    navItems: Character[];
    activeTab: number;
    setActiveTab: (index: number) => void;
    isGridView: boolean;
}

const PositioningHeader: React.FC<PositioningHeaderProps> = ({
    viewMode, setViewMode, isFiltered, getBannerText, isRulesManagerOpen, setIsRulesManagerOpen,
    saveManagerChanges, settingsAutosaveEnabled, navItems, activeTab, setActiveTab,
    isGridView
}) => {
    const { t } = useLocale();
    // Using the new hook interface which provides a callback ref 'scrollRef'
    // 'node' is managed internally by the hook now
    const { visibility: showNavArrows, handleScroll, scrollRef, checkVisibility } = useHorizontalScroll();

    // Trigger visibility check when data changes
    useEffect(() => {
        // Immediate check
        checkVisibility();
        // Delayed check to allow for layout shifts
        const timer = setTimeout(checkVisibility, 100);
        return () => clearTimeout(timer);
    }, [navItems, checkVisibility, viewMode]); // Added viewMode dependency to re-check when switching views

    // We need to manage the ref and scrolling active tab into view manually 
    // because we need access to the DOM node for scrollIntoView logic
    // We can't access `node` from the hook directly in a simple way to query children, 
    // so we'll use a temporary ref assignment strategy or query selector if needed.
    // However, since `useHorizontalScroll` now owns the ref state, we can just rely on standard scroll behavior
    // OR we can pass a ref TO the hook. The previous implementation passed a ref.
    // The NEW implementation returns a callback `scrollRef`.
    // We need to attach this `scrollRef` to the div.
    
    // To implement "Scroll Active Tab Into View", we need access to the element.
    // We can use a callback wrapper to capture the element locally as well.
    const containerElementRef = React.useRef<HTMLDivElement | null>(null);
    
    const setRefs = React.useCallback((node: HTMLDivElement | null) => {
        containerElementRef.current = node;
        scrollRef(node); // Pass to hook
    }, [scrollRef]);

    useEffect(() => {
        if (containerElementRef.current && navItems.length > 0) {
            const activeElement = containerElementRef.current.children[activeTab] as HTMLElement;
            if (activeElement) {
                activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [activeTab, navItems]);

    return (
        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex flex-row justify-between items-center relative gap-2 sm:gap-0">
                {!isFiltered && !isRulesManagerOpen && (
                    <div className="flex-1 sm:flex-none flex justify-start sm:justify-center sm:absolute sm:left-1/2 sm:top-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 mr-2 sm:mr-0 min-w-0">
                        {/* View Toggle */}
                        <div className="inline-flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg shadow-inner w-full sm:w-auto h-full items-stretch">
                            <button 
                                onClick={() => setViewMode('rules')} 
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-normal text-center leading-tight flex items-center justify-center ${viewMode === 'rules' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                            >
                                By Rule
                            </button>
                            <button 
                                onClick={() => setViewMode('base')} 
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-normal text-center leading-tight flex items-center justify-center ${viewMode === 'base' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                            >
                                By Base
                            </button>
                            <button 
                                onClick={() => setViewMode('mark')} 
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-normal text-center leading-tight flex items-center justify-center ${viewMode === 'mark' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                            >
                                By Mark
                            </button>
                        </div>
                    </div>
                )}
                {isFiltered && (
                     <div className="flex-1 text-left sm:text-center sm:absolute sm:left-1/2 sm:top-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 font-bold text-gray-700 dark:text-gray-200 text-sm sm:text-base truncate">
                         {getBannerText()}
                     </div>
                )}
                {isRulesManagerOpen && (
                     <div className="flex-1 text-left sm:text-center sm:absolute sm:left-1/2 sm:top-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 font-bold text-gray-900 dark:text-white text-lg sm:text-xl truncate">
                         {t('manageRules')}
                     </div>
                )}

                <div className="flex-shrink-0 ml-auto flex items-center gap-2">
                    {!isRulesManagerOpen ? (
                         <button 
                            onClick={() => setIsRulesManagerOpen(true)} 
                            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-xs sm:text-sm"
                        >
                            <RulesIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="whitespace-nowrap">{t('manageRules')}</span>
                        </button>
                    ) : (
                         <>
                            {!settingsAutosaveEnabled && (
                                <button 
                                    onClick={saveManagerChanges}
                                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors text-xs sm:text-sm"
                                >
                                    <SaveIcon className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap">{t('save')}</span>
                                </button>
                            )}
                            <button 
                                onClick={() => setIsRulesManagerOpen(false)} 
                                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-xs sm:text-sm"
                            >
                                <BackIcon className="w-4 h-4 flex-shrink-0" />
                                <span className="whitespace-nowrap">Back</span>
                            </button>
                         </>
                    )}
                </div>
            </div>
            
            {/* Secondary Nav for Grid View */}
            {!isRulesManagerOpen && !isFiltered && isGridView && (
                <div className="relative mt-2 flex items-center">
                    {showNavArrows.left && (
                         <button onClick={() => handleScroll('left')} className="absolute left-0 z-20 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-r dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><LeftArrowIcon className="h-5 w-5"/></button>
                    )}
                    <div ref={setRefs} className="flex space-x-1 overflow-x-auto no-scrollbar py-1 w-full px-8 scroll-smooth">
                       {navItems.map((item, index) => (
                            <button
                                key={item.unicode}
                                onClick={() => setActiveTab(index)}
                                className={`flex-shrink-0 px-3 py-2 text-lg font-bold rounded-md whitespace-nowrap transition-colors border ${activeTab === index ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-transparent'}`}
                                style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                            >
                                {item.name}
                            </button>
                        ))}
                    </div>
                    {showNavArrows.right && (
                        <button onClick={() => handleScroll('right')} className="absolute right-0 z-20 bg-white/90 dark:bg-gray-800/90 p-1.5 h-full shadow-md border-l dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><RightArrowIcon className="h-5 w-5"/></button>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(PositioningHeader);
