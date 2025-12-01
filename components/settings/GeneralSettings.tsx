
import React from 'react';
import { AppSettings, ToolRanges } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';

interface GeneralSettingsProps {
    settings: AppSettings;
    onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
    toolRanges: ToolRanges;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ settings, onSettingsChange, toolRanges }) => {
    const { t } = useLocale();

    const handleSettingChange = (key: keyof AppSettings, isNumeric: boolean = false) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onSettingsChange(prev => ({
            ...prev,
            [key]: isNumeric ? Number(e.target.value) : e.target.value
        }));
    };
    
    return (
        <div className="space-y-1">
            {/* Font Name Section - Moved to top as requested */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('fontName')} (For Export):
                </label>
                <input 
                    type="text" 
                    value={settings.fontName} 
                    onChange={handleSettingChange('fontName')} 
                    className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-lg font-semibold text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">This name will be used inside the exported OTF file.</p>
            </div>

            {/* Tools Configuration Section */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow space-y-6">
                <h4 className="text-lg font-bold text-gray-900 dark:text-white">Tool Configuration</h4>
                
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
            </div>
        </div>
    );
};

export default React.memo(GeneralSettings);
