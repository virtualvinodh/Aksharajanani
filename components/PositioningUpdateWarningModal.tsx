

import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface PositioningUpdateWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDiscard?: () => void;
  title: string;
  message: string;
  confirmActionText?: string;
  discardActionText?: string;
}

const PositioningUpdateWarningModal: React.FC<PositioningUpdateWarningModalProps> = ({ 
    isOpen, onClose, onConfirm, onDiscard, title, message, confirmActionText, discardActionText
}) => {
  const { t } = useLocale();
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      titleClassName="text-yellow-600 dark:text-yellow-400"
      footer={
        <>
          {onDiscard && (
            <button onClick={onDiscard} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">
              {discardActionText || t('cancel')}
            </button>
          )}
          <button onClick={onConfirm} className="px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 transition-colors">
            {confirmActionText || t('proceed')}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
};

export default React.memo(PositioningUpdateWarningModal);