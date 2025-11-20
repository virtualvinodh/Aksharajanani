import React from 'react';
import { AppSettings } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { TEST_PAGE_RANGES } from '../../constants';

interface TestPageSettingsProps {
    settings: AppSettings;
    onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const TestPageSettings: React.FC<TestPageSettingsProps> = ({ settings, onSettingsChange }) => {
    const { t } = useLocale();

    const testPageConfig = settings.testPage;
    if (!testPageConfig) return null;

    const handleTestPageChange = (key: 'fontSize' | 'lineHeight', value: number) => {
        onSettingsChange(prev => ({
            ...prev,
            testPage: {
                ...prev.testPage!,
                [key]: {
                    ...prev.testPage![key],
                    default: value,
                }
            }
        }));
    };

    return (
        <div className="space-y-8">
            <div>
                <label htmlFor="test-page-font-size" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('fontSize')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{testPageConfig.fontSize.default}px</span>
                </label>
                <input
                    id="test-page-font-size"
                    type="range"
                    min={TEST_PAGE_RANGES.fontSize.range.min}
                    max={TEST_PAGE_RANGES.fontSize.range.max}
                    step="1"
                    value={testPageConfig.fontSize.default}
                    onChange={(e) => handleTestPageChange('fontSize', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                />
            </div>
            <div>
                <label htmlFor="test-page-line-height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('lineHeight')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{testPageConfig.lineHeight.default.toFixed(2)}</span>
                </label>
                <input
                    id="test-page-line-height"
                    type="range"
                    min={TEST_PAGE_RANGES.lineHeight.range.min}
                    max={TEST_PAGE_RANGES.lineHeight.range.max}
                    step={TEST_PAGE_RANGES.lineHeight.range.step}
                    value={testPageConfig.lineHeight.default}
                    onChange={(e) => handleTestPageChange('lineHeight', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                />
            </div>
        </div>
    );
};

export default React.memo(TestPageSettings);