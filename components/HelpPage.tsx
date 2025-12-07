
import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon } from '../constants';
import Footer from './Footer';
import { ScriptConfig } from '../types';

interface HelpPageProps {
  onClose: () => void;
  scripts: ScriptConfig[];
}

const renderFormattedText = (text: string): React.ReactNode => {
    const parts = text.split('**');
    return (
        <>
            {parts.map((part, index) => {
                if (index % 2 === 1) {
                    return <strong key={index} className="font-semibold text-gray-800 dark:text-gray-200">{part}</strong>;
                }
                return part;
            })}
        </>
    );
};

const AccordionItem: React.FC<{ title: string; children: React.ReactNode }> = React.memo(({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-gray-200 dark:border-gray-700">
            <h2>
                <button
                    type="button"
                    className="flex items-center justify-between w-full p-5 font-medium text-left text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
                >
                    <span className="text-lg">{title}</span>
                    <svg
                        className={`w-6 h-6 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                        ></path>
                    </svg>
                </button>
            </h2>
            <div className={`${isOpen ? 'block' : 'hidden'} p-5 border-t-0 border-gray-200 dark:border-gray-700`}>
                <div className="mb-2 text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed">
                    {children}
                </div>
            </div>
        </div>
    );
});

const HelpPage: React.FC<HelpPageProps> = ({ onClose, scripts }) => {
  const { locale, t: appT } = useLocale();
  const [helpTranslations, setHelpTranslations] = useState<Record<string, string> | null>(null);
  const [fallbackTranslations, setFallbackTranslations] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const fetchHelpTranslations = async () => {
        try {
            const [localeRes, fallbackRes] = await Promise.all([
                fetch(`/locales/help/${locale}.json`),
                fetch(`/locales/help/en.json`) // Always fetch English as fallback
            ]);

            if (localeRes.ok) {
                setHelpTranslations(await localeRes.json());
            } else {
                console.warn(`Could not load help translations for ${locale}.`);
                setHelpTranslations({}); // Set to empty to avoid re-fetching
            }

            if (fallbackRes.ok) {
                setFallbackTranslations(await fallbackRes.json());
            } else {
                console.error("Could not load fallback English help translations.");
                setFallbackTranslations({});
            }
        } catch (error) {
            console.error("Error fetching help translation files:", error);
        }
    };
    fetchHelpTranslations();
  }, [locale]);

  const hT = useCallback((key: string) => {
    if (!helpTranslations || !fallbackTranslations) return key; 
    return helpTranslations[key] || fallbackTranslations[key] || key;
  }, [helpTranslations, fallbackTranslations]);

  const getSupportLevelText = (support: string | undefined): string => {
      if (support === 'full') return appT('supportLevelFull');
      if (support === 'partial') return appT('supportLevelPartial');
      return '';
  };

  if (!helpTranslations || !fallbackTranslations) {
    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col items-center justify-center">
            <p className="text-xl animate-pulse text-gray-700 dark:text-gray-300">Loading Help...</p>
        </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
        >
          <BackIcon />
          <span className="hidden sm:inline">{appT('back')}</span>
        </button>
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{hT('helpTitle')}</h2>
        </div>
        <div className="w-24 hidden sm:block"></div>
      </header>
      <main className="flex-grow overflow-y-auto p-6 md:p-10 text-gray-700 dark:text-gray-300">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg shadow-md">
            <AccordionItem title={hT('helpQuickStartTitle')}>
                {renderFormattedText(hT('helpQuickStartContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpWorkflowTitle')}>
                {renderFormattedText(hT('helpWorkflowContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpDrawingTitle')}>
                {renderFormattedText(hT('helpDrawingContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpPositioningTitle')}>
                {renderFormattedText(hT('helpPositioningContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpKerningTitle')}>
                {renderFormattedText(hT('helpKerningContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpRulesTitle')}>
                {renderFormattedText(hT('helpRulesContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpExportingTitle')}>
                {renderFormattedText(hT('helpExportingContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpCustomScriptTitle')}>
                {renderFormattedText(hT('helpCustomScriptContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpCompareTitle')}>
                {renderFormattedText(hT('helpCompareContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpSettingsTitle')}>
                {renderFormattedText(hT('helpSettingsContent'))}
            </AccordionItem>
            <AccordionItem title={hT('helpSupportedScriptsTitle')}>
                <ul className="list-disc list-inside space-y-3 text-gray-600 dark:text-gray-400">
                    {scripts.map(script => {
                        const supportLevel = getSupportLevelText(script.support);
                        return (
                            <li key={script.id}>
                                <strong className="text-gray-800 dark:text-gray-200">{appT(script.nameKey)}</strong>
                                {supportLevel && <span className="text-xs font-semibold ml-2 px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{supportLevel}</span>}
                                :
                                {appT(`${script.nameKey}Message`) && <span className="text-sm italic ml-2">{appT(`${script.nameKey}Message`)}</span>}
                            </li>
                        );
                    })}
                </ul>
            </AccordionItem>
          </div>
        </div>
      </main>
      <Footer hideOnMobile={true} />
    </div>
  );
};

export default React.memo(HelpPage);
