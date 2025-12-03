
import React from 'react';
import { AppSettings, ToolRanges, GuideFont } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';

interface GeneralSettingsProps {
    settings: AppSettings;
    onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
    toolRanges: ToolRanges;
    guideFont: GuideFont;
    onGuideFontChange: React.Dispatch<React.SetStateAction<GuideFont>>;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ 
    settings, onSettingsChange, toolRanges, guideFont, onGuideFontChange 
}) => {
    const { t } = useLocale();

    const handleSettingChange = (key: keyof AppSettings, isNumeric: boolean = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onSettingsChange(prev => ({
            ...prev,
            [key]: isNumeric ? Number(e.target.value) : e.target.value
        }));
    };
    
    const handleGuideFontChange = (key: keyof GuideFont) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onGuideFontChange(prev => ({
            ...prev,
            [key]: e.target.value
        }));
    };
    
    return (
        <div className="space-y-6">
            {/* Font Name Section */}
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

            {/* Guide Font Section (New Step 4) */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow space-y-4">
                <h4 className="text-lg font-bold text-gray-900 dark:text-white">{t('guideFontSettings')}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Configure a reference font to appear in the background while you draw.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('guideFontName')}</label>
                        <input 
                            type="text" 
                            value={guideFont.fontName} 
                            onChange={handleGuideFontChange('fontName')} 
                            placeholder="e.g. Noto Sans"
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('guideFontUrl')}</label>
                        <input 
                            type="text" 
                            value={guideFont.fontUrl} 
                            onChange={handleGuideFontChange('fontUrl')} 
                            placeholder="https://..."
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-sm"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('guideFontStylisticSet')}</label>
                        <input 
                            type="text" 
                            value={guideFont.stylisticSet} 
                            onChange={handleGuideFontChange('stylisticSet')} 
                            placeholder="e.g. 'ss01' or 'normal'"
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Sample Text Section (New Step 4) */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('sampleText')}</h4>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('sampleTextDescription')}
                </label>
                <textarea 
                    value={settings.customSampleText || ''} 
                    onChange={handleSettingChange('customSampleText')}
                    rows={4} 
                    className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-sm"
                />
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
