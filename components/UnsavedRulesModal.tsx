

import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface UnsavedRulesModalProps {
  isOpen: boolean;
  onClose: () => void;      // Cancel
  onDiscard: () => void;   // Discard & Continue
  onSave: () => void;      // Save & Continue
}

const UnsavedRulesModal: React.FC<UnsavedRulesModalProps> = ({ isOpen, onClose, onDiscard, onSave }) => {
  const { t } = useLocale();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('unsavedChangesTitle')}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={onDiscard} className="px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 transition-colors">
            {t('discardAndContinue')}
          </button>
          <button onClick={onSave} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            {t('saveAndContinue')}
          </button>
        </>
      }
    >
      <p>{t('unsavedRulesMessage')}</p>
    </Modal>
  );
};

export default React.memo(UnsavedRulesModal);