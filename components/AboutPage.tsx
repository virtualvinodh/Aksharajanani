

import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon, DonateIcon } from '../constants';
import Footer from './Footer';

interface AboutPageProps {
  onClose: () => void;
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

const ContentBlock: React.FC<{ titleKey: string; contentKey: string }> = ({ titleKey, contentKey }) => {
    const { t } = useLocale();
    return (
        <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-inner">
            <h3 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 mb-4">{t(titleKey)}</h3>
            <p className="leading-relaxed whitespace-pre-line">
                {renderFormattedText(t(contentKey))}
            </p>
        </div>
    );
};


const AboutPage: React.FC<AboutPageProps> = ({ onClose }) => {
  const { t } = useLocale();
  const DONATE_URL = "https://www.paypal.com/donate?token=YWBpb_jURmkXX4Yh3cHdhZ_ovPEVBSvFSKel-86NfowUil2tyOqW-2t11MxcXAcedyH-INjfCQJTvd92";

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
        >
          <BackIcon />
          <span className="hidden sm:inline">{t('back')}</span>
        </button>
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('aboutTitle')}</h2>
        </div>
        <div className="w-24 hidden sm:block"></div>
      </header>
      <main className="flex-grow overflow-y-auto p-6 md:p-10 text-gray-700 dark:text-gray-300">
        <div className="max-w-4xl mx-auto">
          <blockquote className="text-center italic text-xl text-gray-600 dark:text-gray-400 border-l-4 border-indigo-500 pl-4 py-2 my-8">
            <p>"{t('aboutQuote')}"</p>
            <footer className="text-base not-italic text-gray-500 dark:text-gray-500 mt-2">- {t('aboutQuoteAuthor')}</footer>
          </blockquote>

          <p className="text-lg leading-relaxed mb-8">
            {renderFormattedText(t('aboutDescription'))}
          </p>

          <div className="space-y-8">
            <ContentBlock titleKey="aboutHowItWorksTitle" contentKey="aboutHowItWorksContent" />
            <ContentBlock titleKey="aboutYourRoleTitle" contentKey="aboutYourRoleContent" />
            <ContentBlock titleKey="aboutAdvancedTitle" contentKey="aboutAdvancedContent" />
            <ContentBlock titleKey="aboutNameOriginTitle" contentKey="aboutNameOriginContent" />
          </div>

          <div className="mt-10 text-center bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 p-6 rounded-lg">
            <h3 className="text-2xl font-semibold text-green-700 dark:text-green-300 mb-4">{t('supportProjectTitle')}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t('supportProjectMessage')}
            </p>
            <a
              href={DONATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-md"
            >
              <DonateIcon />
              <span>{t('donateAction')}</span>
            </a>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default React.memo(AboutPage);