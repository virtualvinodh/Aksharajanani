
import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { SpinnerIcon } from '../constants';

interface AutoKerningProgressModalProps {
  isOpen: boolean;
  progress: number;
}

const AutoKerningProgressModal: React.FC<AutoKerningProgressModalProps> = ({ isOpen, progress }) => {
  const { t } = useLocale();

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-gray-900/80 z-50 flex items-center justify-center p-4 animate-fade-in-up" style={{ animationDuration: '0.2s' }}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-4 mb-4">
            <SpinnerIcon />
            <h2 id="modal-title" className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('autoKerningInProgress')}
            </h2>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{t('autoKerningStarted')}</p>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
          <div
            className="bg-indigo-600 h-4 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          ></div>
        </div>
        <p className="mt-2 text-lg font-semibold text-indigo-600 dark:text-indigo-400">{progress}%</p>
      </div>
    </div>
  );
};

export default React.memo(AutoKerningProgressModal);
