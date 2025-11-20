

import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface DeleteProjectConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectName: string;
}

const DeleteProjectConfirmationModal: React.FC<DeleteProjectConfirmationModalProps> = ({ isOpen, onClose, onConfirm, projectName }) => {
  const { t } = useLocale();
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('deleteProjectTitle')}
      titleClassName="text-red-600 dark:text-red-400"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
            {t('delete')}
          </button>
        </>
      }
    >
      <p>{t('deleteProjectMessage', { name: projectName })}</p>
    </Modal>
  );
};

export default React.memo(DeleteProjectConfirmationModal);