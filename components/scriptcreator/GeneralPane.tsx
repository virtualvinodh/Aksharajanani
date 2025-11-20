
import React from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { ScriptConfig, FontMetrics, ScriptDefaults, GuideFont, TestPageConfig } from '../../types';

interface GeneralPaneProps {
    metrics: FontMetrics;
    setMetrics: React.Dispatch<React.SetStateAction<FontMetrics>>;
    defaults: ScriptDefaults;
    setDefaults: React.Dispatch<React.SetStateAction<ScriptDefaults>>;
    scriptName: string;
    handleScriptNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    scriptId: string;
    scriptIdError: string | null;
    availableScripts: ScriptConfig[];
    onLoadTemplate: (id: string) => void;
    sampleText: string;
    setSampleText: React.Dispatch<React.SetStateAction<string>>;
    guideFont: GuideFont;
    setGuideFont: React.Dispatch<React.SetStateAction<GuideFont>>;
    testPage: TestPageConfig;
    setTestPage: React.Dispatch<React.SetStateAction<TestPageConfig>>;
    grid: { characterNameSize: number };
    setGrid: React.Dispatch<React.SetStateAction<{ characterNameSize: number }>>;
}

const GeneralPane: React.FC<GeneralPaneProps> = ({ 
    metrics, setMetrics, defaults, setDefaults, scriptName, handleScriptNameChange, 
    scriptId, scriptIdError, availableScripts, onLoadTemplate,
    sampleText, setSampleText, guideFont, setGuideFont, testPage, setTestPage,
    grid, setGrid
}) => {
    const { t } = useLocale();
    const handleMetricChange = (key: keyof FontMetrics) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const isNumeric = e.target.type === 'number';
        setMetrics(m => ({
            ...m,
            [key]: isNumeric ? (value === '' ? undefined : parseFloat(value)) : value
        }));
    };
    
    const handleDefaultValueChange = (key: keyof ScriptDefaults, value: string | number | boolean) => {
        setDefaults(d => ({...d, [key]: value}));
    };

    const handleGuideFontChange = (key: keyof GuideFont) => (e: React.ChangeEvent<HTMLInputElement>) => setGuideFont(g => ({...g, [key]: e.target.value }));
    
    const handleTestPageChange = (
        category: 'fontSize' | 'lineHeight'
    ) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value) || 0;
        setTestPage(tp => {
            const newTp = JSON.parse(JSON.stringify(tp)); // Deep copy
            newTp[category].default = value;
            return newTp;
        });
    };

    const handleGridChange = (key: 'characterNameSize') => (e: React.ChangeEvent<HTMLInputElement>) => {
        setGrid(g => ({...g, [key]: parseFloat(e.target.value) || 0 }));
    };

    const MetricInput: React.FC<{ metricKey: keyof FontMetrics, isString?: boolean }> = ({ metricKey, isString }) => (
        <div>
            <label className="font-semibold text-sm">{t(`fontMetrics${metricKey.charAt(0).toUpperCase() + metricKey.slice(1)}`)}:</label>
            <input 
                type={isString ? 'text' : 'number'} 
                value={metrics[metricKey] as any ?? ''} 
                onChange={handleMetricChange(metricKey)}
                className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"
            />
        </div>
    );

    return (
    <div className="space-y-6">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-2">{t('generalTabDescription')}</h3>
        </div>
        
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
            <div>
                <label className="font-semibold">{t('loadFromTemplate')}:</label>
                <select
                    onChange={(e) => onLoadTemplate(e.target.value)}
                    className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"
                >
                    <option value="">{t('selectTemplate')}</option>
                    {availableScripts.map((script: ScriptConfig) => (
                        <option key={script.id} value={script.id}>{t(script.nameKey)}</option>
                    ))}
                </select>
            </div>
        </div>
        
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
            <h4 className="text-lg font-bold">{t('scriptInformation')}</h4>
            <div>
                <label className="font-semibold">{t('scriptNameLabel')}:</label>
                <input type="text" value={scriptName} onChange={handleScriptNameChange} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/>
                {scriptIdError && <p className="text-red-500 text-sm mt-1">{scriptIdError}</p>}
            </div>
            <div>
                <label className="font-semibold">{t('scriptIdLabel')}:</label>
                <input type="text" value={scriptId} readOnly className="w-full p-2 border rounded mt-1 bg-gray-100 dark:bg-gray-700 dark:border-gray-600"/>
            </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
            <h4 className="text-lg font-bold">{t('fontDefaults')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="font-semibold">{t('fontName')}:</label>
                    <input type="text" value={defaults.fontName} onChange={(e) => handleDefaultValueChange('fontName', e.target.value)} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div>
                    <label className="font-semibold">{t('strokeThickness')}:</label>
                    <input type="number" value={defaults.strokeThickness} onChange={(e) => handleDefaultValueChange('strokeThickness', parseFloat(e.target.value) || 0)} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div>
                    <label className="font-semibold">{t('pathSmoothing')}:</label>
                    <input type="number" step="0.1" value={defaults.pathSimplification} onChange={(e) => handleDefaultValueChange('pathSimplification', parseFloat(e.target.value) || 0)} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div>
                    <label className="font-semibold">{t('editorMode')}:</label>
                    <select value={defaults.editorMode} onChange={(e) => handleDefaultValueChange('editorMode', e.target.value as 'simple' | 'advanced')} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600">
                        <option value="simple">{t('simpleMode')}</option>
                        <option value="advanced">{t('advancedMode')}</option>
                    </select>
                </div>
                <div className="flex items-center gap-4 col-span-1 md:col-span-2 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={defaults.showGridOutlines} onChange={(e) => handleDefaultValueChange('showGridOutlines', e.target.checked)} className="h-4 w-4 rounded accent-indigo-500" />
                        <span>{t('showBackgroundHints')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={defaults.isAutosaveEnabled} onChange={(e) => handleDefaultValueChange('isAutosaveEnabled', e.target.checked)} className="h-4 w-4 rounded accent-indigo-500" />
                        <span>{t('enableAutosave')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={defaults.isPrefillEnabled} onChange={(e) => handleDefaultValueChange('isPrefillEnabled', e.target.checked)} className="h-4 w-4 rounded accent-indigo-500" />
                        <span>{t('enableCompositePrefill')}</span>
                    </label>
                </div>
            </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
             <h4 className="text-lg font-bold">{t('fontMetrics')}</h4>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricInput metricKey="unitsPerEm" />
                <MetricInput metricKey="ascender" />
                <MetricInput metricKey="descender" />
                <MetricInput metricKey="defaultAdvanceWidth" />
                <MetricInput metricKey="superTopLineY" />
                <MetricInput metricKey="topLineY" />
                <MetricInput metricKey="baseLineY" />
                <MetricInput metricKey="subBaseLineY" />
                <MetricInput metricKey="styleName" isString />
                <MetricInput metricKey="spaceAdvanceWidth" />
                <MetricInput metricKey="defaultLSB" />
                <MetricInput metricKey="defaultRSB" />
            </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
            <h4 className="text-lg font-bold">{t('editorGridSettings')}</h4>
            <div>
                <label className="font-semibold">{t('characterNameSize')}:</label>
                <input 
                    type="number" 
                    value={grid.characterNameSize} 
                    onChange={handleGridChange('characterNameSize')} 
                    className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"
                />
            </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
            <h4 className="text-lg font-bold">{t('sampleText')}</h4>
            <p className="text-sm text-gray-500">{t('sampleTextDescription')}</p>
            <textarea value={sampleText} onChange={e => setSampleText(e.target.value)} rows={5} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
            <h4 className="text-lg font-bold">{t('guideFontSettings')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="font-semibold">{t('guideFontName')}:</label><input type="text" value={guideFont.fontName} onChange={handleGuideFontChange('fontName')} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/></div>
                <div><label className="font-semibold">{t('guideFontUrl')}:</label><input type="text" value={guideFont.fontUrl} onChange={handleGuideFontChange('fontUrl')} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/></div>
                <div className="md:col-span-2"><label className="font-semibold">{t('guideFontStylisticSet')}:</label><input type="text" value={guideFont.stylisticSet} onChange={handleGuideFontChange('stylisticSet')} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/></div>
            </div>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4">
            <h4 className="text-lg font-bold">{t('testPageSettings')}</h4>
            <div>
                <label className="font-semibold">{t('defaultFontSize')}:</label>
                <input type="number" value={testPage.fontSize.default} onChange={handleTestPageChange('fontSize')} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/>
            </div>
             <div>
                <label className="font-semibold">{t('defaultLineHeight')}:</label>
                <input type="number" step="0.05" value={testPage.lineHeight.default} onChange={handleTestPageChange('lineHeight')} className="w-full p-2 border rounded mt-1 dark:bg-gray-700 dark:border-gray-600"/>
            </div>
        </div>
    </div>
    );
};

export default GeneralPane;
