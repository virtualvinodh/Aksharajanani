import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppSettings, TestPageConfig } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { useTheme } from '../contexts/ThemeContext';
import { BackIcon, TEST_PAGE_RANGES, UndoIcon } from '../constants';
import Footer from './Footer';

interface FontTestPageProps {
  fontBlob: Blob | null;
  feaError: string | null;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
  testText: string;
  onTestTextChange: (text: string) => void;
  testPageConfig: TestPageConfig;
  defaults: {
    fontSize: number;
    lineHeight: number;
    sampleText: string;
  };
}

const FONT_FACE_ID = 'dynamic-font-test-style';

const FontTestPage: React.FC<FontTestPageProps> = ({ 
    fontBlob, feaError, settings, onSettingsChange, onClose, testText, onTestTextChange, testPageConfig, defaults
}) => {
  const { t } = useLocale();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feaWarning, setFeaWarning] = useState<string | null>(null);
  
  // Use settings directly instead of local state for persistence
  const fontSize = settings.testPage?.fontSize.default ?? defaults.fontSize;
  const lineHeight = settings.testPage?.lineHeight.default ?? defaults.lineHeight;

  const fontUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setFeaWarning(feaError);

    const existingStyleElement = document.getElementById(FONT_FACE_ID);
    if (existingStyleElement) {
      existingStyleElement.remove();
    }
    if (fontUrlRef.current) {
      URL.revokeObjectURL(fontUrlRef.current);
      fontUrlRef.current = null;
    }

    if (fontBlob) {
        try {
            const url = URL.createObjectURL(fontBlob);
            fontUrlRef.current = url;
            
            const styleElement = document.createElement('style');
            styleElement.id = FONT_FACE_ID;
            styleElement.innerHTML = `
              @font-face {
                font-family: "${settings.fontName}";
                src: url(${url}) format('opentype');
              }
            `;
            document.head.appendChild(styleElement);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(t('errorFontPreview', { error: errorMessage }));
        } finally {
            setIsLoading(false);
        }
    } else {
        setError(t('errorFontPreview', { error: 'No font data received for preview.' }));
        setIsLoading(false);
    }
    
    return () => {
      const styleElement = document.getElementById(FONT_FACE_ID);
      if (styleElement) {
        styleElement.remove();
      }
      if (fontUrlRef.current) {
        URL.revokeObjectURL(fontUrlRef.current);
      }
    };
  }, [fontBlob, feaError, settings.fontName, t]);

  const handleSettingChange = (key: 'fontSize' | 'lineHeight', value: number) => {
      const newSettings = { ...settings };
      if (!newSettings.testPage) {
          newSettings.testPage = JSON.parse(JSON.stringify(testPageConfig));
      }
      if (newSettings.testPage) {
          newSettings.testPage[key].default = value;
          onSettingsChange(newSettings);
      }
  };

  const handleReset = () => {
      const newSettings = { ...settings };
      
      // Reset Text
      // We update the settings directly to ensure atomic update with the sliders.
      // The parent App component will propagate this change back to the 'testText' prop.
      newSettings.customSampleText = defaults.sampleText;
      
      // Reset Sliders
      if (!newSettings.testPage) {
           newSettings.testPage = JSON.parse(JSON.stringify(testPageConfig));
      }
      if (newSettings.testPage) {
          newSettings.testPage.fontSize.default = defaults.fontSize;
          newSettings.testPage.lineHeight.default = defaults.lineHeight;
      }
      
      onSettingsChange(newSettings);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8">
            <svg className="animate-spin h-8 w-8 text-indigo-500 dark:text-indigo-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          <p className="text-xl animate-pulse text-gray-700 dark:text-gray-300">{t('generatingFont')}</p>
        </div>
      );
    }
    
    if (error) {
       return (
          <div className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 p-4 rounded-lg m-4">
            <p className="font-bold mb-2">Error</p>
            <p>{error}</p>
          </div>
       );
    }

    return (
      <>
        {feaWarning && (
            <div className="bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 p-4 rounded-lg mb-6">
                <p className="font-bold mb-2">Warning: OpenType Feature Compilation Failed</p>
                <p className="text-sm mb-2">The font preview is using basic character shapes, but advanced features like ligatures or special positioning may not work as expected.</p>
                <pre className="text-xs whitespace-pre-wrap bg-yellow-50 dark:bg-yellow-800/50 p-2 rounded">{feaWarning}</pre>
            </div>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('fontTestInstruction')}</p>
        <div className="flex flex-col gap-6">
          <div>
            <label htmlFor="font-test-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('inputTextLabel')}
            </label>
            <textarea
              id="font-test-input"
              value={testText}
              onChange={(e) => onTestTextChange(e.target.value)}
              className="w-full min-h-[160px] bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-4 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
              placeholder="Type here..."
              rows={6}
              style={{
                fontFamily: 'var(--guide-font-family)',
                fontFeatureSettings: 'var(--guide-font-feature-settings)'
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('fontPreviewLabel')}
            </label>
            <div
              aria-live="polite"
              className="w-full min-h-[160px] p-4 text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md"
              style={{
                fontFamily: `"${settings.fontName}"`,
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {testText || '\u00A0'}
            </div>
          </div>
        </div>
      </>
    );
  };
  
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          <BackIcon />
          <span className="hidden sm:inline">{t('back')}</span>
        </button>
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('fontTestGround')}</h2>
        </div>
        <div className="w-24 flex justify-end">
             <button 
                onClick={handleReset}
                title="Reset to Default"
                className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
            >
                <UndoIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{t('reset')}</span>
            </button>
        </div>
      </header>
      <main className="flex-grow overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-inner mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="font-size" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('fontSize')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{fontSize}px</span>
                    </label>
                    <input
                        id="font-size"
                        type="range"
                        min={TEST_PAGE_RANGES.fontSize.range.min}
                        max={TEST_PAGE_RANGES.fontSize.range.max}
                        step="1"
                        value={fontSize}
                        onChange={(e) => handleSettingChange('fontSize', Number(e.target.value))}
                        className="w-full h-2 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                        disabled={isLoading || !!error}
                    />
                </div>
                 <div>
                    <label htmlFor="line-height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('lineHeight')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{lineHeight.toFixed(2)}</span>
                    </label>
                    <input
                        id="line-height"
                        type="range"
                        min={TEST_PAGE_RANGES.lineHeight.range.min}
                        max={TEST_PAGE_RANGES.lineHeight.range.max}
                        step={TEST_PAGE_RANGES.lineHeight.range.step}
                        value={lineHeight}
                        onChange={(e) => handleSettingChange('lineHeight', Number(e.target.value))}
                        className="w-full h-2 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
                        disabled={isLoading || !!error}
                    />
                </div>
            </div>
          </div>
          {renderContent()}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default React.memo(FontTestPage);