import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSaveAndConfirm: () => void;
  title: string;
  message: string;
  confirmActionText: string;
  saveAndConfirmActionText: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, onSaveAndConfirm, title, message, confirmActionText, saveAndConfirmActionText }) => {
  const { t } = useLocale();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 transition-colors">
            {confirmActionText}
          </button>
          <button onClick={onSaveAndConfirm} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            {saveAndConfirmActionText}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
};

export default React.memo(ConfirmationModal);
