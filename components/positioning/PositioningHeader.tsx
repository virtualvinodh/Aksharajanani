
import React from 'react';
import { Character } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { RulesIcon, SaveIcon, BackIcon, LeftArrowIcon, RightArrowIcon } from '../../constants';

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
    showNavArrows: { left: boolean, right: boolean };
    handleScroll: (direction: 'left' | 'right') => void;
    navContainerRef: React.RefObject<HTMLDivElement>;
    isGridView: boolean;
}

const PositioningHeader: React.FC<PositioningHeaderProps> = ({
    viewMode, setViewMode, isFiltered, getBannerText, isRulesManagerOpen, setIsRulesManagerOpen,
    saveManagerChanges, settingsAutosaveEnabled, navItems, activeTab, setActiveTab, showNavArrows, handleScroll, navContainerRef,
    isGridView
}) => {
    const { t } = useLocale();

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
                <div className="relative mt-2">
                    {showNavArrows.left && (
                         <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-800"><LeftArrowIcon className="h-5 w-5"/></button>
                    )}
                    <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar py-1">
                       {navItems.map((item, index) => (
                            <button
                                key={item.unicode}
                                onClick={() => setActiveTab(index)}
                                className={`flex-shrink-0 px-3 py-2 text-lg font-bold rounded-md whitespace-nowrap transition-colors ${activeTab === index ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                            >
                                {item.name}
                            </button>
                        ))}
                    </div>
                    {showNavArrows.right && (
                        <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-800"><RightArrowIcon className="h-5 w-5"/></button>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(PositioningHeader);
