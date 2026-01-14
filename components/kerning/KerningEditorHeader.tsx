import React from 'react';
import { Character, AppSettings } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, SparklesIcon, SaveIcon, TrashIcon } from '../../constants';

interface KerningEditorHeaderProps {
    pair: { left: Character, right: Character };
    onClose: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
    hasPrev: boolean;
    hasNext: boolean;
    onAutoKern: () => void;
    isAutoKerning: boolean;
    onSave: () => void;
    onRemove: () => void;
    isDirty: boolean;
    settings: AppSettings;
}

const KerningEditorHeader: React.FC<KerningEditorHeaderProps> = ({
    pair, onClose, onNavigate, hasPrev, hasNext, onAutoKern, isAutoKerning, onSave, onRemove, isDirty, settings
}) => {
    const { t } = useLocale();

    const navButtonClass = "p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all";
    
    const useKerningTerm = settings.editorMode === 'advanced' || settings.preferKerningTerm;
    const autoLabel = useKerningTerm ? t('autoKern') : "Auto-space";

    return (
        <header className="bg-gray-50 dark:bg-gray-800 p-4 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0 z-20 shadow-sm">
            {/* Left: Back */}
            <div className="flex-1 flex justify-start">
                <button 
                    onClick={onClose} 
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200 active:scale-95"
                >
                    <BackIcon />
                    <span className="hidden sm:inline">{t('back')}</span>
                </button>
            </div>

            {/* Center: Navigation & Identity */}
            <div className="flex-1 flex items-center gap-2 sm:gap-4 justify-center">
                <button onClick={() => onNavigate('prev')} disabled={!hasPrev} className={navButtonClass}>
                    <LeftArrowIcon />
                </button>
                
                <div className="text-center px-2">
                    <h2 
                        className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs" 
                        style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                    >
                        {pair.left.name} + {pair.right.name}
                    </h2>
                </div>
                
                <button onClick={() => onNavigate('next')} disabled={!hasNext} className={navButtonClass}>
                    <RightArrowIcon />
                </button>
            </div>

            {/* Right: Actions */}
            <div className="flex-1 flex items-center justify-end gap-2">
                <button 
                    onClick={onAutoKern} 
                    disabled={isAutoKerning} 
                    title={autoLabel} 
                    className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-teal-400 transition-all active:scale-95 shadow-sm"
                >
                    {isAutoKerning ? (
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                        <SparklesIcon />
                    )}
                    <span className="hidden xl:inline font-semibold">{autoLabel}</span>
                </button>
                
                {!settings.isAutosaveEnabled && (
                    <button 
                        onClick={onSave} 
                        title={t('save')} 
                        disabled={!isDirty} 
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 transition-all active:scale-95 shadow-md"
                    >
                        <SaveIcon />
                        <span className="hidden xl:inline font-semibold">{t('save')}</span>
                    </button>
                )}
                
                <button 
                    onClick={onRemove} 
                    title={t('removeKerning')} 
                    className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all active:scale-95 shadow-sm"
                >
                    <TrashIcon />
                    <span className="hidden xl:inline font-semibold">{t('delete')}</span>
                </button>
            </div>
        </header>
    );
};

export default React.memo(KerningEditorHeader);