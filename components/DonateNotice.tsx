import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { DonateIcon } from '../constants';

interface DonateNoticeProps {
  onClose: () => void;
}

const DONATE_URL = "https://www.paypal.com/donate?token=YWBpb_jURmkXX4Yh3cHdhZ_ovPEVBSvFSKel-86NfowUil2tyOqW-2t11MxcXAcedyH-INjfCQJTvd92";

const DonateNotice: React.FC<DonateNoticeProps> = ({ onClose }) => {
  const { t } = useLocale();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-indigo-600/95 dark:bg-indigo-700/95 backdrop-blur-sm text-white p-4 z-50 flex items-center justify-center gap-4 animate-fade-in-up shadow-2xl">
      <div className="flex-shrink-0">
        <DonateIcon />
      </div>
      <p className="text-sm sm:text-base font-medium flex-grow text-center">
        {t('donateNoticeMessage')}
      </p>
      <div className="flex items-center gap-3 flex-shrink-0">
        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-white text-indigo-600 font-bold rounded-lg hover:bg-gray-200 transition-colors text-sm"
        >
          {t('donateAction')}
        </a>
        <button
          onClick={onClose}
          title={t('close')}
          className="p-2 rounded-full hover:bg-white/20 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default React.memo(DonateNotice);