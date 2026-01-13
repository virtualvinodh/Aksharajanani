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
    isAutosaveEnabled: boolean;
}

const KerningEditorHeader: React.FC<KerningEditorHeaderProps> = ({
    pair, onClose, onNavigate, hasPrev, hasNext, onAutoKern, isAutoKerning, onSave, onRemove, isDirty, isAutosaveEnabled
}) => {
    const { t } = useLocale();

    const navButtonClass = "p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors";

    return (
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 z-20">
            <div className="flex items-center justify-between p-2 sm:p-4 gap-4">
                {/* Left: Back */}
                <div className="flex-shrink-0">
                    <button onClick={onClose} className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <BackIcon /><span className="hidden sm:inline">{t('back')}</span>
                    </button>
                </div>

                {/* Center: Navigation & Identity */}
                <div className="flex items-center gap-2 sm:gap-4 flex-grow justify-center">
                    <button onClick={() => onNavigate('prev')} disabled={!hasPrev} className={navButtonClass}><LeftArrowIcon /></button>
                    <div className="text-center min-w-[80px]">
                        <h2 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                            {pair.left.name} + {pair.right.name}
                        </h2>
                    </div>
                    <button onClick={() => onNavigate('next')} disabled={!hasNext} className={navButtonClass}><RightArrowIcon /></button>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <button onClick={onAutoKern} disabled={isAutoKerning} title={t('autoKern')} className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-teal-400 transition-colors shadow-sm">
                        {isAutoKerning ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <SparklesIcon />}
                    </button>
                    {!isAutosaveEnabled && (
                        <button onClick={onSave} title={t('save')} disabled={!isDirty} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors shadow-sm">
                            <SaveIcon />
                        </button>
                    )}
                    <button onClick={onRemove} title={t('removeKerning')} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm">
                        <TrashIcon />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default React.memo(KerningEditorHeader);