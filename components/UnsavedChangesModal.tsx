

import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onClose: () => void;      // Corresponds to "Cancel"
  onDiscard: () => void;   // Corresponds to "Discard Changes"
  onSave: () => void;      // Corresponds to "Save & Close"
}

const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({ isOpen, onClose, onDiscard, onSave }) => {
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
            {t('discardChanges')}
          </button>
          <button onClick={onSave} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            {t('saveAndClose')}
          </button>
        </>
      }
    >
      <p>{t('unsavedChangesMessage')}</p>
    </Modal>
  );
};

export default React.memo(UnsavedChangesModal);