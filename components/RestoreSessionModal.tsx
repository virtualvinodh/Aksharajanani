

import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface RestoreSessionModalProps {
  isOpen: boolean;
  onRestore: () => void;
  onStartFresh: () => void;
}

const RestoreSessionModal: React.FC<RestoreSessionModalProps> = ({ isOpen, onRestore, onStartFresh }) => {
  const { t } = useLocale();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onStartFresh} // Default close action is to start fresh
      title={t('restoreSessionTitle')}
      closeOnBackdropClick={false}
      footer={
        <>
          <button
            onClick={onStartFresh}
            className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
          >
            {t('startFreshAction')}
          </button>
          <button
            onClick={onRestore}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('restoreSessionAction')}
          </button>
        </>
      }
    >
      <p>{t('restoreSessionMessage')}</p>
    </Modal>
  );
};

export default React.memo(RestoreSessionModal);