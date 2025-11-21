
import React from 'react';
import { AppSettings, ToolRanges } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useTheme } from '../../contexts/ThemeContext';
import LanguageSelector from '../LanguageSelector';

interface GeneralSettingsProps {
    settings: AppSettings;
    onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
    toolRanges: ToolRanges;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ settings, onSettingsChange, toolRanges }) => {
    const { t } = useLocale();
    const { theme, setTheme } = useTheme();

    const handleSettingChange = (key: keyof AppSettings, isNumeric: boolean = false) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onSettingsChange(prev => ({
            ...prev,
            [key]: isNumeric ? Number(e.target.value) : e.target.value
        }));
    };
    
    const handleToggleChange = (key: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onSettingsChange(prev => ({ ...prev, [key]: e.target.checked }));
    };

    return (
        <div className="space-y-8">
            <div>
                <label htmlFor="stroke-thickness" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('strokeThickness')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{settings.strokeThickness}</span>
                </label>
                <input
                id="stroke-thickness"
                type="range"
                min={toolRanges.strokeThickness.min}
                max={toolRanges.strokeThickness.max}
                step="1"
                value={settings.strokeThickness}
                onChange={handleSettingChange('strokeThickness', true)}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>{t('thin')}</span>
                    <span>{t('thick')}</span>
                </div>
            </div>

            <div>
                <label htmlFor="contrast-ratio" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contrast Ratio (Thick/Thin): <span className="font-bold text-indigo-600 dark:text-indigo-400">{settings.contrast !== undefined ? settings.contrast.toFixed(2) : '1.00'}</span>
                </label>
                <input
                id="contrast-ratio"
                type="range"
                min={toolRanges.contrast.min}
                max={toolRanges.contrast.max}
                step="0.01"
                value={settings.contrast !== undefined ? settings.contrast : 1.0}
                onChange={handleSettingChange('contrast', true)}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>High Contrast (Calligraphic)</span>
                    <span>Monoline (Uniform)</span>
                </div>
            </div>
            
            <div>
                <label htmlFor="path-smoothing" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('pathSmoothing')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{settings.pathSimplification.toFixed(1)}</span>
                </label>
                <input
                id="path-smoothing"
                type="range"
                min={toolRanges.pathSimplification.min}
                max={toolRanges.pathSimplification.max}
                step="0.1"
                value={settings.pathSimplification}
                onChange={handleSettingChange('pathSimplification', true)}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>{t('less')}</span>
                    <span>{t('more')}</span>
                </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-8 space-y-8">
                <div>
                    <label className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        <span>{t('showBackgroundHints')}</span>
                        <div className="relative inline-flex items-center">
                            <input
                                type="checkbox"
                                id="show-grid-outlines"
                                className="sr-only peer"
                                checked={settings.showGridOutlines}
                                onChange={handleToggleChange('showGridOutlines')}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </div>
                    </label>
                </div>
                <div>
                    <label className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        <span>{t('enableAutosave')}</span>
                        <div className="relative inline-flex items-center">
                            <input
                                type="checkbox"
                                id="enable-autosave"
                                className="sr-only peer"
                                checked={settings.isAutosaveEnabled}
                                onChange={handleToggleChange('isAutosaveEnabled')}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </div>
                    </label>
                </div>
                <div>
                    <label className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        <span>{t('enableCompositePrefill')}</span>
                        <div className="relative inline-flex items-center">
                            <input
                                type="checkbox"
                                id="enable-prefill"
                                className="sr-only peer"
                                checked={settings.isPrefillEnabled !== false}
                                onChange={handleToggleChange('isPrefillEnabled')}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </div>
                    </label>
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('language')}
                </label>
                <LanguageSelector />
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('theme')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setTheme('light')}
                        className={`px-4 py-2 rounded-md font-semibold border-2 transition-colors ${
                            theme === 'light' 
                            ? 'bg-indigo-600 text-white border-indigo-600' 
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                    >
                        {t('themeLight')}
                    </button>
                    <button
                        onClick={() => setTheme('dark')}
                        className={`px-4 py-2 rounded-md font-semibold border-2 transition-colors ${
                            theme === 'dark' 
                            ? 'bg-indigo-500 text-white border-indigo-500' 
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                    >
                        {t('themeDark')}
                    </button>
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

export default React.memo(GeneralSettings);
