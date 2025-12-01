
import React from 'react';
import { AppSettings } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useTheme } from '../../contexts/ThemeContext';
import LanguageSelector from '../LanguageSelector';

interface EditorSettingsProps {
    settings: AppSettings;
    onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const EditorSettings: React.FC<EditorSettingsProps> = ({ settings, onSettingsChange }) => {
    const { t } = useLocale();
    const { theme, setTheme } = useTheme();
    
    const handleToggleChange = (key: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onSettingsChange(prev => ({ ...prev, [key]: e.target.checked }));
    };

    return (
        <div className="space-y-8">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">                
                <div className="flex flex-col gap-6">
                    <div className="max-w-sm">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t('language')}
                        </label>
                        <LanguageSelector />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t('theme')}
                        </label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setTheme('light')}
                                className={`px-3 py-1.5 rounded-md font-medium text-sm border-2 transition-colors ${
                                    theme === 'light' 
                                    ? 'bg-indigo-600 text-white border-indigo-600' 
                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                                }`}
                            >
                                {t('themeLight')}
                            </button>
                            <button
                                onClick={() => setTheme('dark')}
                                className={`px-3 py-1.5 rounded-md font-medium text-sm border-2 transition-colors ${
                                    theme === 'dark' 
                                    ? 'bg-indigo-500 text-white border-indigo-500' 
                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                                }`}
                            >
                                {t('themeDark')}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6 flex-wrap pt-2">
                        <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300 select-none">
                            <input type="checkbox" checked={settings.showGridOutlines} onChange={handleToggleChange('showGridOutlines')} className="h-4 w-4 rounded accent-indigo-500" />
                            <span>{t('showBackgroundHints')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300 select-none">
                            <input type="checkbox" checked={settings.isAutosaveEnabled} onChange={handleToggleChange('isAutosaveEnabled')} className="h-4 w-4 rounded accent-indigo-500" />
                            <span>{t('enableAutosave')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300 select-none">
                            <input type="checkbox" checked={settings.isPrefillEnabled !== false} onChange={handleToggleChange('isPrefillEnabled')} className="h-4 w-4 rounded accent-indigo-500" />
                            <span>{t('enableCompositePrefill')}</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-8 space-y-8">
                <h4 className="text-lg font-bold text-yellow-600 dark:text-yellow-400">Debugging Tools</h4>
                <div>
                    <label className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        <span>{t('debugKerning')}</span>
                        <div className="relative inline-flex items-center">
                            <input
                                type="checkbox"
                                id="debug-kerning-toggle"
                                className="sr-only peer"
                                checked={settings.isDebugKerningEnabled ?? false}
                                onChange={handleToggleChange('isDebugKerningEnabled')}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </div>
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('debugKerningDescription')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default React.memo(EditorSettings);
