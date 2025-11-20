import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface FeaErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  errorMessage: string;
}

const FeaErrorModal: React.FC<FeaErrorModalProps> = ({ isOpen, onClose, onConfirm, errorMessage }) => {
  const { t } = useLocale();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('feaErrorModalTitle')}
      titleClassName="text-yellow-600 dark:text-yellow-400"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
            {t('exportAnyway')}
          </button>
        </>
      }
    >
      <p className="mb-4">{t('feaErrorModalMessage')}</p>
      <pre className="bg-gray-100 dark:bg-gray-900 text-red-600 dark:text-red-400 p-3 rounded-md text-sm overflow-x-auto max-h-40">{errorMessage}</pre>
    </Modal>
  );
};

export default React.memo(FeaErrorModal);