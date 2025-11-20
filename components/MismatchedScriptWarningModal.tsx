import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface MismatchedScriptWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loadedScriptName: string | undefined;
  currentScriptName: string;
}

const MismatchedScriptWarningModal: React.FC<MismatchedScriptWarningModalProps> = ({ isOpen, onClose, onConfirm, loadedScriptName, currentScriptName }) => {
  const { t } = useLocale();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('mismatchedScriptTitle')}
      titleClassName="text-yellow-600 dark:text-yellow-400"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
            {t('loadAnyway')}
          </button>
        </>
      }
    >
      <p>{t('mismatchedScriptMessage', { loadedScript: loadedScriptName || 'an unknown script', currentScript: currentScriptName })}</p>
    </Modal>
  );
};

export default React.memo(MismatchedScriptWarningModal);